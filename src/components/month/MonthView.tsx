import { useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useShallow } from "zustand/react/shallow";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { selectFilteredGoogleEventsByDay, useStore } from "../../store";
import { CalendarModeToggle } from "./CalendarModeToggle";
import { dayDropId } from "../../dnd/dragIds";
import {
  compactTimeLabel,
  formatMonthYear,
  fromISODate,
  isInSameMonth,
  isToday,
  monthGridDays,
  shiftMonth,
  toISODate,
  todayISO,
  weekdayLabels,
} from "../../lib/date";
import type { ISODate, Task, TimeBlock } from "../../types/domain";
import { isEventDeclined, type GoogleEvent } from "../../google/calendar";

const MAX_CHIPS_PER_CELL = 3;
const EMPTY_BLOCKS: Record<string, TimeBlock> = {};

// Layout constants used to position the spanning all-day bars over cells.
const DATE_HEIGHT = 22;
const BAR_HEIGHT = 16;
const BAR_GAP = 2;
const BARS_TOP_OFFSET = 4; // gap between date number and first bar lane

export function MonthView() {
  const weekAnchor = useStore((s) => s.ui.weekAnchor);
  const setActiveDay = useStore((s) => s.setActiveDay);
  const setWeekAnchor = useStore((s) => s.setWeekAnchor);
  const setCalendarMode = useStore((s) => s.setCalendarMode);
  const openTask = useStore((s) => s.openTask);

  const anchor = fromISODate(weekAnchor);
  const shiftByMonths = (delta: number) =>
    setWeekAnchor(toISODate(shiftMonth(anchor, delta)));

  const tasksRecord = useStore((s) => s.tasks);
  const tasksByDay = useMemo(() => {
    const out: Record<string, Task[]> = {};
    for (const t of Object.values(tasksRecord)) {
      if (!t.day) continue;
      (out[t.day] ??= []).push(t);
    }
    for (const list of Object.values(out)) list.sort((a, b) => a.order - b.order);
    return out;
  }, [tasksRecord]);

  const timeBlocksRecord = useStore((s) => s.timeBlocks);
  // For each day, which tasks have a TimeBlock on that day (for time-prefix
  // rendering in chips).
  const blocksByDayByTask = useMemo(() => {
    const out: Record<string, Record<string, TimeBlock>> = {};
    for (const b of Object.values(timeBlocksRecord)) {
      (out[b.day] ??= {})[b.taskId] = b;
    }
    return out;
  }, [timeBlocksRecord]);
  const eventsByDay = useStore(useShallow(selectFilteredGoogleEventsByDay));

  const days = useMemo(() => monthGridDays(anchor), [anchor]);
  const weekRows = useMemo(() => {
    const rows: ISODate[][] = [];
    for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
    return rows;
  }, [days]);
  const weekdays = useMemo(() => weekdayLabels(), []);

  const jumpToWeek = (day: ISODate) => {
    setActiveDay(day);
    setWeekAnchor(day);
    setCalendarMode("week");
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 items-center justify-between border-b border-(--color-border) px-4 text-sm">
        <div className="flex items-center gap-2">
          <CalendarModeToggle />
          <div className="mx-1 h-4 w-px bg-(--color-border)" />
          <button
            onClick={() => setWeekAnchor(todayISO())}
            className="rounded-md border border-(--color-border) px-2 py-1 text-xs font-medium hover:bg-(--color-surface-muted)"
          >
            Today
          </button>
          <button
            aria-label="Previous month"
            onClick={() => shiftByMonths(-1)}
            className="rounded-md p-1 text-(--color-text-muted) hover:bg-(--color-surface-muted)"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            aria-label="Next month"
            onClick={() => shiftByMonths(1)}
            className="rounded-md p-1 text-(--color-text-muted) hover:bg-(--color-surface-muted)"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <h1 className="text-base font-semibold tracking-tight">{formatMonthYear(anchor)}</h1>
      </header>

      <div className="grid shrink-0 grid-cols-7 border-b border-(--color-border) bg-(--color-surface-muted)/40">
        {weekdays.map((w) => (
          <div
            key={w}
            className="px-2 py-1.5 text-[11px] uppercase tracking-wider text-(--color-text-subtle)"
          >
            {w}
          </div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 auto-rows-fr">
        {weekRows.map((row, i) => (
          <WeekRow
            key={i}
            days={row}
            anchor={anchor}
            tasksByDay={tasksByDay}
            eventsByDay={eventsByDay}
            blocksByDayByTask={blocksByDayByTask}
            onJumpToWeek={jumpToWeek}
            onOpenTask={openTask}
          />
        ))}
      </div>
    </div>
  );
}

interface WeekRowProps {
  days: ISODate[];
  anchor: Date;
  tasksByDay: Record<string, Task[]>;
  eventsByDay: Record<string, GoogleEvent[]>;
  blocksByDayByTask: Record<string, Record<string, TimeBlock>>;
  onJumpToWeek: (day: ISODate) => void;
  onOpenTask: (id: string) => void;
}

interface SpanPlacement {
  event: GoogleEvent;
  firstColumn: number;
  lastColumn: number;
  lane: number;
}

function WeekRow({
  days,
  anchor,
  tasksByDay,
  eventsByDay,
  blocksByDayByTask,
  onJumpToWeek,
  onOpenTask,
}: WeekRowProps) {
  const { placements, lanesUsed } = useMemo(() => {
    // Dedupe all-day events by groupId within this week row only — events
    // that cross the week boundary get a separate bar in the next row.
    const groups = new Map<
      string,
      { event: GoogleEvent; firstColumn: number; lastColumn: number }
    >();
    days.forEach((day, idx) => {
      for (const e of eventsByDay[day] ?? []) {
        if (!e.isAllDay) continue;
        const existing = groups.get(e.groupId);
        if (existing) existing.lastColumn = Math.max(existing.lastColumn, idx);
        else
          groups.set(e.groupId, { event: e, firstColumn: idx, lastColumn: idx });
      }
    });
    // Lane-pack: greedy assignment by start column, longest first within same start.
    const sorted = [...groups.values()].sort((a, b) => {
      if (a.firstColumn !== b.firstColumn) return a.firstColumn - b.firstColumn;
      return b.lastColumn - b.firstColumn - (a.lastColumn - a.firstColumn);
    });
    const lanes: number[] = [];
    const out: SpanPlacement[] = [];
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
  }, [days, eventsByDay]);

  const barsBlockHeight =
    lanesUsed > 0
      ? lanesUsed * BAR_HEIGHT + (lanesUsed - 1) * BAR_GAP + BARS_TOP_OFFSET
      : 0;
  const itemsTop = DATE_HEIGHT + barsBlockHeight;

  return (
    <div className="relative grid grid-cols-7 border-t border-(--color-border) first:border-t-0">
      {days.map((day) => (
        <DayCell
          key={day}
          day={day}
          anchor={anchor}
          tasks={tasksByDay[day] ?? []}
          timedEvents={(eventsByDay[day] ?? []).filter((e) => !e.isAllDay)}
          blocksByTask={blocksByDayByTask[day] ?? EMPTY_BLOCKS}
          itemsTop={itemsTop}
          onJump={() => onJumpToWeek(day)}
          onOpenTask={onOpenTask}
        />
      ))}
      {placements.map((p) => (
        <SpanBar
          key={p.event.id}
          event={p.event}
          firstColumn={p.firstColumn}
          lastColumn={p.lastColumn}
          totalColumns={days.length}
          top={DATE_HEIGHT + BARS_TOP_OFFSET + p.lane * (BAR_HEIGHT + BAR_GAP)}
        />
      ))}
    </div>
  );
}

interface DayCellProps {
  day: ISODate;
  anchor: Date;
  tasks: Task[];
  timedEvents: GoogleEvent[];
  blocksByTask: Record<string, TimeBlock>;
  itemsTop: number;
  onJump: () => void;
  onOpenTask: (id: string) => void;
}

interface CellItem {
  key: string;
  startMinute: number | null;
  node: React.ReactNode;
}

function DayCell({
  day,
  anchor,
  tasks,
  timedEvents,
  blocksByTask,
  itemsTop,
  onJump,
  onOpenTask,
}: DayCellProps) {
  const inMonth = isInSameMonth(day, anchor);
  const today = isToday(day);
  const { setNodeRef, isOver } = useDroppable({
    id: dayDropId(day),
    data: { type: "day", day, context: "month" },
  });

  // Merge timed events and tasks into one list. Scheduled tasks (with a
  // TimeBlock on this day) get a start time so they intermix with timed
  // events by time. Unscheduled tasks sort to the bottom.
  const items: CellItem[] = [];
  for (const e of timedEvents) {
    items.push({
      key: `e-${e.id}`,
      startMinute: e.startMinute,
      node: <EventChip event={e} />,
    });
  }
  for (const t of tasks) {
    const block = blocksByTask[t.id];
    // Recurring tasks have no TimeBlock — surface their template time instead.
    const startMinute =
      block?.startMinute ?? t.recurrenceTime?.startMinute ?? null;
    items.push({
      key: `t-${t.id}`,
      startMinute,
      node: (
        <TaskChip
          task={t}
          startMinute={startMinute ?? undefined}
          onOpen={() => onOpenTask(t.id)}
        />
      ),
    });
  }
  items.sort((a, b) => {
    if (a.startMinute === null && b.startMinute === null) return 0;
    if (a.startMinute === null) return 1;
    if (b.startMinute === null) return -1;
    return a.startMinute - b.startMinute;
  });
  const visible = items.slice(0, MAX_CHIPS_PER_CELL);
  const overflow = items.length - visible.length;

  return (
    <button
      ref={setNodeRef}
      onClick={onJump}
      className={`group relative flex flex-col items-stretch overflow-hidden border-r border-(--color-border) p-1.5 text-left transition-colors hover:bg-(--color-surface-muted)/60 ${
        inMonth ? "" : "bg-(--color-surface-muted)/30 text-(--color-text-subtle)"
      } ${today ? "bg-(--color-today)/40" : ""} ${
        isOver ? "ring-2 ring-(--color-accent)/60 ring-inset" : ""
      }`}
    >
      <div className="flex items-baseline justify-between" style={{ height: DATE_HEIGHT }}>
        <span
          className={`text-xs tabular-nums ${
            today
              ? "rounded-full bg-(--color-today-strong) px-1.5 py-0.5 font-semibold text-white"
              : inMonth
                ? "font-medium text-(--color-text)"
                : ""
          }`}
        >
          {Number(day.slice(8))}
        </span>
      </div>
      <div
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden"
        style={{ marginTop: itemsTop - DATE_HEIGHT }}
      >
        {visible.map((item) => (
          <div key={item.key}>{item.node}</div>
        ))}
        {overflow > 0 && (
          <div className="px-1 text-[10px] text-(--color-text-subtle)">
            +{overflow} more
          </div>
        )}
      </div>
    </button>
  );
}

interface SpanBarProps {
  event: GoogleEvent;
  firstColumn: number;
  lastColumn: number;
  totalColumns: number;
  top: number;
}

function SpanBar({
  event,
  firstColumn,
  lastColumn,
  totalColumns,
  top,
}: SpanBarProps) {
  const openEvent = useStore((s) => s.openEvent);
  const colWidth = 100 / totalColumns;
  const left = colWidth * firstColumn;
  const width = colWidth * (lastColumn - firstColumn + 1);
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
        top,
        left: `calc(${left}% + 2px)`,
        width: `calc(${width}% - 4px)`,
        height: BAR_HEIGHT,
        background: bg,
        borderLeft: `2px solid ${border}`,
        opacity: declined ? 0.55 : 1,
      }}
      title={`${event.summary} (all day)`}
      className="z-10 flex cursor-pointer items-center overflow-hidden rounded-sm px-1.5 text-[11px] leading-tight hover:brightness-95"
    >
      <span
        className={`truncate ${declined ? "text-(--color-text-subtle) line-through" : "text-(--color-text)"}`}
      >
        {event.summary}
      </span>
    </div>
  );
}

