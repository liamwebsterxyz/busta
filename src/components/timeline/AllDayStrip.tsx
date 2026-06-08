import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { selectFilteredGoogleEventsByDay, useStore } from "../../store";
import { isEventDeclined, type GoogleEvent } from "../../google/calendar";
import type { ISODate } from "../../types/domain";

interface Props {
  /** Days currently visible in the strip, in order. */
  days: ISODate[];
  /** Width of the left gutter (so the strip aligns with the timeline below). */
  gutterPx: number;
}

const LANE_HEIGHT = 18; // px
const LANE_GAP = 2;
const STRIP_VERTICAL_PADDING = 4;

interface Placement {
  event: GoogleEvent;
  firstColumn: number;
  lastColumn: number;
  lane: number;
}

/**
 * Horizontal strip of all-day Google events shown above the timed grid.
 *  - Multi-day events span the columns they cover as a single bar.
 *  - Bars are packed into lanes so overlapping events stack vertically
 *    instead of obscuring each other.
 *  - Renders nothing when there are no all-day events in the visible range.
 */
export function AllDayStrip({ days, gutterPx }: Props) {
  const eventsByDay = useStore(useShallow(selectFilteredGoogleEventsByDay));

  const { placements, lanesUsed } = useMemo(() => {
    // Dedupe across days by groupId; track the span within the visible window.
    const groups = new Map<
      string,
      { event: GoogleEvent; firstColumn: number; lastColumn: number }
    >();
    days.forEach((day, columnIdx) => {
      const list = eventsByDay[day] ?? [];
      for (const e of list) {
        if (!e.isAllDay) continue;
        const existing = groups.get(e.groupId);
        if (existing) {
          existing.lastColumn = Math.max(existing.lastColumn, columnIdx);
        } else {
          groups.set(e.groupId, {
            event: e,
            firstColumn: columnIdx,
            lastColumn: columnIdx,
          });
        }
      }
    });

    // Lane-pack: greedy assignment by start column, then by descending length.
    const sorted = [...groups.values()].sort((a, b) => {
      if (a.firstColumn !== b.firstColumn) return a.firstColumn - b.firstColumn;
      const lenA = a.lastColumn - a.firstColumn;
      const lenB = b.lastColumn - b.firstColumn;
      return lenB - lenA;
    });
    const lanes: number[] = []; // lanes[lane] = last column used
    const out: Placement[] = [];
    for (const g of sorted) {
      let lane = lanes.findIndex((last) => last < g.firstColumn);
      if (lane === -1) {
        lane = lanes.length;
        lanes.push(g.lastColumn);
      } else {
        lanes[lane] = g.lastColumn;
      }
      out.push({ ...g, lane });
    }
    return { placements: out, lanesUsed: lanes.length };
  }, [eventsByDay, days]);

  if (placements.length === 0) return null;

  const barsHeight =
    lanesUsed * LANE_HEIGHT +
    Math.max(0, lanesUsed - 1) * LANE_GAP +
    STRIP_VERTICAL_PADDING * 2;

  return (
    <div
      className="grid shrink-0 border-b border-(--color-border) bg-(--color-surface-muted)/30"
      style={{
        gridTemplateColumns: `${gutterPx}px repeat(${days.length}, minmax(0, 1fr))`,
      }}
    >
      <div
        className="flex items-start justify-end px-1.5 pt-1.5 text-[9px] uppercase tracking-wider text-(--color-text-subtle)"
      >
        all-day
      </div>
      <div
        className="relative"
        style={{
          gridColumn: `2 / span ${days.length}`,
          height: barsHeight,
        }}
      >
        {placements.map((p) => (
          <AllDayBar key={p.event.id} {...p} totalColumns={days.length} />
        ))}
      </div>
    </div>
  );
}

interface BarProps extends Placement {
  totalColumns: number;
}

function AllDayBar({ event, firstColumn, lastColumn, lane, totalColumns }: BarProps) {
  const openEvent = useStore((s) => s.openEvent);
  const colWidth = 100 / totalColumns;
  const left = colWidth * firstColumn;
  const width = colWidth * (lastColumn - firstColumn + 1);
  const top = STRIP_VERTICAL_PADDING + lane * (LANE_HEIGHT + LANE_GAP);
  const declined = isEventDeclined(event);

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    openEvent(event.groupId);
  };

  const bg = event.backgroundColor
    ? `${event.backgroundColor}33`
    : "var(--color-surface)";
  const border = event.backgroundColor ?? "var(--color-text-subtle)";

  return (
    <div
      onClick={onClick}
      style={{
        position: "absolute",
        left: `calc(${left}% + 2px)`,
        width: `calc(${width}% - 4px)`,
        top,
        height: LANE_HEIGHT,
        background: bg,
        borderLeft: `2px solid ${border}`,
        opacity: declined ? 0.55 : 1,
      }}
      title={`${event.summary} (all day)`}
      className="flex cursor-pointer items-center overflow-hidden rounded-sm px-1.5 text-[11px] leading-tight hover:brightness-95"
    >
      <span
        className={`truncate ${declined ? "text-(--color-text-subtle) line-through" : "text-(--color-text)"}`}
      >
        {event.summary}
      </span>
    </div>
  );
}
