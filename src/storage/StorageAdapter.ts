import type { StateStorage } from "zustand/middleware";

/**
 * v0 uses Zustand's `persist` middleware whose `storage` option already
 * abstracts the actual store. Swapping to SQLite later means writing a new
 * `StateStorage` implementation that returns/accepts JSON strings — no
 * component touches it.
 *
 * The persisted blob carries a top-level `version` (handled by Zustand) so
 * future schema migrations have a hook.
 */
export type BustaStorage = StateStorage;
