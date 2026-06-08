import { HotkeysProvider as RHHProvider, useHotkeys } from "react-hotkeys-hook";
import { useState, type ReactNode } from "react";
import { addDays, addMonths } from "date-fns";
import { selectTasksForDay, useStore } from "../store";
import { fromISODate, toISODate, todayISO, weekStarting } from "../lib/date";
import { HelpOverlay } from "./HelpOverlay";
import type { Task } from "../types/domain";

export function HotkeyProvider({ children }: { children: ReactNode }) {
  return (
    <RHHProvider initiallyActiveScopes={["*"]}>
      <HotkeyBindings />
      {children}
    </RHHProvider>
  );
}

function HotkeyBindings() {
  const [showHelp, setShowHelp] = useState(false);
  const opts = { preventDefault: true } as const;

  // `c` — toggle Board <-> Calendar. Calendar remembers your last sub-mode
  // (Month grid vs Week), so every in/out transition is one press. Sub-mode
  // switching is done via the segmented control in the calendar header, by
  // clicking a day in the month grid, or by Esc out of Calendar Week.
  useHotkeys(
    "c",
    () => {
      const s = useStore.getState();
      if (s.ui.view === "week") s.setView("month");
      else s.setView("week");
    },
    opts,
  );

  // Enter — context-aware:
  //   modal open (search/task/event) → swallowed, modals handle their own
  //   a task is selected in the active list → open its detail modal
  //   backlog drawer open           → compose a new task in the backlog
  //   Board view                    → compose a new task in the selected day
  //   Month grid                    → drill into Calendar Week
  // react-hotkeys-hook ignores form-tag focus by default, so typing Enter
  // inside an existing AddTaskInline input commits that input rather than
  // triggering this handler.
  useHotkeys(
    "enter",
    () => {
      const s = useStore.getState();
      if (modalOpen(s)) return;
      const list = activeTaskList(s);
      if (s.ui.selectedTaskId && list.some((t) => t.id === s.ui.selectedTaskId)) {
        s.openTask(s.ui.selectedTaskId);
        return;
      }
      if (s.ui.backlogDrawerOpen) {
        s.startComposing({ kind: "backlog" });
        return;
      }
      if (s.ui.view === "week") {
        s.startComposing({ kind: "day", day: s.ui.activeDay });
        return;
      }
      if (s.ui.view === "month" && s.ui.calendarMode === "month") {
        s.setCalendarMode("week");
      }
    },
    opts,
  );

  // ↓ / ↑ — navigate tasks within the active list (selected day's tasks, or
  // the Backlog when its drawer is open). Wraps at boundaries by clamping.
  useHotkeys("down", () => moveSelection(1), opts);
  useHotkeys("up", () => moveSelection(-1), opts);

  // `b` — toggle Backlog drawer. Drawer is mounted at the app level so it
  // works in every view; no need to switch views first.
  useHotkeys("b", () => useStore.getState().toggleBacklogDrawer(), opts);

  // ← / → — on Board: shift active day by 1 (week follows when crossing a
  // boundary). On Month grid: shift by month. On Calendar Week: shift by week.
  useHotkeys("left", () => shiftByContext(-1), opts);
  useHotkeys("right", () => shiftByContext(1), opts);

  // ⌥← / ⌥→ — on Board: shift the visible week by 7 days, keeping the
  // active day on the same day-of-week.
  useHotkeys("alt+left", () => shiftWeekKeepingDay(-1), opts);
  useHotkeys("alt+right", () => shiftWeekKeepingDay(1), opts);

  // `t` — jump to today (week anchor + active day).
  useHotkeys(
    "t",
    () => {
      const t = todayISO();
      const s = useStore.getState();
      s.setWeekAnchor(t);
      s.setActiveDay(t);
    },
    opts,
  );

  // ⌘K / Ctrl+K — open / close search. `enableOnFormTags` so it still works
  // when the search input itself has focus (lets ⌘K close the palette).
  useHotkeys("mod+k", () => useStore.getState().toggleSearch(), {
    ...opts,
    enableOnFormTags: true,
  });

  // `?` — help. Bound two ways so it works across keyboard layouts/browsers.
  useHotkeys("?", () => setShowHelp((v) => !v), { ...opts, useKey: true });
  useHotkeys("shift+/", () => setShowHelp((v) => !v), opts);

  // Esc — search > detail > event detail > calendar-week->month > clear selection.
  useHotkeys("escape", () => {
    const s = useStore.getState();
    if (s.ui.searchOpen) {
      s.closeSearch();
      return;
    }
    if (s.ui.openTaskId) {
      s.closeTask();
      return;
    }
    if (s.ui.openEventGroupId) {
      s.closeEvent();
      return;
    }
    if (s.ui.view === "month" && s.ui.calendarMode === "week") {
      s.setCalendarMode("month");
      return;
    }
    s.selectTask(null);
  });

  return showHelp ? <HelpOverlay onClose={() => setShowHelp(false)} /> : null;
}

function shiftByContext(delta: -1 | 1) {
  const s = useStore.getState();
  if (s.ui.view === "week") {
    // Board view: move the active day by 1; let the week follow if we cross
    // a boundary.
    const nextDay = addDays(fromISODate(s.ui.activeDay), delta);
    const nextDayISO = toISODate(nextDay);
    s.setActiveDay(nextDayISO);
    const weekStart = weekStarting(fromISODate(s.ui.weekAnchor));
    const weekEnd = addDays(weekStart, 6);
    if (nextDay < weekStart || nextDay > weekEnd) {
      s.setWeekAnchor(nextDayISO);
    }
    return;
  }
  const onMonthGrid = s.ui.calendarMode === "month";
  const next = onMonthGrid
    ? addMonths(fromISODate(s.ui.weekAnchor), delta)
    : addDays(fromISODate(s.ui.weekAnchor), delta * 7);
  s.setWeekAnchor(toISODate(next));
}

function shiftWeekKeepingDay(delta: -1 | 1) {
  const s = useStore.getState();
  if (s.ui.view !== "week") return;
  const nextAnchor = addDays(fromISODate(s.ui.weekAnchor), delta * 7);
  const nextActive = addDays(fromISODate(s.ui.activeDay), delta * 7);
  s.setWeekAnchor(toISODate(nextAnchor));
  s.setActiveDay(toISODate(nextActive));
}

type State = ReturnType<typeof useStore.getState>;

function modalOpen(s: State): boolean {
  return (
    s.ui.searchOpen ||
    s.ui.openTaskId !== null ||
    s.ui.openEventGroupId !== null
  );
}

/** The list of tasks Up/Down/Enter operate on, given the current view. */
function activeTaskList(s: State): Task[] {
  if (s.ui.backlogDrawerOpen) return selectTasksForDay(s, null);
  if (s.ui.view === "week") return selectTasksForDay(s, s.ui.activeDay);
  return [];
}

function moveSelection(delta: -1 | 1) {
  const s = useStore.getState();
  if (modalOpen(s)) return;
  const list = activeTaskList(s);
  if (list.length === 0) return;
  const idx = list.findIndex((t) => t.id === s.ui.selectedTaskId);
  let nextIdx: number;
  if (idx === -1) {
    // No current selection in the active list — entering from the top picks
    // the first item, from the bottom picks the last.
    nextIdx = delta === 1 ? 0 : list.length - 1;
  } else {
    nextIdx = Math.max(0, Math.min(list.length - 1, idx + delta));
  }
  s.selectTask(list[nextIdx].id);
}
