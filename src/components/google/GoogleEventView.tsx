import { isEventDeclined, type GoogleEvent } from "../../google/calendar";
import { minutesToLabel } from "../../lib/date";
import { useStore } from "../../store";

interface Props {
  event: GoogleEvent;
  hourPx: number;
}

export function GoogleEventView({ event, hourPx }: Props) {
  const openEvent = useStore((s) => s.openEvent);
  const top = (event.startMinute / 60) * hourPx;
  const height = Math.max(18, ((event.endMinute - event.startMinute) / 60) * hourPx);
  const declined = isEventDeclined(event);

  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    openEvent(event.groupId);
  };

  const bg = event.backgroundColor
    ? hexWithAlpha(event.backgroundColor, 0.18)
    : "var(--color-surface-muted)";
  const border = event.backgroundColor ?? "var(--color-text-subtle)";

  return (
    <div
      onClick={open}
      style={{
        top,
        height,
        background: bg,
        borderColor: border,
        opacity: declined ? 0.55 : 1,
      }}
      title={event.summary}
      className="absolute left-1 right-1 cursor-pointer overflow-hidden rounded-md border border-dashed px-2 py-1 text-[11px] leading-tight hover:brightness-95"
    >
      <div
        className={`truncate font-medium ${declined ? "text-(--color-text-subtle) line-through" : "text-(--color-text)"}`}
      >
        {event.summary}
      </div>
      <div className="text-[10px] tabular-nums text-(--color-text-subtle)">
        {event.isAllDay
          ? "All day"
          : `${minutesToLabel(event.startMinute)} – ${minutesToLabel(Math.min(event.endMinute, 1440))}`}
      </div>
    </div>
  );
}

function hexWithAlpha(hex: string, alpha: number): string {
  // Accept #RRGGBB or #RGB. Fall back to the raw value if unparseable.
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return hex;
  let body = m[1];
  if (body.length === 3)
    body = body
      .split("")
      .map((c) => c + c)
      .join("");
  const r = parseInt(body.slice(0, 2), 16);
  const g = parseInt(body.slice(2, 4), 16);
  const b = parseInt(body.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
