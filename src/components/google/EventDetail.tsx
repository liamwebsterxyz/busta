import { useEffect, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Calendar,
  Check,
  ExternalLink,
  HelpCircle,
  MapPin,
  Users,
  Video,
  X,
} from "lucide-react";
import { useStore } from "../../store";
import { formatDayDate, formatDayLong, minutesToLabel } from "../../lib/date";
import type { GoogleAttendee, GoogleEvent } from "../../google/calendar";
import { setEventRsvp, type RsvpStatus } from "../../google/sync";

export function EventDetail() {
  const openEventGroupId = useStore((s) => s.ui.openEventGroupId);
  const closeEvent = useStore((s) => s.closeEvent);

  const event = useStore((s) => {
    if (!s.ui.openEventGroupId) return null;
    for (const list of Object.values(s.googleEvents.byDay)) {
      for (const e of list) {
        if (e.groupId === s.ui.openEventGroupId) return e;
      }
    }
    return null;
  });

  const calendarName = useStore((s) => {
    if (!event) return null;
    const cals = s.googleCalendars.byAccount[event.accountEmail] ?? [];
    const c = cals.find((x) => x.id === event.calendarId);
    return c?.summary ?? event.calendarId;
  });

  useEffect(() => {
    if (!openEventGroupId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeEvent();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [openEventGroupId, closeEvent]);

  if (!event) return null;

  const self = event.attendees?.find((a) => a.self);
  const declined = self?.responseStatus === "declined";

  const openInGCal = () => {
    if (event.htmlLink) openUrl(event.htmlLink).catch(() => {});
  };

  return (
    <div
      onClick={closeEvent}
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 px-4 pt-[10vh] backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-[600px] flex-col overflow-hidden rounded-2xl border border-(--color-border) bg-(--color-surface) shadow-2xl"
      >
        {/* Minimal header — open-in-gcal + close. */}
        <header className="flex h-10 shrink-0 items-center justify-end gap-0.5 px-2">
          <button
            onClick={openInGCal}
            title="Open in Google Calendar"
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-(--color-text-muted) transition-colors hover:bg-(--color-surface-muted) hover:text-(--color-text)"
          >
            <ExternalLink size={12} />
            Google Calendar
          </button>
          <button
            aria-label="Close"
            title="Close (Esc)"
            onClick={closeEvent}
            className="rounded-lg p-1.5 text-(--color-text-subtle) transition-colors hover:bg-(--color-surface-muted) hover:text-(--color-text)"
          >
            <X size={14} />
          </button>
        </header>

        {/* Title row — color dot + summary. */}
        <div className="flex items-start gap-3 px-6 pb-4">
          <span
            className="mt-2 inline-block h-3 w-3 shrink-0 rounded-full"
            style={{
              background: event.backgroundColor ?? "var(--color-text-subtle)",
            }}
          />
          <h2
            className={`min-w-0 break-words text-[20px] font-semibold leading-snug tracking-tight ${
              declined ? "text-(--color-text-subtle) line-through" : "text-(--color-text)"
            }`}
          >
            {event.summary}
          </h2>
        </div>

        {/* Properties. */}
        <div className="border-t border-(--color-border)/70 px-3 py-2">
          <PropertyRow icon={<Calendar size={13} />} label="When">
            <TimeValue event={event} />
          </PropertyRow>
          <PropertyRow icon={<Calendar size={13} />} label="Calendar">
            <span className="truncate text-xs text-(--color-text)">
              {calendarName}
            </span>
            <span className="ml-2 truncate text-[11px] text-(--color-text-subtle)">
              {event.accountEmail}
            </span>
          </PropertyRow>
          {event.location && (
            <PropertyRow icon={<MapPin size={13} />} label="Location">
              <span className="break-words text-xs text-(--color-text)">
                {event.location}
              </span>
            </PropertyRow>
          )}
          {event.meetLink && (
            <PropertyRow icon={<Video size={13} />} label="Meet">
              <button
                onClick={() => openUrl(event.meetLink!).catch(() => {})}
                className="truncate text-left text-xs text-(--color-accent) underline decoration-(--color-accent)/40 underline-offset-2 transition-colors hover:decoration-(--color-accent)"
              >
                Join Google Meet
              </button>
            </PropertyRow>
          )}
          {self && (
            <PropertyRow icon={<Check size={13} />} label="Going?">
              <RsvpButtons event={event} self={self} />
            </PropertyRow>
          )}
          {event.attendees && event.attendees.length > 0 && (
            <PropertyRow icon={<Users size={13} />} label="Guests">
              <AttendeesList attendees={event.attendees} />
            </PropertyRow>
          )}
        </div>

        {/* Description. */}
        {event.description && (
          <div className="min-h-0 flex-1 border-t border-(--color-border)/70 px-6 pb-6 pt-3">
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-(--color-text-subtle)">
              Description
            </div>
            <div className="whitespace-pre-wrap rounded-lg bg-(--color-surface-muted) p-3 text-[13px] leading-relaxed text-(--color-text)">
              {event.description}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── property layout ──────────────────────────────────────────────────────

function PropertyRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-1.5 transition-colors hover:bg-(--color-surface-muted)/50">
      <div className="flex w-24 shrink-0 items-center gap-2 text-xs text-(--color-text-muted)">
        <span className="shrink-0">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="min-w-0 flex-1 text-sm">{children}</div>
    </div>
  );
}

// ─── time / day display ────────────────────────────────────────────────────

function TimeValue({ event }: { event: GoogleEvent }) {
  const start = new Date(event.startIso);
  const end = new Date(event.endIso);
  const startDay = formatDayLabel(start);
  const endDay = formatDayLabel(end, /* exclusive */ event.isAllDay);
  const sameDay = startDay === endDay;

  if (event.isAllDay) {
    return (
      <span className="text-xs text-(--color-text)">
        {sameDay ? `${startDay} · All day` : `${startDay} – ${endDay} · All day`}
      </span>
    );
  }
  return (
    <span className="text-xs text-(--color-text)">
      {startDay} ·{" "}
      <span className="tabular-nums">
        {minutesToLabel(event.startMinute)} –{" "}
        {sameDay
          ? minutesToLabel(Math.min(event.endMinute, 1440))
          : `${endDay} ${minutesToLabel(end.getHours() * 60 + end.getMinutes())}`}
      </span>
    </span>
  );
}

function formatDayLabel(d: Date, exclusiveEnd = false): string {
  const adjusted = exclusiveEnd ? new Date(d.getTime() - 24 * 60 * 60 * 1000) : d;
  const yyyy = adjusted.getFullYear();
  const mm = String(adjusted.getMonth() + 1).padStart(2, "0");
  const dd = String(adjusted.getDate()).padStart(2, "0");
  const iso = `${yyyy}-${mm}-${dd}`;
  return `${formatDayLong(iso)}, ${formatDayDate(iso)}`;
}

// ─── rsvp ──────────────────────────────────────────────────────────────────

function RsvpButtons({
  event,
  self,
}: {
  event: GoogleEvent;
  self: GoogleAttendee;
}) {
  const status = self.responseStatus;
  const onPick = (next: RsvpStatus) => {
    if (status === next) return;
    void setEventRsvp(event, next);
  };
  return (
    <div className="flex w-fit items-center rounded-lg border border-(--color-border) p-0.5">
      <RsvpButton label="Going" active={status === "accepted"} tone="accept" onClick={() => onPick("accepted")} />
      <RsvpButton label="Maybe" active={status === "tentative"} tone="maybe" onClick={() => onPick("tentative")} />
      <RsvpButton label="Not going" active={status === "declined"} tone="decline" onClick={() => onPick("declined")} />
    </div>
  );
}

function RsvpButton({
  label,
  active,
  tone,
  onClick,
}: {
  label: string;
  active: boolean;
  tone: "accept" | "maybe" | "decline";
  onClick: () => void;
}) {
  const activeClass =
    tone === "accept"
      ? "bg-(--color-complete) text-white"
      : tone === "maybe"
        ? "bg-amber-500 text-white"
        : "bg-red-500 text-white";
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
        active ? activeClass : "text-(--color-text-muted) hover:text-(--color-text)"
      }`}
    >
      {label}
    </button>
  );
}

// ─── attendees ─────────────────────────────────────────────────────────────

function AttendeesList({ attendees }: { attendees: GoogleAttendee[] }) {
  const sorted = [...attendees].sort((a, b) => {
    if (a.self !== b.self) return a.self ? -1 : 1;
    if (a.organizer !== b.organizer) return a.organizer ? -1 : 1;
    return (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email);
  });
  return (
    <ul className="space-y-1">
      {sorted.map((a) => (
        <li key={a.email} className="flex items-center gap-2 text-xs">
          <ResponseDot status={a.responseStatus} />
          <span className="min-w-0 truncate text-(--color-text)" title={a.email}>
            {a.displayName ?? a.email}
          </span>
          {a.organizer && (
            <span className="text-[10px] uppercase tracking-wider text-(--color-text-subtle)">
              organizer
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function ResponseDot({ status }: { status?: GoogleAttendee["responseStatus"] }) {
  if (status === "accepted") {
    return (
      <span
        className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-(--color-complete) text-white"
        title="Accepted"
      >
        <Check size={9} strokeWidth={3} />
      </span>
    );
  }
  if (status === "declined") {
    return (
      <span
        className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-red-500 text-white"
        title="Declined"
      >
        <X size={9} strokeWidth={3} />
      </span>
    );
  }
  if (status === "tentative") {
    return (
      <span
        className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white"
        title="Tentative"
      >
        <HelpCircle size={9} strokeWidth={3} />
      </span>
    );
  }
  return (
    <span
      className="h-3.5 w-3.5 shrink-0 rounded-full border border-(--color-border-strong)"
      title="No response"
    />
  );
}
