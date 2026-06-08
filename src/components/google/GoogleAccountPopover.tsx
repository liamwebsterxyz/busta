import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, LogOut, Plus, RefreshCw, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../../store";
import { listCalendars } from "../../google/calendar";
import { startGoogleOAuth } from "../../google/oauth";

interface Props {
  anchor: HTMLElement | null;
  onClose: () => void;
}

const POPOVER_WIDTH = 320;

export function GoogleAccountPopover({ anchor, onClose }: Props) {
  const accounts = useStore(useShallow((s) => Object.values(s.googleAccounts)));
  const byAccount = useStore(useShallow((s) => s.googleCalendars.byAccount));
  const selectedByAccount = useStore(
    useShallow((s) => s.googleCalendars.selectedByAccount),
  );
  const calsLoading = useStore((s) => s.googleCalendars.loading);
  const calsError = useStore((s) => s.googleCalendars.error);

  const addAccount = useStore((s) => s.addGoogleAccount);
  const removeAccount = useStore((s) => s.removeGoogleAccount);
  const toggleCalendar = useStore((s) => s.toggleCalendarSelected);
  const setCalsForAccount = useStore((s) => s.setGoogleCalendarsForAccount);
  const setCalsLoading = useStore((s) => s.setGoogleCalendarsLoading);
  const setCalsError = useStore((s) => s.setGoogleCalendarsError);

  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ bottom: number; left: number } | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!anchor) return;
    const update = () => {
      const r = anchor.getBoundingClientRect();
      const bottom = Math.max(8, window.innerHeight - r.bottom);
      const left = r.right + 8;
      const overflowRight = left + POPOVER_WIDTH - window.innerWidth + 8;
      setCoords({ bottom, left: overflowRight > 0 ? left - overflowRight : left });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [anchor]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchor?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [anchor, onClose]);

  const refreshAccount = (email: string) => {
    setCalsLoading(true);
    listCalendars(email)
      .then((cals) => setCalsForAccount(email, cals))
      .catch((err) =>
        setCalsError(err instanceof Error ? err.message : String(err)),
      )
      .finally(() => setCalsLoading(false));
  };

  const addAnother = async () => {
    setAddError(null);
    setAdding(true);
    try {
      const acc = await startGoogleOAuth();
      addAccount(acc);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  };

  const disconnect = (email: string) => {
    if (!confirm(`Disconnect ${email}?`)) return;
    removeAccount(email);
  };

  if (!coords) return null;

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        position: "fixed",
        bottom: coords.bottom,
        left: coords.left,
        width: POPOVER_WIDTH,
        maxHeight: "80vh",
        zIndex: 60,
      }}
      className="flex flex-col overflow-hidden rounded-lg border border-(--color-border) bg-(--color-surface) shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-(--color-border) px-3 py-2">
        <span className="text-[11px] uppercase tracking-wider text-(--color-text-subtle)">
          Google Calendar
        </span>
        <button
          onClick={onClose}
          className="rounded p-0.5 text-(--color-text-subtle) hover:bg-(--color-surface-muted) hover:text-(--color-text)"
        >
          <X size={13} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {accounts.length === 0 && (
          <div className="px-3 py-4 text-sm text-(--color-text-subtle)">
            No accounts connected yet.
          </div>
        )}
        {accounts.map((acc) => {
          const cals = byAccount[acc.email] ?? [];
          const selected = selectedByAccount[acc.email] ?? [];
          return (
            <div
              key={acc.email}
              className="border-b border-(--color-border) last:border-b-0"
            >
              <div className="group flex items-start justify-between gap-2 px-3 pt-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-(--color-text)">
                    {acc.name ?? acc.email}
                  </div>
                  {acc.name && (
                    <div className="truncate text-[11px] text-(--color-text-subtle)">
                      {acc.email}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => refreshAccount(acc.email)}
                    disabled={calsLoading}
                    title="Refresh calendars"
                    className="rounded p-1 text-(--color-text-subtle) hover:bg-(--color-surface-muted) hover:text-(--color-text) disabled:opacity-50"
                  >
                    <RefreshCw
                      size={11}
                      className={calsLoading ? "animate-spin" : ""}
                    />
                  </button>
                  <button
                    onClick={() => disconnect(acc.email)}
                    title="Disconnect account"
                    className="rounded p-1 text-(--color-text-subtle) opacity-60 hover:bg-(--color-surface-muted) hover:text-red-600 group-hover:opacity-100"
                  >
                    <LogOut size={11} />
                  </button>
                </div>
              </div>

              <div className="px-2 pb-2 pt-1">
                {calsError && cals.length === 0 && (
                  <div className="px-1.5 py-1 text-[11px] text-red-600">
                    {calsError}
                  </div>
                )}
                {!calsError && cals.length === 0 && !calsLoading && (
                  <div className="px-1.5 py-1 text-[11px] text-(--color-text-subtle)">
                    No calendars loaded — click refresh.
                  </div>
                )}
                {cals.map((c) => {
                  const checked = selected.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleCalendar(acc.email, c.id)}
                      className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-(--color-surface-muted)"
                      title={c.id}
                    >
                      <span
                        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border transition-colors ${
                          checked
                            ? "border-transparent text-white"
                            : "border-(--color-border-strong)"
                        }`}
                        style={{
                          background: checked
                            ? (c.backgroundColor ?? "var(--color-accent)")
                            : "transparent",
                        }}
                      >
                        {checked && <Check size={9} strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-(--color-text)">
                        {c.summary}
                        {c.primary && (
                          <span className="ml-1.5 text-[10px] text-(--color-text-subtle)">
                            primary
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-(--color-border) p-2">
        <button
          onClick={addAnother}
          disabled={adding}
          className="flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-(--color-text-muted) hover:bg-(--color-surface-muted) hover:text-(--color-text) disabled:opacity-60"
        >
          <Plus size={12} />
          {adding ? "Connecting…" : "Add another account"}
        </button>
        {addError && (
          <div className="mt-1 px-1.5 text-[10px] text-red-600" title={addError}>
            {addError.slice(0, 120)}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
