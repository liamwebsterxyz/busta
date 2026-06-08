import { useStore } from "../../store";
import type { CalendarMode } from "../../store";

const OPTIONS: { mode: CalendarMode; label: string }[] = [
  { mode: "month", label: "Month" },
  { mode: "week", label: "Week" },
];

export function CalendarModeToggle() {
  const mode = useStore((s) => s.ui.calendarMode);
  const setMode = useStore((s) => s.setCalendarMode);

  return (
    <div className="flex items-center rounded-md border border-(--color-border) p-0.5 text-xs">
      {OPTIONS.map((o) => {
        const active = mode === o.mode;
        return (
          <button
            key={o.mode}
            onClick={() => setMode(o.mode)}
            className={`rounded px-2 py-0.5 font-medium transition-colors ${
              active
                ? "bg-(--color-surface-muted) text-(--color-text)"
                : "text-(--color-text-muted) hover:text-(--color-text)"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
