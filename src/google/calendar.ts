import { useStore } from "../store";
import { refreshAccessToken } from "./oauth";

export interface GoogleAttendee {
  email: string;
  displayName?: string;
  responseStatus?: "needsAction" | "accepted" | "declined" | "tentative";
  organizer?: boolean;
  self?: boolean;
}

export interface GoogleEvent {
  /** Stable per-slice id (unique within React keys). */
  id: string;
  /** Shared id across all slices of the same source event — used to dedupe
   *  multi-day events that have been split into one slice per day. */
  groupId: string;
  /** Bare Google event id (without the busta-side prefixes). Needed to call
   *  back to the Calendar API when 2-way sync is on. */
  googleEventId: string;
  /** Email of the connected account this event belongs to. */
  accountEmail: string;
  calendarId: string;
  /** Hex color from the calendar source, used to tint the rendered block. */
  backgroundColor?: string;
  summary: string;
  description?: string;
  /** ISO date (YYYY-MM-DD) the event starts on, local time. */
  day: string;
  /** Minutes from midnight of `day`. 0 for all-day events. */
  startMinute: number;
  /** Minutes from midnight of `day`. 1440 for all-day events. */
  endMinute: number;
  /** Original ISO datetime from Google (kept for tooltips). */
  startIso: string;
  endIso: string;
  htmlLink: string;
  isAllDay: boolean;
  status: "confirmed" | "tentative";
  attendees?: GoogleAttendee[];
  meetLink?: string;
  location?: string;
}

export interface GoogleCalendarSource {
  id: string;
  /** Email of the account this calendar belongs to. */
  accountEmail: string;
  summary: string;
  /** True for the user's primary calendar (usually their email). */
  primary: boolean;
  backgroundColor?: string;
  foregroundColor?: string;
  accessRole?: string;
  selected?: boolean;
}

const CAL_BASE = "https://www.googleapis.com/calendar/v3";

export async function ensureFreshToken(accountEmail: string): Promise<string> {
  const account = useStore.getState().googleAccounts[accountEmail];
  if (!account) throw new Error(`Not connected to Google account: ${accountEmail}`);
  if (Date.now() < account.tokens.expiresAt - 60_000) {
    return account.tokens.accessToken;
  }
  const fresh = await refreshAccessToken(account.tokens.refreshToken);
  useStore.getState().setGoogleTokens(accountEmail, fresh);
  return fresh.accessToken;
}

export async function listCalendars(
  accountEmail: string,
): Promise<GoogleCalendarSource[]> {
  const token = await ensureFreshToken(accountEmail);
  const res = await fetch(
    `${CAL_BASE}/users/me/calendarList?minAccessRole=reader&maxResults=250`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    throw new Error(
      `calendarList ${res.status}: ${await res.text().catch(() => res.statusText)}`,
    );
  }
  const data = (await res.json()) as { items?: GoogleApiCalendar[] };
  return (data.items ?? []).map((c) => ({
    id: c.id,
    accountEmail,
    summary: c.summaryOverride || c.summary || c.id,
    primary: !!c.primary,
    backgroundColor: c.backgroundColor,
    foregroundColor: c.foregroundColor,
    accessRole: c.accessRole,
    selected: c.selected,
  }));
}

