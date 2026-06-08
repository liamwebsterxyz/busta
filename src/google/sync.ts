import { useStore } from "../store";
import { ensureFreshToken } from "./calendar";
import type { GoogleAttendee, GoogleEvent } from "./calendar";
import type { Task, TimeBlock } from "../types/domain";
import { fromISODate } from "../lib/date";

const CAL_BASE = "https://www.googleapis.com/calendar/v3";

/**
 * Push a TimeBlock to Google Calendar.
 *  - If the block has no `googleEventId`, POST a new event and link it.
 *  - Otherwise PATCH the existing event with the latest fields.
 *
 * Fire-and-forget from the call site — failures log to console and the local
 * state stays authoritative. We don't surface every blip to the user because
 * the 10s poll catches up eventually.
 */
export async function pushTimeBlockToGoogle(blockId: string): Promise<void> {
  const s = useStore.getState();
  const block = s.timeBlocks[blockId];
  if (!block) return;
  const task = s.tasks[block.taskId];
  if (!task) return;
  // Already-pushed: stay on the calendar we originally pushed to. New blocks:
  // prefer the task-level pushTarget override, fall back to the global default.
  const target = block.googleEventId
    ? {
        accountEmail: block.googleAccountEmail!,
        calendarId: block.googleCalendarId!,
      }
    : (task.pushTarget ?? s.googlePushTarget);
  if (!target) {
    console.warn("[gcal-push] no push target configured");
    return;
  }
  if (!s.googleAccounts[target.accountEmail]) {
    console.warn("[gcal-push] target account not connected:", target.accountEmail);
    return;
  }

  const body = eventBodyFromBlock(block, task);
  const token = await ensureFreshToken(target.accountEmail);
  // `conferenceDataVersion=1` is required for Meet creation to actually run.
  const needsConferenceVersion = task.wantsMeetLink;

  try {
    if (block.googleEventId) {
      const url = new URL(
        `${CAL_BASE}/calendars/${encodeURIComponent(target.calendarId)}/events/${encodeURIComponent(block.googleEventId)}`,
      );
      if (needsConferenceVersion) url.searchParams.set("conferenceDataVersion", "1");
      // Have GCal email invited attendees about changes.
      if (task.attendees.length > 0) url.searchParams.set("sendUpdates", "all");
      const res = await fetch(url, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        if (res.status === 404 || res.status === 410) {
          useStore.getState().unlinkTimeBlockFromGoogle(blockId);
          return pushTimeBlockToGoogle(blockId);
        }
        throw new Error(`PATCH ${res.status}: ${await res.text().catch(() => res.statusText)}`);
      }
      const updated = (await res.json()) as GoogleEventResponse;
      const meetLink = pickMeetLink(updated);
      if (meetLink && meetLink !== block.meetLink) {
        useStore.getState().setTimeBlockMeetLink(blockId, meetLink);
      }
      return;
    }
    const url = new URL(
      `${CAL_BASE}/calendars/${encodeURIComponent(target.calendarId)}/events`,
    );
    if (needsConferenceVersion) url.searchParams.set("conferenceDataVersion", "1");
    if (task.attendees.length > 0) url.searchParams.set("sendUpdates", "all");
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`POST ${res.status}: ${await res.text().catch(() => res.statusText)}`);
    }
    const created = (await res.json()) as GoogleEventResponse;
    useStore.getState().linkTimeBlockToGoogle(blockId, {
      eventId: created.id,
      accountEmail: target.accountEmail,
      calendarId: target.calendarId,
    });
    const meetLink = pickMeetLink(created);
    if (meetLink) {
      useStore.getState().setTimeBlockMeetLink(blockId, meetLink);
    }
    console.log(`[gcal-push] created ${created.id} on ${target.calendarId}`);
  } catch (err) {
    console.error("[gcal-push] failed:", err);
  }
}

interface GoogleEventResponse {
  id: string;
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: { entryPointType?: string; uri?: string }[];
  };
}

function pickMeetLink(ev: GoogleEventResponse): string | undefined {
  return (
    ev.hangoutLink ??
    ev.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri
  );
}

/**
 * Delete the Google Calendar event a TimeBlock was linked to. Safe to call on
 * unlinked blocks (no-op).
 */
export async function deleteTimeBlockOnGoogle(block: TimeBlock): Promise<void> {
  if (!block.googleEventId || !block.googleAccountEmail || !block.googleCalendarId) {
    return;
  }
  // Tombstone immediately so an in-flight poll (whose response will land after
  // we send DELETE) doesn't resurrect the event for a 10s blip.
  useStore.getState().tombstoneGoogleEvent(block.googleAccountEmail, block.googleEventId);
  try {
    const token = await ensureFreshToken(block.googleAccountEmail);
    const url = `${CAL_BASE}/calendars/${encodeURIComponent(block.googleCalendarId)}/events/${encodeURIComponent(block.googleEventId)}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok || res.status === 404 || res.status === 410) {
      console.log(`[gcal-push] deleted ${block.googleEventId}`);
      return;
    }
    throw new Error(`DELETE ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  } catch (err) {
    console.error("[gcal-push] delete failed:", err);
  }
}

