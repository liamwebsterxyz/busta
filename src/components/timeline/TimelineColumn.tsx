import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useShallow } from "zustand/react/shallow";
import {
  selectBlocksForDay,
  selectGoogleEventsForDay,
  selectRecurringScheduledForDay,
  useStore,
} from "../../store";
import { isToday } from "../../lib/date";
import {
  HOUR_PX,
  MIN_BLOCK_MINUTES,
  SNAP_MINUTES,
  clampMinute,
  snapToInterval,
} from "../../lib/timeline";
import { timelineDropId } from "../../dnd/dragIds";
import { TimeBlockView } from "./TimeBlockView";
import { RecurringBlockView } from "./RecurringBlockView";
import { GoogleEventView } from "../google/GoogleEventView";
import type { ISODate } from "../../types/domain";

interface Props {
  day: ISODate;
  withGrid?: boolean;
  /** If true, click-drag on empty space creates a new task + time block. */
  allowCreate?: boolean;
}

export function TimelineColumn({ day, withGrid = true, allowCreate = false }: Props) {
  const blocks = useStore(useShallow((s) => selectBlocksForDay(s, day)));
  const googleEvents = useStore(useShallow((s) => selectGoogleEventsForDay(s, day)));
  const recurringScheduled = useStore(
    useShallow((s) => selectRecurringScheduledForDay(s, day)),
  );
  const addTask = useStore((s) => s.addTask);
  const addTimeBlock = useStore((s) => s.addTimeBlock);
  const openTask = useStore((s) => s.openTask);

  const { setNodeRef, isOver } = useDroppable({
    id: timelineDropId(day),
    data: { type: "timeline", day },
  });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const setRefs = (node: HTMLDivElement | null) => {
    containerRef.current = node;
    setNodeRef(node);
  };

  const [draft, setDraft] = useState<{ startPx: number; endPx: number } | null>(null);
  const showNowLine = isToday(day);
  const nowMinute = useNowMinute(showNowLine);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!allowCreate) return;
    if (e.button !== 0) return;
    if (e.target !== e.currentTarget) return; // only empty area
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const initialY = e.clientY - rect.top;
    setDraft({ startPx: initialY, endPx: initialY });

    const onMove = (ev: PointerEvent) => {
      const r = containerRef.current?.getBoundingClientRect();
      if (!r) return;
      setDraft({ startPx: initialY, endPx: ev.clientY - r.top });
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);

      const r = containerRef.current?.getBoundingClientRect();
      const finalEnd = r ? ev.clientY - r.top : initialY;
      const topPx = Math.min(initialY, finalEnd);
      const bottomPx = Math.max(initialY, finalEnd);
      const startMinute = clampMinute(snapToInterval((topPx / HOUR_PX) * 60, SNAP_MINUTES));
      let durationMinutes = snapToInterval(
        ((bottomPx - topPx) / HOUR_PX) * 60,
        SNAP_MINUTES,
      );
      if (durationMinutes < MIN_BLOCK_MINUTES) durationMinutes = MIN_BLOCK_MINUTES;

      setDraft(null);

      const task = addTask({ title: "", day, estimateMinutes: durationMinutes });
      addTimeBlock({ taskId: task.id, day, startMinute, durationMinutes });
      openTask(task.id);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const draftTop = draft ? Math.min(draft.startPx, draft.endPx) : 0;
  const draftHeight = draft ? Math.abs(draft.endPx - draft.startPx) : 0;

  return (
    <div
      ref={setRefs}
      onPointerDown={onPointerDown}
      className={`relative h-full transition-colors ${
        isOver ? "bg-(--color-accent-soft)/40" : ""
      } ${allowCreate ? "cursor-crosshair" : ""}`}
    >
      {withGrid &&
        Array.from({ length: 24 }, (_, h) => (
          <div
            key={h}
            className="pointer-events-none absolute left-0 right-0 border-t border-(--color-border)"
            style={{ top: h * HOUR_PX }}
          />
        ))}
      {googleEvents
        .filter((e) => !e.isAllDay)
        .map((e) => (
          <GoogleEventView key={e.id} event={e} hourPx={HOUR_PX} />
        ))}
      {blocks.map((b) => (
        <TimeBlockView key={b.id} block={b} hourPx={HOUR_PX} />
      ))}
      {recurringScheduled.map((t) => (
        <RecurringBlockView key={`rec:${t.id}`} task={t} day={day} hourPx={HOUR_PX} />
      ))}
      {draft && (
        <div
          className="pointer-events-none absolute left-1 right-1 rounded-md border border-dashed border-(--color-accent) bg-(--color-accent-soft)/60"
          style={{ top: draftTop, height: Math.max(8, draftHeight) }}
        />
      )}
      {showNowLine && (
        <div
          className="pointer-events-none absolute left-0 right-0 z-10"
          style={{ top: (nowMinute / 60) * HOUR_PX }}
        >
          <div className="h-px bg-(--color-today-strong)" />
          <div className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-(--color-today-strong)" />
        </div>
      )}
    </div>
  );
}

function useNowMinute(enabled: boolean) {
  const [m, setM] = useState(currentMinuteOfDay());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setM(currentMinuteOfDay()), 60_000);
    return () => clearInterval(id);
  }, [enabled]);
  return m;
}

function currentMinuteOfDay() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