export async function listEventsForRange(
  accountEmail: string,
  timeMin: Date,
  timeMax: Date,
  calendarId = "primary",
  backgroundColor?: string,
): Promise<GoogleEvent[]> {
  const token = await ensureFreshToken(accountEmail);
  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;
  // Page through until Google stops returning a nextPageToken. Each page
  // returns at most 250 events; a year of a busy calendar can exceed that.
  let pages = 0;
  do {
    const url = new URL(
      `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
    );
    url.searchParams.set("timeMin", timeMin.toISOString());
    url.searchParams.set("timeMax", timeMax.toISOString());
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(
        `Calendar API ${res.status}: ${await res.text().catch(() => res.statusText)}`,
      );
    }
    const data = (await res.json()) as {
      items?: GoogleApiEvent[];
      nextPageToken?: string;
    };
    appendEvents(events, data.items ?? [], accountEmail, calendarId, backgroundColor);
    pageToken = data.nextPageToken;
    pages++;
    if (pages > 20) {
      console.warn(`[gcal] ${calendarId}: page cap hit, bailing`);
      break;
    }
  } while (pageToken);
  return events;
}

function appendEvents(
  out: GoogleEvent[],
  items: GoogleApiEvent[],
  accountEmail: string,
  calendarId: string,
  backgroundColor: string | undefined,
) {
  for (const item of items) {
    if (item.status === "cancelled") continue;
    const startStr = item.start?.dateTime ?? item.start?.date;
    const endStr = item.end?.dateTime ?? item.end?.date;
    if (!startStr || !endStr) continue;
    const isAllDay = !item.start?.dateTime;
    const startDate = parseEventDate(startStr);
    const endDate = parseEventDate(endStr);
    const status = (item.status as "confirmed" | "tentative") ?? "confirmed";

    const baseId = `${accountEmail}::${calendarId}::${item.id}`;
    const attendees: GoogleAttendee[] | undefined = item.attendees
      ?.map((a) => ({
        email: a.email,
        displayName: a.displayName,
        responseStatus: a.responseStatus as GoogleAttendee["responseStatus"],
        organizer: a.organizer,
        self: a.self,
      }))
      .filter((a) => !!a.email);
    const meetLink =
      item.hangoutLink ??
      item.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri;
    const common = {
      groupId: baseId,
      googleEventId: item.id,
      accountEmail,
      calendarId,
      backgroundColor,
      summary: item.summary || "(no title)",
      description: item.description,
      location: item.location,
      attendees: attendees && attendees.length > 0 ? attendees : undefined,
      meetLink,
      startIso: startStr,
      endIso: endStr,
      htmlLink: item.htmlLink ?? "",
      isAllDay,
      status,
    } as const;

    if (isAllDay) {
      // Google's all-day end date is exclusive: a single-day event has
      // end = start + 1 day. Emit one slice per day in [start, end).
      const cursor = new Date(startDate);
      while (cursor < endDate) {
        const day = toLocalDay(cursor);
        out.push({
          ...common,
          id: `${baseId}::${day}`,
          day,
          startMinute: 0,
          endMinute: 1440,
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      continue;
    }

    // Timed event. Usually single-day; if it crosses midnight, split per day.
    const startDay = toLocalDay(startDate);
    const endDay = toLocalDay(endDate);
    if (startDay === endDay) {
      out.push({
        ...common,
        id: baseId,
        day: startDay,
        startMinute: startDate.getHours() * 60 + startDate.getMinutes(),
        endMinute: endDate.getHours() * 60 + endDate.getMinutes(),
      });
      continue;
    }

    // Multi-day timed event. First day runs from its start to midnight, last
    // day runs from midnight to its end, middle days are full.
    const cursor = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate(),
    );
    while (toLocalDay(cursor) <= endDay) {
      const day = toLocalDay(cursor);
      const isFirst = day === startDay;
      const isLast = day === endDay;
      const sMin = isFirst
        ? startDate.getHours() * 60 + startDate.getMinutes()
        : 0;
      const eMin = isLast
        ? endDate.getHours() * 60 + endDate.getMinutes()
        : 1440;
      // Skip zero-length tail slices (e.g., end exactly at midnight).
      if (eMin > sMin) {
        out.push({
          ...common,
          id: `${baseId}::${day}`,
          day,
          startMinute: sMin,
          endMinute: eMin,
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }
}

/**
 * Parses an event start/end string.
 *  - "YYYY-MM-DD" (all-day events): constructs a local-time midnight so the
 *    calendar day isn't shifted by the user's timezone offset.
 *  - "YYYY-MM-DDTHH:MM:SS±HH:MM" (timed events): uses the standard parser.
 */
function parseEventDate(s: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(s);
}

/** True when the event has a `self` attendee that has declined. */
export function isEventDeclined(event: GoogleEvent): boolean {
  return (
    event.attendees?.some((a) => a.self && a.responseStatus === "declined") ?? false
  );
}

function toLocalDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface GoogleApiEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  htmlLink?: string;
  hangoutLink?: string;
  attendees?: {
    email: string;
    displayName?: string;
    responseStatus?: string;
    organizer?: boolean;
    self?: boolean;
  }[];
  conferenceData?: {
    entryPoints?: { entryPointType?: string; uri?: string; label?: string }[];
  };
}

interface GoogleApiCalendar {
  id: string;
  summary?: string;
  summaryOverride?: string;
  primary?: boolean;
  backgroundColor?: string;
  foregroundColor?: string;
  accessRole?: string;
  selected?: boolean;
}
