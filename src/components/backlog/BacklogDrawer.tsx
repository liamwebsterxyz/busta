import { Inbox, X } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useShallow } from "zustand/react/shallow";
import { selectTasksForDay, useStore } from "../../store";
import { backlogDropId, taskDragId } from "../../dnd/dragIds";
import { AddTaskInline } from "../board/AddTaskInline";
import { TaskCard } from "../board/TaskCard";

export function BacklogDrawer() {
  const tasks = useStore(useShallow((s) => selectTasksForDay(s, null)));
  const selectedTaskId = useStore((s) => s.ui.selectedTaskId);
  const openTask = useStore((s) => s.openTask);
  const toggleBacklogDrawer = useStore((s) => s.toggleBacklogDrawer);

  const { setNodeRef, isOver } = useDroppable({
    id: backlogDropId,
    data: { type: "backlog" },
  });

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-(--color-border) bg-(--color-surface)">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-(--color-border) px-3 text-sm">
        <div className="flex items-center gap-2">
          <Inbox size={14} className="text-(--color-text-muted)" />
          <span className="font-semibold tracking-tight">Backlog</span>
          <span className="text-xs text-(--color-text-subtle)">{tasks.length}</span>
        </div>
        <button
          aria-label="Close backlog"
          onClick={toggleBacklogDrawer}
          className="rounded-md p-1 text-(--color-text-muted) hover:bg-(--color-surface-muted)"
        >
          <X size={14} />
        </button>
      </header>

      <div
        ref={setNodeRef}
        className={`flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3 transition-colors ${
          isOver ? "bg-(--color-accent-soft)/50" : ""
        }`}
      >
        <AddTaskInline day={null} />
        <SortableContext
          items={tasks.map((t) => taskDragId(t.id))}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-1.5">
            {tasks.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                selected={selectedTaskId === t.id}
                onOpen={() => openTask(t.id)}
              />
            ))}
          </div>
        </SortableContext>
        {tasks.length === 0 && (
          <div className="select-none py-6 text-center text-xs text-(--color-text-subtle)">
            Drop a task here to unschedule it.
          </div>
        )}
      </div>
    </aside>
  );
}
