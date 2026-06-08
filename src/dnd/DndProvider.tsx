import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useState, type ReactNode } from "react";
import { selectBlockForTask, useStore } from "../store";
import { deleteTimeBlockOnGoogle, pushTimeBlockToGoogle } from "../google/sync";
import { TaskCard } from "../components/board/TaskCard";
import { HOUR_PX, SNAP_MINUTES, clampMinute, snapToInterval } from "../lib/timeline";
import { parseDraggable, parseDroppable } from "./dragIds";
import type { UUID } from "../types/domain";

interface Props {
  children: ReactNode;
}

export function DndProvider({ children }: Props) {
  const [activeTaskId, setActiveTaskId] = useState<UUID | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragStart = (event: DragStartEvent) => {
    const d = parseDraggable(event.active.id);
    if (d?.kind === "task") setActiveTaskId(d.taskId);
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveTaskId(null);

    const drag = parseDraggable(event.active.id);
    if (!drag) return;

    const overId = event.over?.id;
    const drop = parseDroppable(overId);
    const store = useStore.getState();

    if (typeof overId === "string" && overId.startsWith("task:")) {
      const overTask = parseDraggable(overId);
      if (drag.kind === "task" && overTask?.kind === "task") {
        const movingTask = store.tasks[drag.taskId];
        const targetTask = store.tasks[overTask.taskId];
        if (!movingTask || !targetTask) return;
        if (movingTask.day === targetTask.day) {
          store.reorderTaskInDay(drag.taskId, targetTask.order);
        } else {
          clearBlocksForTask(drag.taskId);
          store.moveTaskToDay(drag.taskId, targetTask.day, targetTask.order);
        }
        return;
      }
    }

    if (!drop) return;

    if (drag.kind === "task" && drop.kind === "day") {
      const t = store.tasks[drag.taskId];
      if (!t) return;

      const context = (event.over?.data?.current as { context?: string } | null)?.context;
      const fromMonthGrid = context === "month";

      if (t.day !== drop.day) {
        // Move the task; clear existing blocks since they belonged to the old
        // day. (Month-grid drops will create a fresh one below.)
        clearBlocksForTask(drag.taskId);
        store.moveTaskToDay(drag.taskId, drop.day);
      }

      // On a calendar surface (month grid), give the task a default-time
      // TimeBlock so it actually appears scheduled — otherwise it would just
      // be a dayed-but-untimed item that's easy to lose track of.
      if (fromMonthGrid) {
        const existing = selectBlockForTask(useStore.getState(), drag.taskId);
        if (!existing) {
          const created = store.addTimeBlock({
            taskId: drag.taskId,
            day: drop.day,
            startMinute: 9 * 60,
            durationMinutes: Math.max(15, t.estimateMinutes || 30),
          });
          void pushTimeBlockToGoogle(created.id);
        }
      }
      return;
    }

    if (drag.kind === "task" && drop.kind === "backlog") {
      const t = store.tasks[drag.taskId];
      if (!t) return;
      if (t.day !== null) {
        store.moveTaskToDay(drag.taskId, null);
        Object.values(store.timeBlocks)
          .filter((b) => b.taskId === drag.taskId)
          .forEach((b) => store.deleteTimeBlock(b.id));
      }
      return;
    }

    if (drag.kind === "task" && drop.kind === "timeline") {
      const t = store.tasks[drag.taskId];
      if (!t) return;
      const minute = dropMinuteFromOverlay(event);
      if (minute === null) return;

      // One block per task: if this task already has a block, reschedule it
      // instead of creating a duplicate.
      const existing = selectBlockForTask(store, drag.taskId);
      let blockId: string;
      if (existing) {
        store.moveTimeBlock(existing.id, { day: drop.day, startMinute: minute });
        blockId = existing.id;
      } else {
        const created = store.addTimeBlock({
          taskId: drag.taskId,
          day: drop.day,
          startMinute: minute,
          durationMinutes: Math.max(15, t.estimateMinutes || 30),
        });
        blockId = created.id;
      }
      if (t.day !== drop.day) store.moveTaskToDay(drag.taskId, drop.day);
      void pushTimeBlockToGoogle(blockId);
      return;
    }

    if (drag.kind === "block" && drop.kind === "timeline") {
      const b = store.timeBlocks[drag.blockId];
      if (!b) return;
      const minute = dropMinuteFromOverlay(event);
      if (minute === null) return;
      store.moveTimeBlock(drag.blockId, { day: drop.day, startMinute: minute });
      void pushTimeBlockToGoogle(drag.blockId);
      return;
    }
  };

  const activeTask = useStore((s) => (activeTaskId ? s.tasks[activeTaskId] : null));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveTaskId(null)}
      autoScroll={{ threshold: { x: 0.15, y: 0.15 } }}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className="w-64">
            <TaskCard task={activeTask} overlay />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/**
 * Drop position derived from where the DragOverlay visually sits — i.e., the
 * card's translated top relative to the timeline content. Snaps to 15-minute
 * increments only at write-time, so the cursor stays smooth during the drag.
 */
function clearBlocksForTask(taskId: UUID) {
  const store = useStore.getState();
  const blocks = Object.values(store.timeBlocks).filter((b) => b.taskId === taskId);
  for (const b of blocks) {
    void deleteTimeBlockOnGoogle(b);
    store.deleteTimeBlock(b.id);
  }
}

function dropMinuteFromOverlay(event: DragEndEvent): number | null {
  const rect = event.over?.rect;
  const translated = event.active.rect.current.translated;
  if (!rect || !translated) return null;
  const offsetY = translated.top - rect.top;
  const rawMinute = (offsetY / HOUR_PX) * 60;
  return clampMinute(snapToInterval(rawMinute, SNAP_MINUTES));
}
