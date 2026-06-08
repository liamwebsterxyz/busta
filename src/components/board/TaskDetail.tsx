import { useEffect, useState, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Calendar,
  CalendarPlus,
  Check,
  Clock,
  Repeat,
  Tag,
  Trash2,
  Users,
  Video,
  X,
} from "lucide-react";
import { selectBlockForTask, useStore } from "../../store";
import {
  estimateLabel,
  formatDayDate,
  formatDayLong,
  minutesToTimeInput,
  timeInputToMinutes,
  todayISO,
} from "../../lib/date";
import { RECURRENCE_LABEL, isCompletedOnDay } from "../../lib/recurrence";
import type { Recurrence, Task } from "../../types/domain";
import { CategoryPicker } from "../categories/CategoryPicker";
import { NotesEditor } from "./NotesEditor";
import {
  deleteTimeBlockOnGoogle,
  migrateBlocksToCurrentTarget,
  pushAllBlocksForTask,
  pushTimeBlockToGoogle,
} from "../../google/sync";
import { PushTargetPicker } from "../google/PushTargetPicker";

export function TaskDetail() {
  const openTaskId = useStore((s) => s.ui.openTaskId);
  const task = useStore((s) => (openTaskId ? s.tasks[openTaskId] : null));
  const closeTask = useStore((s) => s.closeTask);
  const updateTask = useStore((s) => s.updateTask);
  const toggleComplete = useStore((s) => s.toggleComplete);
  const toggleCompleteOnDay = useStore((s) => s.toggleCompleteOnDay);
  const deleteTask = useStore((s) => s.deleteTask);

  useEffect(() => {
    if (!openTaskId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeTask();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [openTaskId, closeTask]);

  if (!task) return null;

  const today = todayISO();
  const isRecurring = task.recurrence !== "none";
  const done = isRecurring ? isCompletedOnDay(task, today) : task.completedAt !== null;
  const completeLabel = isRecurring
    ? done
      ? "Done today"
      : "Mark done today"
    : done
      ? "Mark incomplete"
      : "Mark complete";
  const onToggle = () =>
    isRecurring ? toggleCompleteOnDay(task.id, today) : toggleComplete(task.id);

  const onDelete = () => {
    const blocks = Object.values(useStore.getState().timeBlocks).filter(
      (b) => b.taskId === task.id,
    );
    for (const b of blocks) void deleteTimeBlockOnGoogle(b);
    deleteTask(task.id);
  };

  return (
    <div
      onClick={closeTask}
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 px-4 pt-[10vh] backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-[600px] flex-col overflow-hidden rounded-2xl border border-(--color-border) bg-(--color-surface) shadow-2xl"
      >
        {/* Minimal header — just window-level controls. */}
        <header className="flex h-10 shrink-0 items-center justify-end gap-0.5 px-2">
          <button
            aria-label="Delete task"
            title="Delete task"
            onClick={onDelete}
            className="rounded-lg p-1.5 text-(--color-text-subtle) transition-colors hover:bg-(--color-surface-muted) hover:text-red-600"
          >
            <Trash2 size={14} />
          </button>
          <button
            aria-label="Close"
            title="Close (Esc)"
            onClick={closeTask}
            className="rounded-lg p-1.5 text-(--color-text-subtle) transition-colors hover:bg-(--color-surface-muted) hover:text-(--color-text)"
          >
            <X size={14} />
          </button>
        </header>

        {/* Title row. */}
        <div className="flex items-start gap-3 px-6 pb-4">
          <button
            aria-label={completeLabel}
            title={completeLabel}
            onClick={onToggle}
            className={`mt-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
              done
                ? "border-(--color-complete) bg-(--color-complete) text-white"
                : "border-(--color-border-strong) hover:border-(--color-text-muted)"
            }`}
          >
            {done && <Check size={13} strokeWidth={3} />}
          </button>
          <input
            autoFocus
            value={task.title}
            onChange={(e) => updateTask(task.id, { title: e.target.value })}
            onBlur={() => pushAllBlocksForTask(task.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder="Untitled task"
            className={`w-full bg-transparent text-[20px] font-semibold leading-snug tracking-tight outline-none placeholder:text-(--color-text-subtle) ${
              done ? "text-(--color-text-subtle) line-through" : ""
            }`}
          />
        </div>

        {/* Properties — uniform label/value rows, Linear style. */}
        <div className="border-t border-(--color-border)/70 px-3 py-2">
          <ScheduleProperty task={task} />
          <PropertyRow icon={<Repeat size={13} />} label="Repeat">
            <RecurrencePicker task={task} />
          </PropertyRow>
          <PropertyRow icon={<Clock size={13} />} label="Estimate">
            <EstimateEditor
              minutes={task.estimateMinutes}
              onChange={(m) => updateTask(task.id, { estimateMinutes: m })}
            />
          </PropertyRow>
          <PropertyRow icon={<Tag size={13} />} label="Category">
            <CategoryPicker
              value={task.categoryId}
              onChange={(id) => updateTask(task.id, { categoryId: id })}
            />
          </PropertyRow>
          <PushTargetProperty task={task} />
          <GuestsProperty task={task} />
          <MeetProperty task={task} />
        </div>

        {/* Notes — divider above, Tiptap below. */}
        <div className="min-h-0 flex-1 border-t border-(--color-border)/70 px-6 pb-6 pt-3">
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-(--color-text-subtle)">
            Notes
          </div>
          <NotesEditor
            value={task.notes ?? ""}
            onChange={(v) => updateTask(task.id, { notes: v })}
          />
        </div>
      </div>
    </div>
  );
}

// ─── property layout ───────────────────────────────────────────────────────

interface PropertyRowProps {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}

function PropertyRow({ icon, label, children }: PropertyRowProps) {
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

// ─── shared time + duration row (used by both schedule variants) ─────────

interface TimeAndDurationFieldsProps {
  startMinute: number;
  durationMinutes: number;
  onStartMinuteChange: (m: number) => void;
  onDurationChange: (m: number) => void;
  onClear: () => void;
  /** Rendered before the time input. One-shot tasks pass a date input + "at"
   *  separator here; recurring tasks pass nothing. */
  prefix?: ReactNode;
}

function TimeAndDurationFields({
  startMinute,
  durationMinutes,
  onStartMinuteChange,
  onDurationChange,
  onClear,
  prefix,
}: TimeAndDurationFieldsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {prefix}
      <input
        type="time"
        value={minutesToTimeInput(startMinute)}
        onChange={(e) => {
          const m = timeInputToMinutes(e.target.value);
          if (m === null) return;
          onStartMinuteChange(m);
        }}
        className="rounded-md border border-(--color-border) bg-(--color-surface) px-1.5 py-1 tabular-nums outline-none transition-colors focus:border-(--color-border-strong)"
      />
      <span className="text-(--color-text-subtle)">for</span>
      <DurationInline minutes={durationMinutes} onChange={onDurationChange} />
      <button
        onClick={onClear}
        className="ml-auto rounded-md px-1.5 py-1 text-(--color-text-subtle) transition-colors hover:bg-(--color-surface-muted) hover:text-red-600"
        title="Clear schedule"
      >
        Clear
      </button>
    </div>
  );
}

// ─── schedule for recurring tasks (time + duration only) ──────────────────

function RecurringScheduleProperty({ task }: { task: Task }) {
  const updateTask = useStore((s) => s.updateTask);
  const time = task.recurrenceTime;

  if (!time) {
    return (
      <PropertyRow icon={<Calendar size={13} />} label="Schedule">
        <button
          onClick={() =>
            updateTask(task.id, {
              recurrenceTime: {
                startMinute: 9 * 60,
                durationMinutes: Math.max(15, task.estimateMinutes || 30),
              },
            })
          }
          className="flex items-center gap-1 rounded-md border border-(--color-border) px-2 py-0.5 text-xs text-(--color-text-muted) transition-colors hover:bg-(--color-surface-muted) hover:text-(--color-text)"
        >
          <CalendarPlus size={11} />
          Set time
        </button>
      </PropertyRow>
    );
  }

  return (
    <PropertyRow icon={<Calendar size={13} />} label="Schedule">
      <TimeAndDurationFields
        startMinute={time.startMinute}
        durationMinutes={time.durationMinutes}
        onStartMinuteChange={(m) =>
          updateTask(task.id, { recurrenceTime: { ...time, startMinute: m } })
        }
        onDurationChange={(m) =>
          updateTask(task.id, { recurrenceTime: { ...time, durationMinutes: m } })
        }
        onClear={() => updateTask(task.id, { recurrenceTime: undefined })}
      />
    </PropertyRow>
  );
}

// ─── schedule (day + time + duration) ──────────────────────────────────────

function ScheduleProperty({ task }: { task: Task }) {
  const block = useStore((s) => selectBlockForTask(s, task.id));
  const addTimeBlock = useStore((s) => s.addTimeBlock);
  const updateTimeBlock = useStore((s) => s.updateTimeBlock);
  const deleteTimeBlock = useStore((s) => s.deleteTimeBlock);
  const moveTaskToDay = useStore((s) => s.moveTaskToDay);

  if (task.recurrence !== "none") {
    return <RecurringScheduleProperty task={task} />;
  }

  if (!block) {
    return (
      <PropertyRow icon={<Calendar size={13} />} label="Schedule">
        <div className="flex items-center gap-3 text-(--color-text-subtle)">
          {task.day && (
            <span>
              {formatDayLong(task.day)},{" "}
              <span className="text-(--color-text-subtle)">{formatDayDate(task.day)}</span>
            </span>
          )}
          <button
            onClick={() => {
              const day = task.day ?? todayISO();
              const created = addTimeBlock({
                taskId: task.id,
                day,
                startMinute: 9 * 60,
                durationMinutes: Math.max(15, task.estimateMinutes || 30),
              });
              if (task.day !== day) moveTaskToDay(task.id, day);
              void pushTimeBlockToGoogle(created.id);
            }}
            className="flex items-center gap-1 rounded-md border border-(--color-border) px-2 py-0.5 text-xs text-(--color-text-muted) transition-colors hover:bg-(--color-surface-muted) hover:text-(--color-text)"
          >
            <CalendarPlus size={11} />
            Schedule
          </button>
        </div>
      </PropertyRow>
    );
  }

  return (
    <PropertyRow icon={<Calendar size={13} />} label="Schedule">
      <TimeAndDurationFields
        startMinute={block.startMinute}
        durationMinutes={block.durationMinutes}
        onStartMinuteChange={(m) => {
          updateTimeBlock(block.id, { startMinute: m });
          void pushTimeBlockToGoogle(block.id);
        }}
        onDurationChange={(m) => {
          updateTimeBlock(block.id, { durationMinutes: m });
          void pushTimeBlockToGoogle(block.id);
        }}
        onClear={() => {
          void deleteTimeBlockOnGoogle(block);
          deleteTimeBlock(block.id);
        }}
        prefix={
          <>
            <input
              type="date"
              value={block.day}
              onChange={(e) => {
                if (!e.target.value) return;
                updateTimeBlock(block.id, { day: e.target.value });
                if (task.day !== e.target.value) moveTaskToDay(task.id, e.target.value);
                void pushTimeBlockToGoogle(block.id);
              }}
              className="rounded-md border border-(--color-border) bg-(--color-surface) px-1.5 py-1 outline-none transition-colors focus:border-(--color-border-strong)"
            />
            <span className="text-(--color-text-subtle)">at</span>
          </>
        }
      />
    </PropertyRow>
  );
}

// ─── recurrence ────────────────────────────────────────────────────────────

const RECURRENCE_OPTIONS: Recurrence[] = ["none", "daily", "weekdays", "weekly"];

function RecurrencePicker({ task }: { task: Task }) {
  const setRecurrence = useStore((s) => s.setRecurrence);
  return (
    <div className="flex w-fit items-center rounded-lg border border-(--color-border) p-0.5">
      {RECURRENCE_OPTIONS.map((r) => {
        const active = task.recurrence === r;
        return (
          <button
            key={r}
            onClick={() => setRecurrence(task.id, r)}
            className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
              active
                ? "bg-(--color-surface-muted) text-(--color-text)"
                : "text-(--color-text-muted) hover:text-(--color-text)"
            }`}
          >
            {RECURRENCE_LABEL[r]}
          </button>
        );
      })}
    </div>
  );
}

// ─── estimate ──────────────────────────────────────────────────────────────

function EstimateEditor({
  minutes,
  onChange,
}: {
  minutes: number;
  onChange: (m: number) => void;
}) {
  const [text, setText] = useState(estimateLabel(minutes));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setText(estimateLabel(minutes));
  }, [minutes, editing]);

  const commit = () => {
    const parsed = parseEstimate(text);
    if (parsed !== null && parsed !== minutes) onChange(parsed);
    setText(estimateLabel(parsed ?? minutes));
    setEditing(false);
  };

  return (
    <input
      value={text}
      onFocus={() => setEditing(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setText(estimateLabel(minutes));
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder="—"
      className="w-20 rounded-md border border-transparent bg-transparent px-2 py-0.5 text-left font-mono text-xs tabular-nums outline-none transition-colors hover:border-(--color-border) focus:border-(--color-border-strong) focus:bg-(--color-surface)"
    />
  );
}

function DurationInline({
  minutes,
  onChange,
}: {
  minutes: number;
  onChange: (m: number) => void;
}) {
  const [text, setText] = useState(estimateLabel(minutes));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setText(estimateLabel(minutes));
  }, [minutes, editing]);

  const commit = () => {
    const parsed = parseEstimate(text);
    if (parsed !== null && parsed >= 15 && parsed !== minutes) onChange(parsed);
    setText(estimateLabel(parsed !== null && parsed >= 15 ? parsed : minutes));
    setEditing(false);
  };

  return (
    <input
      value={text}
      onFocus={() => setEditing(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setText(estimateLabel(minutes));
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="w-14 rounded-md border border-(--color-border) bg-(--color-surface) px-1.5 py-1 text-center font-mono tabular-nums outline-none transition-colors focus:border-(--color-border-strong)"
    />
  );
}

// ─── push target ───────────────────────────────────────────────────────────

function PushTargetProperty({ task }: { task: Task }) {
  const updateTask = useStore((s) => s.updateTask);
  const hasAccount = useStore(
    (s) => Object.keys(s.googleAccounts).length > 0,
  );
  if (!hasAccount) return null;
  return (
    <PropertyRow icon={<Calendar size={13} />} label="Calendar">
      <PushTargetPicker
        value={task.pushTarget}
        onChange={(target) => {
          updateTask(task.id, { pushTarget: target });
          void migrateBlocksToCurrentTarget(task.id);
        }}
      />
    </PropertyRow>
  );
}

// ─── guests ────────────────────────────────────────────────────────────────

function GuestsProperty({ task }: { task: Task }) {
  const block = useStore((s) => selectBlockForTask(s, task.id));
  const updateTask = useStore((s) => s.updateTask);
  const [draft, setDraft] = useState(task.attendees.join(", "));

  useEffect(() => {
    setDraft(task.attendees.join(", "));
  }, [task.attendees]);

  if (!block) return null; // can't invite to an unscheduled item

  const commit = () => {
    const emails = draft
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
    const before = task.attendees.join(",");
    const after = emails.join(",");
    if (before === after) return;
    updateTask(task.id, { attendees: emails });
    void pushTimeBlockToGoogle(block.id);
  };

  return (
    <PropertyRow icon={<Users size={13} />} label="Guests">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder="alice@example.com, bob@example.com"
        className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-xs outline-none transition-colors hover:border-(--color-border) focus:border-(--color-border-strong) focus:bg-(--color-surface)"
      />
    </PropertyRow>
  );
}

// ─── meet ──────────────────────────────────────────────────────────────────

function MeetProperty({ task }: { task: Task }) {
  const block = useStore((s) => selectBlockForTask(s, task.id));
  const updateTask = useStore((s) => s.updateTask);
  if (!block) return null;

  if (block.meetLink) {
    return (
      <PropertyRow icon={<Video size={13} />} label="Meet">
        <button
          onClick={() => openUrl(block.meetLink!).catch(() => {})}
          className="min-w-0 truncate text-left text-xs text-(--color-accent) underline decoration-(--color-accent)/40 underline-offset-2 transition-colors hover:decoration-(--color-accent)"
        >
          {block.meetLink}
        </button>
      </PropertyRow>
    );
  }
  if (task.wantsMeetLink) {
    return (
      <PropertyRow icon={<Video size={13} />} label="Meet">
        <span className="text-xs text-(--color-text-subtle)">
          Adding Meet link…
        </span>
      </PropertyRow>
    );
  }
  return (
    <PropertyRow icon={<Video size={13} />} label="Meet">
      <button
        onClick={() => {
          updateTask(task.id, { wantsMeetLink: true });
          void pushTimeBlockToGoogle(block.id);
        }}
        className="rounded-md border border-(--color-border) px-2 py-0.5 text-xs text-(--color-text-muted) transition-colors hover:bg-(--color-surface-muted) hover:text-(--color-text)"
      >
        Add Google Meet
      </button>
    </PropertyRow>
  );
}

// ─── shared parsing ────────────────────────────────────────────────────────

function parseEstimate(s: string): number | null {
  const trimmed = s.trim();
  if (!trimmed) return 0;
  const colon = trimmed.match(/^(\d+):(\d{1,2})$/);
  if (colon) return parseInt(colon[1]) * 60 + parseInt(colon[2]);
  const hm = trimmed.match(/^(\d+)h(\d+)m?$/i);
  if (hm) return parseInt(hm[1]) * 60 + parseInt(hm[2]);
  const justH = trimmed.match(/^(\d+(?:\.\d+)?)h$/i);
  if (justH) return Math.round(parseFloat(justH[1]) * 60);
  const justM = trimmed.match(/^(\d+)m?$/i);
  if (justM) return parseInt(justM[1]);
  return null;
}
