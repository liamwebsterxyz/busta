// Placeholder for the future Tauri SQLite adapter.
//
// Plan:
//   - Use @tauri-apps/plugin-sql with a single `state` table or per-entity tables.
//   - First run: read the JSON blob written by localStorageAdapter, INSERT rows,
//     mark migration complete, then switch the active adapter.
//   - Implement `StateStorage` so swap-in is a one-line change in src/store/index.ts.
//
// Intentionally empty for v0 — adding now would pull in a Rust plugin we don't
// need until we ship the native build.
export {};
