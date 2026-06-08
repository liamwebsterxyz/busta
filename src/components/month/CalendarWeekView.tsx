import { useEffect, useRef } from "react";
import { addDays } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useStore } from "../../store";
import { CalendarModeToggle } from "./CalendarModeToggle";
import {
  formatDayDate,
  formatDayLong,
  fromISODate,
  isToday,
  toISODate,
  todayISO,
  weekDays,
} from "../../lib/date";
import { HOUR_PX } from "../../lib/timeline";
import { TimelineGutter } from "../timeline/TimelineGutter";
import { TimelineColumn } from "../timeline/TimelineColumn";
import { AllDayStrip } from "../timeline/AllDayStrip";

const GUTTER_PX = 44; // matches TimelineGutter width

export function CalendarWeekView() {
  const weekAnchor = useStore((s) => s.ui.weekAnchor);
  const activeDay = useStore((s) => s.ui.activeDay);
  const setWeekAnchor = useStore((s) => s.setWeekAnchor);
  const setActiveDay = useStore((s) => s.setActiveDay);
  const scrollRef = useRef<HTMLDivElement>(null);
  const days = weekDays(fromISODate(weekAnchor));
  const rangeStart = days[0];
  const rangeEnd = days[6];

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_PX - 24;
  }, []);

  const shiftWeek = (delta: -1 | 1) => {
    setWeekAnchor(toISODate(addDays(fromISODate(weekAnchor), delta * 7)));
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-(--color-border) px-4 text-sm">
        <div className="flex items-center gap-2">
          <CalendarModeToggle />
          <div className="mx-1 h-4 w-px bg-(--color-border)" />
          <button
            onClick={() => {
              const t = todayISO();
              setWeekAnchor(t);
              setActiveDay(t);
            }}
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
        <span className="text-xs text-(--color-text-muted)">
          {formatDayLong(rangeStart)}, {formatDayDate(rangeStart)} —{" "}
          {formatDayLong(rangeEnd)}, {formatDayDate(rangeEnd)}
        </span>
      </header>

      {/* Day-name strip aligned with the columns below. */}
      <div
        className="grid shrink-0 border-b border-(--color-border) bg-(--color-surface-muted)/30 text-xs"
        style={{ gridTemplateColumns: `${GUTTER_PX}px repeat(7, minmax(0, 1fr))` }}
      >
        <div />
        {days.map((day) => {
          const today = isToday(day);
          const active = activeDay === day;
          return (
            <button
              key={day}
              onClick={() => setActiveDay(day)}
              className={`flex flex-col items-center py-2 transition-colors hover:bg-(--color-surface-muted)/60 ${
                active ? "bg-(--color-surface-muted)/70" : ""
              }`}
            >
              <span className="text-[10px] uppercase tracking-wider text-(--color-text-subtle)">
                {formatDayLong(day).slice(0, 3)}
              </span>
              <span
                className={`mt-0.5 text-sm tabular-nums ${
                  today
                    ? "rounded-full bg-(--color-today-strong) px-2 py-0.5 font-semibold text-white"
                    : "font-medium text-(--color-text)"
                }`}
              >
                {Number(day.slice(8))}
              </span>
            </button>
          );
        })}
      </div>

      <AllDayStrip days={days} gutterPx={GUTTER_PX} />

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `${GUTTER_PX}px repeat(7, minmax(0, 1fr))`,
            height: HOUR_PX * 24,
          }}
        >
          <TimelineGutter hourPx={HOUR_PX} />
          {days.map((day) => (
            <div
              key={day}
              className="relative border-l border-(--color-border)"
            >
              <TimelineColumn day={day} withGrid allowCreate />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
