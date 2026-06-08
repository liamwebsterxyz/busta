import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { TimeBlock } from "../../types/domain";
import { minutesToLabel } from "../../lib/date";
import { colorByKey } from "../../lib/colors";
import { useStore } from "../../store";
import { blockDragId } from "../../dnd/dragIds";
import { MIN_BLOCK_MINUTES, SNAP_MINUTES, snapToInterval } from "../../lib/timeline";
import { pushTimeBlockToGoogle } from "../../google/sync";

interface Props {
  block: TimeBlock;
  hourPx: number;
}

type ResizeEdge = "top" | "bottom" | null;

export function TimeBlockView({ block, hourPx }: Props) {
  const task = useStore((s) => s.tasks[block.taskId]);
  const category = useStore((s) => (task?.categoryId ? s.categories[task.categoryId] : null));
  const color = colorByKey(category?.colorKey);
  const openTask = useStore((s) => s.openTask);
  const updateTimeBlock = useStore((s) => s.updateTimeBlock);

  const [draft, setDraft] = useState<{ startMinute: number; durationMinutes: number } | null>(null);
  const resizingRef = useRef<ResizeEdge>(null);

  const startMinute = draft?.startMinute ?? block.startMinute;
  const durationMinutes = draft?.durationMinutes ?? block.durationMinutes;
  const top = (startMinute / 60) * hourPx;
  const height = Math.max(18, (durationMinutes / 60) * hourPx);
  const endMinute = startMinute + durationMinutes;

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: blockDragId(block.id),
    data: { type: "block", blockId: block.id },
    disabled: resizingRef.current !== null,
  });

  const bg = color?.soft ?? "var(--color-accent-soft)";
  const border = color?.border ?? "var(--color-accent)";

  const beginResize = (edge: "top" | "bottom") => (e: ReactPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    resizingRef.current = edge;
    const startY = e.clientY;
    const initStart = block.startMinute;
    const initDuration = block.durationMinutes;
    (e.target as Element).setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      const deltaY = ev.clientY - startY;
      const deltaMin = (deltaY / hourPx) * 60;
      if (edge === "bottom") {
        const newDuration = Math.max(
          MIN_BLOCK_MINUTES,
          snapToInterval(initDuration + deltaMin, SNAP_MINUTES),
        );
        const clampedDuration = Math.min(newDuration, 1440 - initStart);
        setDraft({ startMinute: initStart, durationMinutes: clampedDuration });
      } else {
        const newStart = snapToInterval(initStart + deltaMin, SNAP_MINUTES);
        const initEnd = initStart + initDuration;
        const clampedStart = Math.max(0, Math.min(newStart, initEnd - MIN_BLOCK_MINUTES));
        setDraft({
          startMinute: clampedStart,
          durationMinutes: initEnd - clampedStart,
        });
      }
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      const final = draftRef.current;
      if (final) {
        updateTimeBlock(block.id, {
          startMinute: final.startMinute,
          durationMinutes: final.durationMinutes,
        });
        void pushTimeBlockToGoogle(block.id);
      }
      resizingRef.current = null;
      setDraft(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  // Keep a ref of the latest draft so the pointerup handler closes over fresh state.
  const draftRef = useRef(draft);
  draftRef.current = draft;

  return (
    <div
      ref={setNodeRef}
      style={{
        top,
        height,
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.4 : 1,
        background: bg,
        borderColor: border,
      }}
      {...attributes}
      {...listeners}
      onClick={() => task && resizingRef.current === null && openTask(task.id)}
      className="absolute left-1 right-1 cursor-grab overflow-hidden rounded-md border px-2 py-1 text-[11px] leading-tight active:cursor-grabbing"
    >
      <div
        onPointerDown={beginResize("top")}
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-x-0 top-0 z-10 h-1.5 cursor-ns-resize"
      />
      <div className="truncate font-medium text-(--color-text)">
        {task ? task.title : "(missing task)"}
      </div>
      <div className="text-[10px] tabular-nums text-(--color-text-subtle)">
        {minutesToLabel(startMinute)} – {minutesToLabel(Math.min(endMinute, 1440))}
      </div>
      <div
        onPointerDown={beginResize("bottom")}
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-x-0 bottom-0 z-10 h-1.5 cursor-ns-resize"
      />
    </div>
  );
}
