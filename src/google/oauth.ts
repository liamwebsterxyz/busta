import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET;

const SCOPES = [
  // Full calendar access — needed for 2-way sync (create/update/delete events).
  // Combines read-only of calendarList + RW on events.
  "https://www.googleapis.com/auth/calendar",
  "openid",
  "email",
  "profile",
];

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** ms epoch */
  expiresAt: number;
}

export interface ConnectedAccount {
  tokens: AuthTokens;
  email: string;
  name?: string;
  picture?: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  token_type: string;
  scope: string;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export async function startGoogleOAuth(): Promise<ConnectedAccount> {
  console.log("[oauth] startGoogleOAuth begin");
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      "Google credentials not configured. Add VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_CLIENT_SECRET to .env.local.",
    );
  }

  const codeVerifier = randomString(64);
  const codeChallenge = await sha256base64url(codeVerifier);
  const state = randomString(32);

  // Spawn the loopback server first so the port exists by the time the user
  // returns from Google.
  console.log("[oauth] invoking start_oauth_server");
  const port = await invoke<number>("start_oauth_server");
  console.log("[oauth] loopback port", port);
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  const callbackPromise = waitForCallback();

  const authUrl = new URL(AUTH_URL);
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES.join(" "));
  authUrl.searchParams.set("access_type", "offline");
  // `select_account` lets the user pick / add a Google account each time —
  // critical for connecting multiple accounts. `consent` ensures we get a
  // refresh_token even if the user has authorized busta before.
  authUrl.searchParams.set("prompt", "select_account consent");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  console.log("[oauth] opening browser to", authUrl.toString().slice(0, 80) + "...");
  await openUrl(authUrl.toString());

  console.log("[oauth] waiting for callback");
  const callbackPath = await callbackPromise;
  console.log("[oauth] callback received", callbackPath);
  const callbackUrl = new URL(`http://127.0.0.1${callbackPath}`);
  const error = callbackUrl.searchParams.get("error");
  if (error) throw new Error(`Google OAuth error: ${error}`);
  const code = callbackUrl.searchParams.get("code");
  const returnedState = callbackUrl.searchParams.get("state");
  if (!code) throw new Error("Google did not return an authorization code.");
  if (returnedState !== state) throw new Error("OAuth state mismatch (possible CSRF).");

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`Token exchange failed: ${await tokenRes.text()}`);
  }
  const tokenData: TokenResponse = await tokenRes.json();
  console.log("[oauth] token exchange OK, has refresh_token:", !!tokenData.refresh_token);
  if (!tokenData.refresh_token) {
    throw new Error(
      "No refresh token returned. Revoke busta in your Google Account (myaccount.google.com → Security → Third-party access) and try again.",
    );
  }

  const tokens: AuthTokens = {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: Date.now() + tokenData.expires_in * 1000,
  };

  const profileRes = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
  });
  const profile = (await profileRes.json()) as {
    email: string;
    name?: string;
    picture?: string;
  };
  console.log("[oauth] profile fetched", profile.email);

  return { tokens, email: profile.email, name: profile.name, picture: profile.picture };
}

export async function refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Refresh failed: ${await res.text()}`);
  const data: TokenResponse = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

function waitForCallback(timeoutMs = 2 * 60 * 1000): Promise<string> {
  return new Promise((resolve, reject) => {
    let unlisten: UnlistenFn | null = null;
    const timer = setTimeout(() => {
      unlisten?.();
      reject(new Error("Google sign-in timed out. Try again."));
    }, timeoutMs);
    listen<string>("oauth-callback", (event) => {
      clearTimeout(timer);
      unlisten?.();
      resolve(event.payload);
    })
      .then((u) => {
        unlisten = u;
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function randomString(len: number): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

async function sha256base64url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return base64url(new Uint8Array(hash));
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
