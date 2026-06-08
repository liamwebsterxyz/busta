import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, Check, ChevronDown } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../../store";
import type { GooglePushTarget } from "../../store";

interface Props {
  value?: GooglePushTarget;
  onChange: (target: GooglePushTarget) => void;
}

const POPOVER_WIDTH = 256;

/**
 * Picks which connected Google account a task pushes to. Events always go to
 * that account's primary calendar — keeps the choice simple and matches
 * Sunsama's "one calendar per account" model.
 */
export function PushTargetPicker({ value, onChange }: Props) {
  const accounts = useStore(useShallow((s) => Object.values(s.googleAccounts)));
  const globalTarget = useStore((s) => s.googlePushTarget);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const effective = value ?? globalTarget;
  const effectiveAccount = effective
    ? accounts.find((a) => a.email === effective.accountEmail)
    : undefined;

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const left = Math.min(
        Math.max(8, r.left),
        window.innerWidth - POPOVER_WIDTH - 8,
      );
      setCoords({ top: r.bottom + 4, left });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (accounts.length === 0) {
    return (
      <div className="flex items-center gap-1.5 px-1.5 py-1 text-xs text-(--color-text-subtle)">
        <Calendar size={12} />
        <span>No Google account connected</span>
      </div>
    );
  }

  const label =
    effectiveAccount?.name ?? effectiveAccount?.email ?? "No account";
  const isDefault = !value;

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        title="Pick the account this gets pushed to"
        className="flex items-center gap-1.5 rounded-md border border-(--color-border) px-2 py-1 text-xs text-(--color-text-muted) hover:bg-(--color-surface-muted)"
      >
        <Calendar size={12} className="text-(--color-text-muted)" />
        <span className="max-w-[220px] truncate text-(--color-text)">{label}</span>
        {isDefault && (
          <span className="text-[10px] uppercase tracking-wider text-(--color-text-subtle)">
            default
          </span>
        )}
        <ChevronDown size={11} />
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              width: POPOVER_WIDTH,
              maxHeight: "60vh",
              zIndex: 60,
            }}
            className="flex flex-col overflow-hidden rounded-lg border border-(--color-border) bg-(--color-surface) text-sm shadow-xl"
          >
            <div className="border-b border-(--color-border) px-3 py-2 text-[10px] uppercase tracking-wider text-(--color-text-subtle)">
              Push to account
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {accounts.map((acc) => {
                const selected = effective?.accountEmail === acc.email;
                return (
                  <button
                    key={acc.email}
                    onClick={() => {
                      onChange({ accountEmail: acc.email, calendarId: "primary" });
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-(--color-surface-muted) ${
                      selected ? "bg-(--color-surface-muted)" : ""
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-(--color-text)">
                        {acc.name ?? acc.email}
                      </span>
                      {acc.name && (
                        <span className="block truncate text-[11px] text-(--color-text-subtle)">
                          {acc.email}
                        </span>
                      )}
                    </span>
                    {selected && <Check size={12} className="text-(--color-text)" />}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
