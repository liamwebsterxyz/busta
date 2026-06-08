import { Repeat } from "lucide-react";
import type { Task } from "../../types/domain";
import { colorByKey } from "../../lib/colors";
import { useStore } from "../../store";
import { isCompletedOnDay } from "../../lib/recurrence";
import { minutesToLabel } from "../../lib/date";

interface Props {
  task: Task;
  day: string;
  hourPx: number;
}

/**
 * Read-only timeline block for a recurring task on a specific day. Visually
 * differentiated from a real TimeBlock by a small repeat icon and a dashed
 * border. Click opens the task detail for editing.
 *
 * Recurring blocks are read-only here — drag/resize would mean editing the
 * task's recurrenceTime which the user does explicitly in the detail modal.
 */
export function RecurringBlockView({ task, day, hourPx }: Props) {
  const openTask = useStore((s) => s.openTask);
  const category = useStore((s) =>
    task.categoryId ? s.categories[task.categoryId] : null,
  );
  const color = colorByKey(category?.colorKey);

  const time = task.recurrenceTime;
  if (!time) return null;

  const done = isCompletedOnDay(task, day);
  const top = (time.startMinute / 60) * hourPx;
  const height = Math.max(18, (time.durationMinutes / 60) * hourPx);
  const endMinute = time.startMinute + time.durationMinutes;

  const bg = color?.soft ?? "var(--color-accent-soft)";
  const border = color?.border ?? "var(--color-accent)";

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        openTask(task.id);
      }}
      style={{
        top,
        height,
        background: bg,
        borderColor: border,
        opacity: done ? 0.5 : 1,
      }}
      title={`${task.title} (recurring)`}
      className="absolute left-1 right-1 cursor-pointer overflow-hidden rounded-md border border-dashed px-2 py-1 text-[11px] leading-tight hover:brightness-95"
    >
      <div
        className={`flex items-center gap-1 truncate font-medium ${
          done ? "text-(--color-text-subtle) line-through" : "text-(--color-text)"
        }`}
      >
        <Repeat size={10} strokeWidth={2} className="shrink-0" />
        <span className="truncate">{task.title || "(no title)"}</span>
      </div>
      <div className="text-[10px] tabular-nums text-(--color-text-subtle)">
        {minutesToLabel(time.startMinute)} – {minutesToLabel(Math.min(endMinute, 1440))}
      </div>
    </div>
  );
}
