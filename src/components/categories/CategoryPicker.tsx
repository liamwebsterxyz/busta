import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Plus, Trash2, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { UUID } from "../../types/domain";
import { CATEGORY_COLORS, colorByKey, defaultColorKey } from "../../lib/colors";
import { selectCategoriesOrdered, useStore } from "../../store";

interface Props {
  value: UUID | null;
  onChange: (id: UUID | null) => void;
}

const POPOVER_WIDTH = 256; // matches w-64

export function CategoryPicker({ value, onChange }: Props) {
  const categories = useStore(useShallow(selectCategoriesOrdered));
  const addCategory = useStore((s) => s.addCategory);
  const deleteCategory = useStore((s) => s.deleteCategory);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [colorKey, setColorKey] = useState(defaultColorKey());
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const updatePos = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const left = Math.min(
        Math.max(8, r.right - POPOVER_WIDTH),
        window.innerWidth - POPOVER_WIDTH - 8,
      );
      setCoords({ top: r.bottom + 4, left });
    };
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
      setCreating(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  useEffect(() => {
    if (open && categories.length === 0) setCreating(true);
  }, [open, categories.length]);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  const current = value ? categories.find((c) => c.id === value) ?? null : null;
  const currentColor = colorByKey(current?.colorKey);

  const commitNew = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const c = addCategory({ name: trimmed, colorKey });
    onChange(c.id);
    setName("");
    setColorKey(defaultColorKey());
    setCreating(false);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-(--color-text-muted) hover:bg-(--color-surface-muted)"
      >
        {current && currentColor ? (
          <>
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: currentColor.dot }}
            />
            <span className="text-(--color-text)">{current.name}</span>
          </>
        ) : (
          <>
            <span className="inline-block h-2 w-2 rounded-full border border-(--color-border-strong)" />
            <span>No category</span>
          </>
        )}
        <ChevronDown size={12} />
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              width: POPOVER_WIDTH,
              zIndex: 60,
            }}
            className="rounded-lg border border-(--color-border) bg-(--color-surface) p-2 text-sm shadow-xl"
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="px-1 text-[10px] uppercase tracking-wider text-(--color-text-subtle)">
                Category
              </span>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-0.5 text-(--color-text-subtle) hover:bg-(--color-surface-muted) hover:text-(--color-text)"
              >
                <X size={12} />
              </button>
            </div>

            <button
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-(--color-surface-muted) ${
                value === null ? "bg-(--color-surface-muted)" : ""
              }`}
            >
              <span className="inline-block h-2 w-2 rounded-full border border-(--color-border-strong)" />
              <span className="flex-1 text-(--color-text-muted)">No category</span>
              {value === null && <Check size={13} className="text-(--color-text)" />}
            </button>

            {categories.map((c) => {
              const color = colorByKey(c.colorKey);
              return (
                <div key={c.id} className="group flex items-center">
                  <button
                    onClick={() => {
                      onChange(c.id);
                      setOpen(false);
                    }}
                    className={`flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-(--color-surface-muted) ${
                      value === c.id ? "bg-(--color-surface-muted)" : ""
                    }`}
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: color?.dot ?? "transparent" }}
                    />
                    <span className="flex-1 truncate">{c.name}</span>
                    {value === c.id && <Check size={13} className="text-(--color-text)" />}
                  </button>
                  <button
                    onClick={() => {
                      deleteCategory(c.id);
                      if (value === c.id) onChange(null);
                    }}
                    title="Delete category"
                    className="rounded p-1 text-(--color-text-subtle) opacity-0 hover:bg-(--color-surface-muted) hover:text-red-600 group-hover:opacity-100"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}

            <div className="my-1 border-t border-(--color-border)" />

            {creating ? (
              <div className="rounded-md border border-(--color-border) bg-(--color-surface-muted) p-2">
                <input
                  ref={inputRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Category name"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitNew();
                    if (e.key === "Escape") {
                      setName("");
                      setCreating(false);
                    }
                  }}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-(--color-text-subtle)"
                />
                <div className="mt-2 flex flex-wrap gap-1">
                  {CATEGORY_COLORS.map((c) => (
                    <button
                      key={c.key}
                      aria-label={c.label}
                      title={c.label}
                      onClick={() => setColorKey(c.key)}
                      className={`h-5 w-5 rounded-full border transition-transform hover:scale-110 ${
                        colorKey === c.key
                          ? "border-(--color-text) ring-2 ring-(--color-text)/20"
                          : "border-(--color-border)"
                      }`}
                      style={{ background: c.dot }}
                    />
                  ))}
                </div>
                <div className="mt-2 flex justify-end gap-1">
                  <button
                    onClick={() => {
                      setName("");
                      setCreating(false);
                    }}
                    className="rounded px-2 py-0.5 text-xs text-(--color-text-muted) hover:bg-(--color-surface)"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={commitNew}
                    disabled={!name.trim()}
                    className="rounded bg-(--color-text) px-2 py-0.5 text-xs text-white hover:bg-(--color-text)/90 disabled:opacity-40"
                  >
                    Create
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-(--color-text-muted) hover:bg-(--color-surface-muted)"
              >
                <Plus size={13} />
                New category
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
