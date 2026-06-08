# busta

Personal Sunsama + Google Calendar replacement. Native macOS app (eventually iOS), keyboard-first, with two-way Google Calendar sync.

This is a personal project, not a product. No support, no roadmap, no guarantees.

## Stack

- **Frontend** — React 19 + TypeScript + Vite, Tailwind v4, Zustand (with `persist`), dnd-kit, Tiptap, react-hotkeys-hook, date-fns, lucide-react.
- **Shell** — Tauri 2 (Rust). Compiles to a native macOS `.app`; iOS later.
- **Sync** — Google Calendar API v3, PKCE OAuth via a Rust loopback HTTP server. Multi-account. Supports attendee invites and Google Meet links.

## What it does

- **Week board** with drag-and-drop scheduling onto a 24-hour timeline.
- **Calendar views** — Month grid and Calendar Week.
- **Backlog drawer** for unscheduled tasks.
- **Recurring tasks** — daily / weekdays / weekly, with per-day completion state and optional per-instance time blocks.
- **Categories** with color tags.
- **Tiptap notes editor** on every task.
- **Two-way Google Calendar sync** — local time blocks push as GCal events; external events appear read-only on the timeline.
- **Keyboard-first navigation** — see `?` in-app for the full shortcut list.

## Local development

Requires Node.js, pnpm or npm, and the Rust toolchain (for Tauri).

```bash
npm install
npm run dev          # web app at localhost:1420
npm run tauri dev    # native macOS window
```

Google sync requires a Google Cloud OAuth client. Copy your client ID/secret into a gitignored `.env.local`:

```
VITE_GOOGLE_CLIENT_ID=...
VITE_GOOGLE_CLIENT_SECRET=...
```

## Build

```bash
npm run tauri build
```

Produces a signed `.app` in `src-tauri/target/release/bundle/macos/`.

## Layout

```
src/
├── components/   # board, timeline, month/week calendar, backlog, search, google
├── store/        # Zustand store, persistence, selectors
├── google/       # OAuth, calendar API, sync engine
├── dnd/          # dnd-kit provider + handlers
├── hotkeys/      # global keyboard bindings
├── lib/          # date, color, recurrence, id, timeline geometry
├── styles/       # Tailwind theme tokens
└── types/        # domain.ts — Task, TimeBlock, Category
src-tauri/        # Rust shell, OAuth loopback server, window state
```
