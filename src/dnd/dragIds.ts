import type { ISODate, UUID } from "../types/domain";

export type DraggableId =
  | { kind: "task"; taskId: UUID }
  | { kind: "block"; blockId: UUID };

export type DroppableId =
  | { kind: "day"; day: ISODate }
  | { kind: "timeline"; day: ISODate }
  | { kind: "backlog" };

export const taskDragId = (taskId: UUID) => `task:${taskId}`;
export const blockDragId = (blockId: UUID) => `block:${blockId}`;
export const dayDropId = (day: ISODate) => `day:${day}`;
export const timelineDropId = (day: ISODate) => `timeline:${day}`;
export const backlogDropId = "backlog";

export function parseDraggable(id: string | number | null | undefined): DraggableId | null {
  if (typeof id !== "string") return null;
  if (id.startsWith("task:")) return { kind: "task", taskId: id.slice(5) };
  if (id.startsWith("block:")) return { kind: "block", blockId: id.slice(6) };
  return null;
}

export function parseDroppable(id: string | number | null | undefined): DroppableId | null {
  if (typeof id !== "string") return null;
  if (id === "backlog") return { kind: "backlog" };
  if (id.startsWith("day:")) return { kind: "day", day: id.slice(4) };
  if (id.startsWith("timeline:")) return { kind: "timeline", day: id.slice(9) };
  return null;
}
