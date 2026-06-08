import { getDay } from "date-fns";
import type { ISODate, Recurrence, Task } from "../types/domain";
import { fromISODate } from "./date";

/** True if a recurring task should appear on `day`. */
export function occursOn(task: Task, day: ISODate): boolean {
  if (task.recurrence === "none") return task.day === day;
  // Recurring tasks need a start day, before which they don't appear.
  if (!task.day) return false;
  if (day < task.day) return false;

  const dow = getDay(fromISODate(day)); // 0 = Sunday, 6 = Saturday

  switch (task.recurrence) {
    case "daily":
      return true;
    case "weekdays":
      return dow >= 1 && dow <= 5;
    case "weekly":
      return dow === getDay(fromISODate(task.day));
  }
}

export function isCompletedOnDay(task: Task, day: ISODate): boolean {
  if (task.recurrence === "none") return task.completedAt !== null;
  return task.completions[day] != null;
}

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  none: "Off",
  daily: "Daily",
  weekdays: "Weekdays",
  weekly: "Weekly",
};

export const RECURRENCE_BADGE: Record<Recurrence, string> = {
  none: "",
  daily: "Daily",
  weekdays: "Weekdays",
  weekly: "Weekly",
};
