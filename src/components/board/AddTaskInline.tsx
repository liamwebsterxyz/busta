import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ISODate } from "../../types/domain";
import { useStore } from "../../store";

interface Props {
  day: ISODate | null;
}

export function AddTaskInline({ day }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const addTask = useStore((s) => s.addTask);
  const composing = useStore((s) => s.ui.composing);
  const stopComposing = useStore((s) => s.stopComposing);

  const targetsMe =
    composing !== null &&
    ((day === null && composing.kind === "backlog") ||
      (day !== null && composing.kind === "day" && composing.day === day));

  useEffect(() => {
    if (targetsMe) {
      setEditing(true);
      stopComposing();
    }
  }, [targetsMe, stopComposing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    const title = value.trim();
    if (title) addTask({ title, day });
    setValue("");
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="group flex w-full items-center gap-1.5 rounded-md border border-dashed border-transparent px-2 py-1.5 text-left text-sm text-(--color-text-subtle) transition-colors hover:border-(--color-border) hover:bg-(--color-surface) hover:text-(--color-text-muted)"
      >
        <Plus size={14} />
        <span>Add task</span>
      </button>
    );
  }

  return (
    <div className="rounded-md border border-(--color-accent) bg-(--color-surface) px-2.5 py-2">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Task title"
        className="w-full bg-transparent text-sm outline-none placeholder:text-(--color-text-subtle)"
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setValue("");
            setEditing(false);
          }
        }}
        onBlur={commit}
      />
    </div>
  );
}
