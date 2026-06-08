import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useShallow } from "zustand/react/shallow";
import { useStore, selectTasksForDay } from "../../store";
import type { ISODate } from "../../types/domain";
import { isToday } from "../../lib/date";
import { dayDropId, taskDragId } from "../../dnd/dragIds";
import { AddTaskInline } from "./AddTaskInline";
import { DayColumnHeader } from "./DayColumnHeader";
import { TaskCard } from "./TaskCard";

interface Props {
  day: ISODate;
}

export function DayColumn({ day }: Props) {
  const tasks = useStore(useShallow((s) => selectTasksForDay(s, day)));
  const activeDay = useStore((s) => s.ui.activeDay);
  const selectedTaskId = useStore((s) => s.ui.selectedTaskId);
  const setActiveDay = useStore((s) => s.setActiveDay);
  const openTask = useStore((s) => s.openTask);

  const isActive = activeDay === day;
  const today = isToday(day);

  const { setNodeRef, isOver } = useDroppable({
    id: dayDropId(day),
    data: { type: "day", day },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex h-full min-w-0 flex-col gap-2 px-3 py-3 transition-colors ${
        today ? "bg-(--color-today)/30" : ""
      } ${isOver ? "bg-(--color-accent-soft)/50" : ""}`}
    >
      <DayColumnHeader
        day={day}
        tasks={tasks}
        active={isActive}
        onActivate={() => setActiveDay(day)}
      />
      <AddTaskInline day={day} />
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
        <SortableContext
          items={tasks.map((t) => taskDragId(t.id))}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              day={day}
              selected={isActive && selectedTaskId === t.id}
              onOpen={() => openTask(t.id)}
            />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <div className="mt-2 select-none text-center text-xs text-(--color-text-subtle)">
            Drop here
          </div>
        )}
      </div>
    </div>
  );
}
