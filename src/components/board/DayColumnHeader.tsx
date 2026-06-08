import { formatDayLong, formatDayShort } from "../../lib/date";
import type { ISODate, Task } from "../../types/domain";
import { estimateLabel } from "../../lib/date";

interface Props {
  day: ISODate;
  tasks: Task[];
  active: boolean;
  onActivate: () => void;
}

export function DayColumnHeader({ day, tasks, active, onActivate }: Props) {
  const totalMinutes = tasks
    .filter((t) => !t.completedAt)
    .reduce((sum, t) => sum + t.estimateMinutes, 0);

  return (
    <button
      onClick={onActivate}
      className="flex w-full items-start justify-between gap-2 px-1 py-1 text-left"
    >
      <div className="flex min-w-0 flex-col leading-tight">
        <h2
          className={`truncate text-[15px] tracking-tight ${
            active
              ? "font-bold text-(--color-today-strong)"
              : "font-semibold text-(--color-text)"
          }`}
        >
          {formatDayLong(day)}
        </h2>
        <span className="truncate text-[11px] text-(--color-text-subtle)">
          {formatDayShort(day)}
        </span>
      </div>
      {totalMinutes > 0 && (
        <span className="mt-0.5 text-xs tabular-nums text-(--color-text-subtle)">
          {estimateLabel(totalMinutes)}
        </span>
      )}
    </button>
  );
}
