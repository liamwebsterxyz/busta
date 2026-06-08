import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays } from "date-fns";
import { useStore } from "../../store";
import {
  formatDayDate,
  formatDayLong,
  fromISODate,
  toISODate,
  todayISO,
  weekDays,
} from "../../lib/date";
import { DayColumn } from "./DayColumn";

export function WeekBoard() {
  const weekAnchor = useStore((s) => s.ui.weekAnchor);
  const setWeekAnchor = useStore((s) => s.setWeekAnchor);

  const days = weekDays(fromISODate(weekAnchor));
  const rangeStart = days[0];
  const rangeEnd = days[6];

  const shiftWeek = (delta: -1 | 1) => {
    setWeekAnchor(toISODate(addDays(fromISODate(weekAnchor), delta * 7)));
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-(--color-border) px-4 text-sm">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekAnchor(todayISO())}
            className="rounded-md border border-(--color-border) px-2 py-1 text-xs font-medium hover:bg-(--color-surface-muted)"
          >
            Today
          </button>
          <button
            aria-label="Previous week"
            onClick={() => shiftWeek(-1)}
            className="rounded-md p-1 text-(--color-text-muted) hover:bg-(--color-surface-muted)"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            aria-label="Next week"
            onClick={() => shiftWeek(1)}
            className="rounded-md p-1 text-(--color-text-muted) hover:bg-(--color-surface-muted)"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-(--color-text-muted)">
            {formatDayLong(rangeStart)}, {formatDayDate(rangeStart)} —{" "}
            {formatDayLong(rangeEnd)}, {formatDayDate(rangeEnd)}
          </span>
          <span className="rounded border border-(--color-border) px-1.5 py-0.5 font-mono text-[10px] text-(--color-text-subtle)">
            ? for shortcuts
          </span>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-7 divide-x divide-(--color-border)">
        {days.map((day) => (
          <DayColumn key={day} day={day} />
        ))}
      </div>
    </div>
  );
}
