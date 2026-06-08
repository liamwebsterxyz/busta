import { useEffect, useRef } from "react";
import { Check, Clock, Repeat } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "../../types/domain";
import { estimateLabel, minutesToLabel } from "../../lib/date";
import { colorByKey } from "../../lib/colors";
import { selectBlockForTask, useStore } from "../../store";
import { taskDragId } from "../../dnd/dragIds";
import { RECURRENCE_BADGE, isCompletedOnDay } from "../../lib/recurrence";

interface Props {
  task: Task;
  /** ISO date this card is being rendered under; used for per-day completion of recurring tasks. */
  day?: string | null;
  selected?: boolean;
  onOpen?: () => void;
  overlay?: boolean;
}

export function TaskCard({ task, day, selected, onOpen, overlay }: Props) {
  const toggleComplete = useStore((s) => s.toggleComplete);
  const toggleCompleteOnDay = useStore((s) => s.toggleCompleteOnDay);
  const block = useStore((s) => selectBlockForTask(s, task.id));
  const category = useStore((s) => (task.categoryId ? s.categories[task.categoryId] : null));
  const color = colorByKey(category?.colorKey);
  const isRecurring = task.recurrence !== "none";
  const done = isRecurring && day ? isCompletedOnDay(task, day) : task.completedAt !== null;

  const sortable = useSortable({
    id: taskDragId(task.id),
    data: { type: "task", taskId: task.id, day: task.day },
    // Recurring tasks live on a pattern; dragging them across days breaks the
    // mental model. Locked for v0 — edit recurrence in the detail modal instead.
    disabled: overlay || isRecurring,
  });

  const style = overlay
    ? undefined
    : {
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.35 : 1,
      };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRecurring && day) toggleCompleteOnDay(task.id, day);
    else toggleComplete(task.id);
  };

  const draggable = !overlay && !isRecurring;

  // Keep the keyboard-selected card visible when arrowing past the column's
  // viewport. `block: "nearest"` no-ops when the card is already on screen.
  const nodeRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (selected && nodeRef.current) {
      nodeRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [selected]);
  const setRefs = (node: HTMLDivElement | null) => {
    nodeRef.current = node;
    if (!overlay) sortable.setNodeRef(node);
  };

  return (
    <div
      ref={setRefs}
      style={style}
      {...(draggable ? sortable.attributes : {})}
      {...(draggable ? sortable.listeners : {})}
      onClick={onOpen}
      className={`group flex flex-col gap-1.5 overflow-hidden rounded-md border bg-(--color-surface) px-2.5 py-2 text-sm shadow-[0_1px_0_rgba(0,0,0,0.02)] transition-colors ${
        overlay
          ? "cursor-grabbing shadow-lg"
          : draggable
            ? "cursor-grab active:cursor-grabbing"
            : "cursor-pointer"
      } ${
        selected
          ? "border-(--color-accent)"
          : "border-(--color-border) hover:border-(--color-border-strong)"
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          aria-label={done ? "Mark incomplete" : "Mark complete"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleToggle}
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
            done
              ? "border-(--color-complete) bg-(--color-complete) text-white"
              : "border-(--color-border-strong) hover:border-(--color-text-muted)"
          }`}
        >
          {done && <Check size={11} strokeWidth={3} />}
        </button>
        <div
          className={`min-w-0 flex-1 break-words ${
            done ? "text-(--color-text-subtle) line-through" : ""
          }`}
        >
          {task.title}
        </div>
      </div>

      <div className="flex min-w-0 items-center justify-between gap-2 text-[11px] tabular-nums text-(--color-text-subtle)">
        <div className="flex min-w-0 items-center gap-1.5">
          {isRecurring ? (
            <span
              className="flex min-w-0 items-center gap-0.5 text-(--color-text-muted)"
              title={`Repeats ${RECURRENCE_BADGE[task.recurrence].toLowerCase()}`}
            >
              <Repeat size={11} strokeWidth={2} className="shrink-0" />
              <span className="truncate">
                {task.recurrenceTime
                  ? `${RECURRENCE_BADGE[task.recurrence]} · ${minutesToLabel(task.recurrenceTime.startMinute)}`
                  : RECURRENCE_BADGE[task.recurrence]}
              </span>
            </span>
          ) : (
            block && (
              <span className="flex min-w-0 items-center gap-0.5 text-(--color-accent)">
                <Clock size={11} strokeWidth={2} className="shrink-0" />
                <span className="truncate">{minutesToLabel(block.startMinute)}</span>
              </span>
            )
          )}
          {task.estimateMinutes > 0 && (
            <span className="shrink-0">{estimateLabel(task.estimateMinutes)}</span>
          )}
        </div>
        {category && color && (
          <span
            className="flex min-w-0 max-w-[55%] items-center gap-1"
            title={category.name}
          >
            <span
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: color.dot }}
            />
            <span className="truncate">{category.name}</span>
          </span>
        )}
      </div>
    </div>
  );
}
