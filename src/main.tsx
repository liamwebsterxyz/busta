import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";

window.addEventListener("error", (e) => {
  console.error("[window.error]", e.error ?? e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[unhandledrejection]", e.reason);
});

// Tauri's WKWebView doesn't bind reload shortcuts by default — wire them so
// Cmd+R / Ctrl+R cleanly reload the React tree.
window.addEventListener(
  "keydown",
  (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === "r" || e.key === "R")) {
      e.preventDefault();
      location.reload();
    }
  },
  true,
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
