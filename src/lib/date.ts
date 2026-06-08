import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { ISODate } from "../types/domain";

export function toISODate(d: Date): ISODate {
  return format(d, "yyyy-MM-dd");
}

export function fromISODate(s: ISODate): Date {
  return parseISO(s);
}

export function todayISO(): ISODate {
  return toISODate(new Date());
}

export function weekStarting(d: Date = new Date(), weekStartsOn: 0 | 1 = 1): Date {
  return startOfDay(startOfWeek(d, { weekStartsOn }));
}

export function weekDays(anchor: Date = new Date(), weekStartsOn: 0 | 1 = 1): ISODate[] {
  const start = weekStarting(anchor, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => toISODate(addDays(start, i)));
}

export function formatDayLong(iso: ISODate): string {
  return format(fromISODate(iso), "EEEE");
}

export function formatDayDate(iso: ISODate): string {
  return format(fromISODate(iso), "MMMM d");
}

export function formatDayShort(iso: ISODate): string {
  return format(fromISODate(iso), "MMM d");
}

export function isToday(iso: ISODate): boolean {
  return isSameDay(fromISODate(iso), new Date());
}

export function minutesToLabel(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm === 0 ? `${h}:00` : `${h}:${String(mm).padStart(2, "0")}`;
}

export function estimateLabel(m: number): string {
  if (m <= 0) return "0:00";
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}:${String(mm).padStart(2, "0")}`;
}

/**
 * Tight 12-hour time label for narrow surfaces (month cells, etc.):
 * 9:00 AM → "9a", 9:30 → "9:30a", 13:30 → "1:30p", 12:00 → "12p".
 */
export function compactTimeLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h >= 12 ? "p" : "a";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

export function hour12Label(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

export function minutesToTimeInput(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function timeInputToMinutes(s: string): number | null {
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1]);
  const mm = parseInt(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

export function monthGridDays(anchor: Date, weekStartsOn: 0 | 1 = 1): ISODate[] {
  const monthStart = startOfMonth(anchor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn });
  const monthEnd = endOfMonth(anchor);
  const gridEnd = startOfWeek(addDays(monthEnd, 6), { weekStartsOn });
  const days: ISODate[] = [];
  let d = gridStart;
  // 6 weeks max to guarantee complete coverage
  for (let i = 0; i < 42 && d <= gridEnd; i++) {
    days.push(toISODate(d));
    d = addDays(d, 1);
  }
  return days;
}

export function isInSameMonth(iso: ISODate, anchor: Date): boolean {
  return isSameMonth(fromISODate(iso), anchor);
}

export function formatMonthYear(d: Date): string {
  return format(d, "MMMM yyyy");
}

export function shiftMonth(d: Date, delta: number): Date {
  return addMonths(d, delta);
}

export function weekdayLabels(weekStartsOn: 0 | 1 = 1): string[] {
  const start = startOfWeek(new Date(), { weekStartsOn });
  return Array.from({ length: 7 }, (_, i) => format(addDays(start, i), "EEE"));
}

