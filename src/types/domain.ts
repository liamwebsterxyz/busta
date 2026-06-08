export type UUID = string;
export type ISODate = string;
export type ISODateTime = string;

export type Recurrence = "none" | "daily" | "weekdays" | "weekly";

export interface Task {
  id: UUID;
  title: string;
  notes?: string;
  estimateMinutes: number;
  day: ISODate | null;
  completedAt: ISODateTime | null;
  order: number;
  categoryId: UUID | null;
  recurrence: Recurrence;
  /** Per-day completion timestamps. Only used when recurrence !== "none". */
  completions: Record<ISODate, ISODateTime>;
  /** When set on a recurring task, every occurrence renders as a virtual
   *  time block at this time. (Non-recurring tasks use TimeBlock entries.) */
  recurrenceTime?: { startMinute: number; durationMinutes: number };
  /** Emails of people invited when this task is scheduled and pushed to GCal. */
  attendees: string[];
  /** When true and the task has a TimeBlock, the pushed GCal event gets a
   *  Google Meet conference attached. */
  wantsMeetLink: boolean;
  /** Overrides the global push target. When set, this task's scheduled block
   *  goes to this specific (account, calendar). When null/undefined, falls
   *  back to the store's `googlePushTarget`. */
  pushTarget?: { accountEmail: string; calendarId: string };
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Category {
  id: UUID;
  name: string;
  colorKey: string;
  order: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface TimeBlock {
  id: UUID;
  taskId: UUID;
  day: ISODate;
  startMinute: number;
  durationMinutes: number;
  /** Set when this TimeBlock has been pushed to a Google calendar. */
  googleEventId?: string;
  googleAccountEmail?: string;
  googleCalendarId?: string;
  /** Google Meet URL captured from the GCal response after conference creation. */
  meetLink?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
