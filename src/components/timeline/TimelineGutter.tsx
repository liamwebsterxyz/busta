import { hour12Label } from "../../lib/date";

interface Props {
  hourPx: number;
}

export function TimelineGutter({ hourPx }: Props) {
  return (
    <div
      className="relative shrink-0 select-none border-r border-(--color-border) text-[10px] text-(--color-text-subtle)"
      style={{ width: 44, height: hourPx * 24 }}
    >
      {Array.from({ length: 24 }, (_, h) => (
        <div
          key={h}
          className="absolute right-2"
          style={{ top: h * hourPx - 6, width: 32, textAlign: "right" }}
        >
          {h === 0 ? "" : hour12Label(h)}
        </div>
      ))}
    </div>
  );
}