/** Update every TimeBlock linked to a given task — used when the task's title
 *  or other shared fields change. */
export function pushAllBlocksForTask(taskId: string): void {
  const s = useStore.getState();
  for (const block of Object.values(s.timeBlocks)) {
    if (block.taskId === taskId && block.googleEventId) {
      void pushTimeBlockToGoogle(block.id);
    }
  }
}

/**
 * Move every linked TimeBlock for a task to whatever push target is now
 * configured for the task. No-op for blocks that aren't yet pushed.
 *
 * Implementation is DELETE-from-old + POST-to-new — Google Calendar doesn't
 * have a native "move event between calendars" endpoint for our purposes.
 */
export async function migrateBlocksToCurrentTarget(taskId: string): Promise<void> {
  const s = useStore.getState();
  const task = s.tasks[taskId];
  if (!task) return;
  const newTarget = task.pushTarget ?? s.googlePushTarget;
  if (!newTarget) return;

  const blocks = Object.values(s.timeBlocks).filter((b) => b.taskId === taskId);
  for (const block of blocks) {
    if (!block.googleEventId) continue;
    if (
      block.googleAccountEmail === newTarget.accountEmail &&
      block.googleCalendarId === newTarget.calendarId
    ) {
      continue; // already on the right calendar
    }
    // Capture old location, then unlink so the next push creates fresh on new.
    await deleteTimeBlockOnGoogle(block);
    useStore.getState().unlinkTimeBlockFromGoogle(block.id);
    await pushTimeBlockToGoogle(block.id);
  }
}

function eventBodyFromBlock(block: TimeBlock, task: Task) {
  const start = combineDayAndMinute(block.day, block.startMinute);
  const end = combineDayAndMinute(block.day, block.startMinute + block.durationMinutes);
  const body: Record<string, unknown> = {
    summary: task.title || "(no title)",
    description: task.notes,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  };
  if (task.attendees.length > 0) {
    body.attendees = task.attendees.map((email) => ({ email }));
  }
  // Request a Meet conference. A deterministic requestId per block makes this
  // idempotent — Google won't create a second conference if one already exists.
  if (task.wantsMeetLink && !block.meetLink) {
    body.conferenceData = {
      createRequest: {
        requestId: `meet-${block.id}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }
  return body;
}

export type RsvpStatus = "accepted" | "declined" | "tentative";

/**
 * Update your own RSVP on an external Google Calendar event.
 *  - Optimistically updates the local cache so the UI reacts immediately.
 *  - PATCHes the event on Google with the full attendees list (self entry
 *    flipped to the new responseStatus). Google replaces the whole attendees
 *    array on PATCH, so we must round-trip everyone else's status unchanged.
 *  - On API failure, logs and lets the next poll re-sync. We don't roll back
 *    the optimistic update — the cache will be corrected on the next fetch.
 */
export async function setEventRsvp(
  event: GoogleEvent,
  status: RsvpStatus,
): Promise<void> {
  if (!event.attendees?.some((a) => a.self)) {
    console.warn("[gcal-rsvp] event has no self attendee, skipping");
    return;
  }
  const nextAttendees: GoogleAttendee[] = event.attendees.map((a) =>
    a.self ? { ...a, responseStatus: status } : a,
  );

  // Optimistic local update so the UI flips instantly.
  useStore
    .getState()
    .updateGoogleAttendeesForEvent(event.accountEmail, event.googleEventId, nextAttendees);

  try {
    const token = await ensureFreshToken(event.accountEmail);
    const url = `${CAL_BASE}/calendars/${encodeURIComponent(event.calendarId)}/events/${encodeURIComponent(event.googleEventId)}`;
    const body = {
      attendees: nextAttendees.map((a) => ({
        email: a.email,
        displayName: a.displayName,
        responseStatus: a.responseStatus,
      })),
    };
    const res = await fetch(`${url}?sendUpdates=none`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`RSVP PATCH ${res.status}: ${await res.text().catch(() => res.statusText)}`);
    }
  } catch (err) {
    console.error("[gcal-rsvp] failed:", err);
  }
}

function combineDayAndMinute(day: string, minute: number): Date {
  const d = fromISODate(day);
  // fromISODate parses YYYY-MM-DD into local midnight (per date-fns parseISO
  // for date-only strings) — set the hours/minutes from the block's offset.
  d.setHours(0, 0, 0, 0);
  d.setMinutes(d.getMinutes() + minute);
  return d;
}