function EventChip({ event }: { event: GoogleEvent }) {
  const openEvent = useStore((s) => s.openEvent);
  const declined = isEventDeclined(event);
  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    openEvent(event.groupId);
  };
  return (
    <div
      onClick={open}
      title={event.summary}
      className="flex items-center gap-1 truncate rounded-sm px-1 py-0.5 text-[11px] leading-tight hover:brightness-95"
      style={{
        background: event.backgroundColor
          ? `${event.backgroundColor}33`
          : "var(--color-surface-muted)",
        borderLeft: `2px solid ${event.backgroundColor ?? "var(--color-text-subtle)"}`,
        opacity: declined ? 0.55 : 1,
      }}
    >
      <span className="shrink-0 tabular-nums text-(--color-text-subtle)">
        {compactTimeLabel(event.startMinute)}
      </span>
      <span
        className={`min-w-0 flex-1 truncate ${declined ? "text-(--color-text-subtle) line-through" : "text-(--color-text)"}`}
      >
        {event.summary}
      </span>
    </div>
  );
}

function TaskChip({
  task,
  startMinute,
  onOpen,
}: {
  task: Task;
  startMinute?: number;
  onOpen: () => void;
}) {
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={`flex items-center gap-1 truncate rounded-sm border-l-2 border-(--color-accent) bg-(--color-surface) px-1 py-0.5 text-[11px] leading-tight hover:border-(--color-accent) hover:bg-(--color-accent-soft) ${
        task.completedAt ? "text-(--color-text-subtle) line-through" : ""
      }`}
    >
      {startMinute != null && (
        <span className="shrink-0 tabular-nums text-(--color-text-subtle)">
          {compactTimeLabel(startMinute)}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{task.title || "Untitled"}</span>
    </div>
  );
}
