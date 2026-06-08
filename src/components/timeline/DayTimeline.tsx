import { useEffect, useRef } from "react";
import { useStore } from "../../store";
import { formatDayDate, formatDayLong } from "../../lib/date";
import { HOUR_PX } from "../../lib/timeline";
import { TimelineGutter } from "./TimelineGutter";
import { TimelineColumn } from "./TimelineColumn";
import { AllDayStrip } from "./AllDayStrip";

const GUTTER_PX = 44;

export function DayTimeline() {
  const day = useStore((s) => s.ui.activeDay);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 7 * HOUR_PX - 24;
    }
  }, []);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 items-baseline gap-2 border-b border-(--color-border) px-4 text-sm">
        <span className="font-semibold tracking-tight">{formatDayLong(day)}</span>
        <span className="text-xs text-(--color-text-subtle)">{formatDayDate(day)}</span>
      </header>

      <AllDayStrip days={[day]} gutterPx={GUTTER_PX} />

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="relative flex" style={{ height: HOUR_PX * 24 }}>
          <TimelineGutter hourPx={HOUR_PX} />
          <div className="relative flex-1">
            <TimelineColumn day={day} withGrid allowCreate />
          </div>
        </div>
      </div>
    </div>
  );
}
