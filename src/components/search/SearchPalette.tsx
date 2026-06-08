import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Check } from "lucide-react";
import type { Category, Task, TimeBlock } from "../../types/domain";
import { useStore } from "../../store";
import { colorByKey } from "../../lib/colors";
import { formatDayDate, formatDayLong, minutesToLabel } from "../../lib/date";

const MAX_RESULTS = 25;

export function SearchPalette() {
  const open = useStore((s) => s.ui.searchOpen);
  const tasks = useStore((s) => s.tasks);
  const categories = useStore((s) => s.categories);
  const blocks = useStore((s) => s.timeBlocks);
  const closeSearch = useStore((s) => s.closeSearch);
  const openTask = useStore((s) => s.openTask);

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      // focus after paint
      queueMicrotask(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo(() => {
    const all = Object.values(tasks);
    const trimmed = query.trim();
    if (!trimmed) {
      return [...all]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, MAX_RESULTS);
    }
    const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
    const scored: { task: Task; score: number }[] = [];
    for (const t of all) {
      const s = scoreMatch(t, tokens, categories);
      if (s > 0) scored.push({ task: t, score: s });
    }
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ad = a.task.completedAt ? 1 : 0;
      const bd = b.task.completedAt ? 1 : 0;
      if (ad !== bd) return ad - bd;
      return b.task.updatedAt.localeCompare(a.task.updatedAt);
    });
    return scored.slice(0, MAX_RESULTS).map((r) => r.task);
  }, [tasks, categories, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const blockByTask = useMemo(() => {
    const out: Record<string, TimeBlock> = {};
    for (const b of Object.values(blocks)) {
      if (!out[b.taskId]) out[b.taskId] = b;
    }
    return out;
  }, [blocks]);

  if (!open) return null;

  const pick = (task: Task) => {
    closeSearch();
    openTask(task.id);
  };

  return (
    <div
      onClick={closeSearch}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[10vh]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-(--color-border) bg-(--color-surface) shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-(--color-border) px-3 py-2.5">
          <Search size={15} className="text-(--color-text-subtle)" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-(--color-text-subtle)"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => Math.min(results.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const r = results[activeIndex];
                if (r) pick(r);
              } else if (e.key === "Escape") {
                e.preventDefault();
                closeSearch();
              }
            }}
          />
          <kbd className="rounded border border-(--color-border) px-1 py-0.5 font-mono text-[10px] text-(--color-text-subtle)">
            esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[55vh] overflow-y-auto py-1">
          {results.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-(--color-text-subtle)">
              No matches
            </div>
          ) : (
            results.map((task, i) => (
              <Row
                key={task.id}
                task={task}
                category={task.categoryId ? categories[task.categoryId] : null}
                block={blockByTask[task.id] ?? null}
                active={i === activeIndex}
                onSelect={() => pick(task)}
                onHover={() => setActiveIndex(i)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

interface RowProps {
  task: Task;
  category: Category | null;
  block: TimeBlock | null;
  active: boolean;
  onSelect: () => void;
  onHover: () => void;
}

function Row({ task, category, block, active, onSelect, onHover }: RowProps) {
  const color = colorByKey(category?.colorKey);
  const done = task.completedAt !== null;

  const subtitleParts: string[] = [];
  if (task.day) {
    subtitleParts.push(`${formatDayLong(task.day)}, ${formatDayDate(task.day)}`);
  } else {
    subtitleParts.push("Backlog");
  }
  if (block) subtitleParts.push(minutesToLabel(block.startMinute));
  if (category) subtitleParts.push(category.name);

  return (
    <button
      onClick={onSelect}
      onMouseEnter={onHover}
      className={`flex w-full items-start gap-3 px-3 py-2 text-left transition-colors ${
        active ? "bg-(--color-surface-muted)" : ""
      }`}
    >
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
          done
            ? "border-(--color-complete) bg-(--color-complete) text-white"
            : "border-(--color-border-strong)"
        }`}
      >
        {done && <Check size={11} strokeWidth={3} />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={`truncate text-sm ${
            done ? "text-(--color-text-subtle) line-through" : "text-(--color-text)"
          }`}
        >
          {task.title || "Untitled task"}
        </span>
        <span className="truncate text-[11px] text-(--color-text-subtle)">
          {subtitleParts.join(" · ")}
        </span>
      </span>
      {color && (
        <span
          className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ background: color.dot }}
        />
      )}
    </button>
  );
}

function scoreMatch(
  task: Task,
  tokens: string[],
  categories: Record<string, Category>,
): number {
  const title = task.title.toLowerCase();
  const notes = (task.notes ?? "").toLowerCase();
  const cat = task.categoryId
    ? (categories[task.categoryId]?.name ?? "").toLowerCase()
    : "";
  let score = 0;
  for (const t of tokens) {
    let matched = false;
    if (title.includes(t)) {
      score += 10;
      matched = true;
    }
    if (cat.includes(t)) {
      score += 5;
      matched = true;
    }
    if (notes.includes(t)) {
      score += 1;
      matched = true;
    }
    if (!matched) return 0; // every token must match somewhere
  }
  if (tokens.length && title.startsWith(tokens[0])) score += 5;
  if (task.completedAt) score -= 3;
  return score;
}
