import { useRef, useState } from "react";
import { CalendarCheck, CalendarDays, CalendarRange, Inbox, Plug } from "lucide-react";
import { useStore } from "../../store";
import type { CalendarMode, View } from "../../store";
import { startGoogleOAuth } from "../../google/oauth";
import { GoogleAccountPopover } from "../google/GoogleAccountPopover";

const TABS: { view: View; icon: typeof CalendarDays; label: string }[] = [
  { view: "week", icon: CalendarRange, label: "Week" },
  { view: "month", icon: CalendarDays, label: "Month" },
];

export function Sidebar() {
  const view = useStore((s) => s.ui.view);
  const setView = useStore((s) => s.setView);
  const setCalendarMode = useStore((s) => s.setCalendarMode);
  const backlogOpen = useStore((s) => s.ui.backlogDrawerOpen);
  const toggleBacklog = useStore((s) => s.toggleBacklogDrawer);
  const backlogCount = useStore(
    (s) => Object.values(s.tasks).filter((t) => t.day === null && !t.completedAt).length,
  );

  const selectView = (v: View, mode?: CalendarMode) => {
    setView(v);
    if (v === "month") setCalendarMode(mode ?? "month");
  };

  const openBacklog = () => {
    toggleBacklog();
  };

  return (
    <aside className="flex w-12 shrink-0 flex-col items-center border-r border-(--color-border) bg-(--color-surface) py-2">
      {TABS.map((t) => {
        const active = view === t.view;
        return (
          <button
            key={t.view}
            aria-label={t.label}
            title={t.label}
            onClick={() => selectView(t.view)}
            className={`mt-1 rounded-md p-1.5 transition-colors ${
              active
                ? "bg-(--color-surface-muted) text-(--color-text)"
                : "text-(--color-text-muted) hover:bg-(--color-surface-muted)"
            }`}
          >
            <t.icon size={16} />
          </button>
        );
      })}
      <button
        aria-label="Backlog"
        title="Backlog (b)"
        onClick={openBacklog}
        className={`relative mt-1 rounded-md p-1.5 transition-colors ${
          backlogOpen
            ? "bg-(--color-accent-soft) text-(--color-text)"
            : "text-(--color-text-muted) hover:bg-(--color-surface-muted)"
        }`}
      >
        <Inbox size={16} />
        {backlogCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 rounded-full bg-(--color-accent) px-1 text-[9px] font-medium tabular-nums leading-tight text-white">
            {backlogCount}
          </span>
        )}
      </button>

      <div className="mt-auto">
        <GoogleSidebarButton />
      </div>
    </aside>
  );
}

function GoogleSidebarButton() {
  const accountCount = useStore((s) => Object.keys(s.googleAccounts).length);
  const addAccount = useStore((s) => s.addGoogleAccount);
  const loading = useStore((s) => s.googleEvents.loading);
  const error = useStore((s) => s.googleEvents.error);
  const [connecting, setConnecting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Discards stale OAuth attempts if the user re-clicks while one is stuck.
  const attemptRef = useRef(0);

  const connect = async () => {
    console.log("[oauth] connect button clicked, accounts:", useStore.getState().googleAccounts);
    const myAttempt = ++attemptRef.current;
    setLocalError(null);
    setConnecting(true);
    try {
      const acc = await startGoogleOAuth();
      console.log("[oauth] flow complete, calling addAccount with", acc.email);
      if (attemptRef.current === myAttempt) addAccount(acc);
    } catch (err) {
      console.error("[oauth] flow failed:", err);
      if (attemptRef.current === myAttempt) {
        setLocalError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (attemptRef.current === myAttempt) setConnecting(false);
    }
  };

  if (accountCount === 0) {
    const label = connecting
      ? "Connecting… (click to restart)"
      : "Connect Google Calendar";
    return (
      <button
        aria-label={label}
        title={localError ?? label}
        onClick={connect}
        className="relative rounded-md p-1.5 text-(--color-text-muted) transition-colors hover:bg-(--color-surface-muted) hover:text-(--color-text)"
      >
        <Plug size={16} className={connecting ? "animate-pulse" : ""} />
        {localError && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500" />
        )}
      </button>
    );
  }

  const title = error
    ? `Google Calendar sync error: ${error}`
    : loading
      ? "Syncing Google Calendar…"
      : `${accountCount} Google account${accountCount === 1 ? "" : "s"} connected`;

  return (
    <>
      <button
        ref={buttonRef}
        aria-label="Google Calendar"
        title={title}
        onClick={() => setPopoverOpen((v) => !v)}
        className="relative rounded-md p-1.5 text-(--color-text-muted) transition-colors hover:bg-(--color-surface-muted) hover:text-(--color-text)"
      >
        <CalendarCheck size={16} className="text-(--color-complete)" />
        {accountCount > 1 && (
          <span className="absolute -right-0.5 -top-0.5 rounded-full bg-(--color-accent) px-1 text-[9px] font-medium leading-tight text-white">
            {accountCount}
          </span>
        )}
        {error && accountCount === 1 && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500" />
        )}
        {loading && !error && accountCount === 1 && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-(--color-accent)" />
        )}
      </button>
      {popoverOpen && (
        <GoogleAccountPopover
          anchor={buttonRef.current}
          onClose={() => setPopoverOpen(false)}
        />
      )}
    </>
  );
}
