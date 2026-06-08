// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_autostart::MacosLauncher;

/// Start a one-shot HTTP loopback server on `127.0.0.1` on a random free port,
/// returning that port to the caller. When the user's browser is redirected
/// here by Google after sign-in, we read the first request, send a friendly
/// confirmation page, then emit an `oauth-callback` event back to the JS side
/// carrying the request path (which contains the `code` and `state` params).
#[tauri::command]
async fn start_oauth_server(app: AppHandle) -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    // Give up after 5 minutes if the user never completes the sign-in.
    listener
        .set_nonblocking(false)
        .map_err(|e| e.to_string())?;

    std::thread::spawn(move || {
        // We only want to accept a single connection for the OAuth callback.
        // A 5-minute hard timeout protects against the user closing the browser.
        let _ = listener.set_ttl(64);
        let accept = listener.accept();
        if let Ok((mut stream, _)) = accept {
            stream
                .set_read_timeout(Some(Duration::from_secs(10)))
                .ok();
            let mut buf = [0u8; 4096];
            let n = stream.read(&mut buf).unwrap_or(0);
            let request = String::from_utf8_lossy(&buf[..n]);

            // First line is e.g. "GET /callback?code=...&state=... HTTP/1.1"
            let path = request
                .lines()
                .next()
                .and_then(|line| line.split_whitespace().nth(1))
                .unwrap_or("/")
                .to_string();

            let body = "<!doctype html><html><head><meta charset='utf-8'>\
                <title>busta</title>\
                <style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;\
                background:#fafafa;color:#222;display:flex;align-items:center;justify-content:center;\
                height:100vh;margin:0;}div{text-align:center;}h2{font-weight:600;margin:0 0 .5rem;}\
                p{color:#666;margin:0;}</style></head><body><div>\
                <h2>busta is connected to Google Calendar</h2>\
                <p>You can close this window.</p></div></body></html>";
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            let _ = stream.write_all(response.as_bytes());
            let _ = stream.flush();
            drop(stream);

            let _ = app.emit("oauth-callback", path);
        }
    });

    Ok(port)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // Persists window size, position, maximized, and fullscreen state
        // across app launches.
        .plugin(tauri_plugin_window_state::Builder::default().build())
        // Launch at login. The frontend calls `enable()` on first run to opt
        // the user in; `LaunchAgent` is the macOS-recommended mechanism.
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        // macOS convention: red-X / Cmd-W hides the window to the dock
        // instead of quitting. Cmd-Q still quits.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![start_oauth_server])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Bring the window back when the user clicks the dock icon and no
            // windows are visible (the natural counterpart to hide-on-close).
            if let tauri::RunEvent::Reopen { has_visible_windows: false, .. } = event {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        });
}
