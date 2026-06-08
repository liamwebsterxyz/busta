import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  Category,
  ISODate,
  Recurrence,
  Task,
  TimeBlock,
  UUID,
} from "../types/domain";
import { occursOn } from "../lib/recurrence";
import type { AuthTokens, ConnectedAccount } from "../google/oauth";
import type { GoogleCalendarSource, GoogleEvent } from "../google/calendar";
import { now, uuid } from "../lib/id";
import { todayISO } from "../lib/date";
import { localStorageAdapter } from "../storage/localStorageAdapter";

export type View = "week" | "month";
export type CalendarMode = "month" | "week";

export type ComposeTarget = { kind: "day"; day: ISODate } | { kind: "backlog" } | null;

export interface UIState {
  view: View;
  activeDay: ISODate;
  selectedTaskId: UUID | null;
  weekAnchor: ISODate;
  composing: ComposeTarget;
  openTaskId: UUID | null;
  /** Group id of a Google Calendar event currently shown in the event detail
   *  modal. Null when no event is open. */
  openEventGroupId: string | null;
  backlogDrawerOpen: boolean;
  calendarMode: CalendarMode;
  searchOpen: boolean;
}

export interface GoogleEventsState {
  byDay: Record<ISODate, GoogleEvent[]>;
  rangeFrom: ISODate | null;
  rangeTo: ISODate | null;
  loading: boolean;
  error: string | null;
  fetchedAt: number | null;
}

export interface GoogleCalendarsState {
  /** Available calendars per account email. */
  byAccount: Record<string, GoogleCalendarSource[]>;
  /** Selected calendar IDs per account email. */
  selectedByAccount: Record<string, string[]>;
  loading: boolean;
  error: string | null;
}

export interface GooglePushTarget {
  accountEmail: string;
  calendarId: string;
}

export interface StoreState {
  tasks: Record<UUID, Task>;
  timeBlocks: Record<UUID, TimeBlock>;
  categories: Record<UUID, Category>;
  ui: UIState;
  /** Connected Google accounts keyed by email. Empty when nothing is connected. */
  googleAccounts: Record<string, ConnectedAccount>;
  googleEvents: GoogleEventsState;
  googleCalendars: GoogleCalendarsState;
  /** Where new TimeBlocks get pushed as Google Calendar events. Auto-set on
   *  connect to the first account's primary calendar. */
  googlePushTarget: GooglePushTarget | null;
  /** Recently-deleted Google event keys ("<accountEmail>::<googleEventId>")
   *  with their expiry timestamp. Filters out in-flight poll responses that
   *  still carry the just-deleted event. Not persisted. */
  googleEventTombstones: Record<string, number>;
}

export interface StoreActions {
  addTask: (args: {
    title: string;
    day: ISODate | null;
    estimateMinutes?: number;
    categoryId?: UUID | null;
  }) => Task;
  updateTask: (id: UUID, patch: Partial<Omit<Task, "id" | "createdAt">>) => void;
  deleteTask: (id: UUID) => void;
  toggleComplete: (id: UUID) => void;
  toggleCompleteOnDay: (id: UUID, day: ISODate) => void;
  setRecurrence: (id: UUID, recurrence: Recurrence) => void;
  moveTaskToDay: (id: UUID, day: ISODate | null, targetOrder?: number) => void;
  reorderTaskInDay: (id: UUID, targetOrder: number) => void;

  addTimeBlock: (args: {
    taskId: UUID;
    day: ISODate;
    startMinute: number;
    durationMinutes: number;
  }) => TimeBlock;
  updateTimeBlock: (id: UUID, patch: Partial<Omit<TimeBlock, "id" | "createdAt">>) => void;
  deleteTimeBlock: (id: UUID) => void;
  moveTimeBlock: (id: UUID, args: { day?: ISODate; startMinute?: number }) => void;

  setActiveDay: (day: ISODate) => void;
  setWeekAnchor: (day: ISODate) => void;
  selectTask: (id: UUID | null) => void;
  startComposing: (target: NonNullable<ComposeTarget>) => void;
  stopComposing: () => void;
  openTask: (id: UUID) => void;
  closeTask: () => void;
  openEvent: (groupId: string) => void;
  closeEvent: () => void;
  setView: (view: View) => void;
  toggleBacklogDrawer: () => void;
  setCalendarMode: (mode: CalendarMode) => void;
  openSearch: () => void;
  closeSearch: () => void;
  toggleSearch: () => void;

  addCategory: (args: { name: string; colorKey: string }) => Category;
  updateCategory: (id: UUID, patch: Partial<Omit<Category, "id" | "createdAt">>) => void;
  deleteCategory: (id: UUID) => void;

  addGoogleAccount: (account: ConnectedAccount) => void;
  removeGoogleAccount: (email: string) => void;
  setGoogleTokens: (email: string, tokens: AuthTokens) => void;
  setGoogleEvents: (args: {
    events: GoogleEvent[];
    rangeFrom: ISODate;
    rangeTo: ISODate;
  }) => void;
  setGoogleLoading: (loading: boolean) => void;
  setGoogleError: (error: string | null) => void;
  setGoogleCalendarsForAccount: (
    email: string,
    available: GoogleCalendarSource[],
  ) => void;
  setGoogleCalendarsLoading: (loading: boolean) => void;
  setGoogleCalendarsError: (error: string | null) => void;
  toggleCalendarSelected: (email: string, calendarId: string) => void;
  setGooglePushTarget: (target: GooglePushTarget | null) => void;

  /** Link a local TimeBlock to a Google Calendar event after pushing. */
  linkTimeBlockToGoogle: (
    id: UUID,
    args: { eventId: string; accountEmail: string; calendarId: string },
  ) => void;
  /** Forget the link (e.g., before pushing as a fresh event). */
  unlinkTimeBlockFromGoogle: (id: UUID) => void;
  /** Set or clear the Meet link a GCal response gave us. */
  setTimeBlockMeetLink: (id: UUID, meetLink: string | undefined) => void;
  /** Update the attendees list on a cached Google event in place — used for
   *  optimistic RSVP updates while the PATCH is in flight. */
  updateGoogleAttendeesForEvent: (
    accountEmail: string,
    googleEventId: string,
    attendees: import("../google/calendar").GoogleAttendee[],
  ) => void;
  /** Tombstone a Google event so in-flight poll responses can't resurrect it. */
  tombstoneGoogleEvent: (accountEmail: string, googleEventId: string) => void;
}

export type Store = StoreState & StoreActions;

const initialUI = (): UIState => {
  const t = todayISO();
  return {
    view: "week",
    activeDay: t,
    selectedTaskId: null,
    weekAnchor: t,
    composing: null,
    openTaskId: null,
    openEventGroupId: null,
    backlogDrawerOpen: false,
    calendarMode: "month",
    searchOpen: false,
  };
};

// ─── hydration helpers ────────────────────────────────────────────────────
//
// Used by the persist `migrate` to fill in optional/added fields when loading
// from any prior persisted version. Pure functions — also safe to call from
// tests or seeders.

function hydrateTask(t: Partial<Task> & { id: UUID }): Task {
  return {
    id: t.id,
    title: t.title ?? "",
    notes: t.notes,
    estimateMinutes: t.estimateMinutes ?? 30,
    day: t.day ?? null,
    completedAt: t.completedAt ?? null,
    order: t.order ?? 0,
    categoryId: t.categoryId ?? null,
    recurrence: t.recurrence ?? "none",
    completions: t.completions ?? {},
    recurrenceTime: t.recurrenceTime,
    attendees: t.attendees ?? [],
    wantsMeetLink: t.wantsMeetLink ?? false,
    pushTarget: t.pushTarget,
    createdAt: t.createdAt ?? now(),
    updatedAt: t.updatedAt ?? now(),
  };
}

/** v7→v8 was the only schema-breaking change: the singular `google` field
 *  was collapsed into `googleAccounts`, and `googleCalendars` was reshaped to
 *  be per-account. Returns a copy of `p` with those fields normalized when
 *  coming from a pre-v8 persisted state; passes through otherwise. */
function legacyReshapePreV8(
  p: Record<string, unknown>,
  from: number,
): Partial<StoreState> {
  if (from >= 8) return p as Partial<StoreState>;
  const legacy = p as {
    google?: ConnectedAccount;
    googleAccounts?: Record<string, ConnectedAccount>;
    googleCalendars?: {
      selectedIds?: string[];
      selectedByAccount?: Record<string, string[]>;
    };
  };
  let googleAccounts = legacy.googleAccounts ?? {};
  if (legacy.google && !legacy.googleAccounts) {
    googleAccounts = { [legacy.google.email]: legacy.google };
  }
  let selectedByAccount = legacy.googleCalendars?.selectedByAccount ?? {};
  if (
    legacy.google &&
    legacy.googleCalendars?.selectedIds &&
    !legacy.googleCalendars.selectedByAccount
  ) {
    selectedByAccount = {
      [legacy.google.email]: legacy.googleCalendars.selectedIds,
    };
  }
  return {
    ...(p as Partial<StoreState>),
    googleAccounts,
    googleCalendars: {
      byAccount: {},
      selectedByAccount,
      loading: false,
      error: null,
    },
  };
}

/** Merge a persisted UI slice with the initial UI, restoring transient fields
 *  (selectedTaskId, openTaskId, composing, etc.) to their defaults. */
function hydrateUI(ui: Partial<UIState> | undefined): UIState {
  const init = initialUI();
  // v4 quirk: "backlog" was a third view; rehome to week + open the drawer.
  const rawView = ui?.view as string | undefined;
  const view: View = rawView === "month" ? "month" : "week";
  const backlogDrawerOpen =
    rawView === "backlog" ? true : (ui?.backlogDrawerOpen ?? init.backlogDrawerOpen);
  return {
    ...init,
    view,
    activeDay: ui?.activeDay ?? init.activeDay,
    weekAnchor: ui?.weekAnchor ?? init.weekAnchor,
    calendarMode: ui?.calendarMode ?? init.calendarMode,
    backlogDrawerOpen,
  };
}

const reflowOrders = (tasks: Record<UUID, Task>, day: ISODate | null) => {
  const list = Object.values(tasks)
    .filter((t) => t.day === day)
    .sort((a, b) => a.order - b.order);
  list.forEach((t, i) => {
    if (t.order !== i) tasks[t.id] = { ...t, order: i };
  });
};

export const useStore = create<Store>()(
  persist(
    (set, _get) => ({
      tasks: {},
      timeBlocks: {},
      categories: {},
      ui: initialUI(),
      googleAccounts: {},
      googleEvents: {
        byDay: {},
        rangeFrom: null,
        rangeTo: null,
        loading: false,
        error: null,
        fetchedAt: null,
      },
      googleCalendars: {
        byAccount: {},
        selectedByAccount: {},
        loading: false,
        error: null,
      },
      googlePushTarget: null,
      googleEventTombstones: {},

      addTask: ({ title, day, estimateMinutes = 30, categoryId = null }) => {
        const ts = now();
        const id = uuid();
        let created!: Task;
        set((s) => {
          const sameDay = Object.values(s.tasks).filter((t) => t.day === day);
          const task: Task = {
            id,
            title: title.trim(),
            estimateMinutes,
            day,
            completedAt: null,
            order: sameDay.length,
            categoryId,
            recurrence: "none",
            completions: {},
            attendees: [],
            wantsMeetLink: false,
            createdAt: ts,
            updatedAt: ts,
          };
          created = task;
          return { tasks: { ...s.tasks, [id]: task } };
        });
        return created;
      },

      updateTask: (id, patch) =>
        set((s) => {
          const t = s.tasks[id];
          if (!t) return s;
          return { tasks: { ...s.tasks, [id]: { ...t, ...patch, updatedAt: now() } } };
        }),

      deleteTask: (id) =>
        set((s) => {
          const { [id]: gone, ...rest } = s.tasks;
          if (!gone) return s;
          const blocks = Object.fromEntries(
            Object.entries(s.timeBlocks).filter(([, b]) => b.taskId !== id),
          );
          reflowOrders(rest, gone.day);
          const ui = {
            ...s.ui,
            openTaskId: s.ui.openTaskId === id ? null : s.ui.openTaskId,
            selectedTaskId: s.ui.selectedTaskId === id ? null : s.ui.selectedTaskId,
          };
          return { tasks: rest, timeBlocks: blocks, ui };
        }),

      toggleComplete: (id) =>
        set((s) => {
          const t = s.tasks[id];
          if (!t) return s;
          const completedAt = t.completedAt ? null : now();
          return { tasks: { ...s.tasks, [id]: { ...t, completedAt, updatedAt: now() } } };
        }),

      toggleCompleteOnDay: (id, day) =>
        set((s) => {
          const t = s.tasks[id];
          if (!t) return s;
          const completions = { ...t.completions };
          if (completions[day]) delete completions[day];
          else completions[day] = now();
          return {
            tasks: { ...s.tasks, [id]: { ...t, completions, updatedAt: now() } },
          };
        }),

      setRecurrence: (id, recurrence) =>
        set((s) => {
          const t = s.tasks[id];
          if (!t) return s;

          const wasRecurring = t.recurrence !== "none";
          const willBeRecurring = recurrence !== "none";
          let timeBlocks = s.timeBlocks;
          let recurrenceTime = t.recurrenceTime;
          let completions = t.completions;

          if (!wasRecurring && willBeRecurring) {
            // One-shot → recurring: lift the existing TimeBlock (if any) into
            // the recurring template so the time isn't lost.
            const block = Object.values(timeBlocks).find((b) => b.taskId === id);
            if (block) {
              recurrenceTime = {
                startMinute: block.startMinute,
                durationMinutes: block.durationMinutes,
              };
              timeBlocks = { ...timeBlocks };
              delete timeBlocks[block.id];
            }
          } else if (wasRecurring && !willBeRecurring) {
            // Recurring → one-shot: drop completions; recurrenceTime is no
            // longer meaningful (the user will schedule explicitly if wanted).
            recurrenceTime = undefined;
            completions = {};
          }

          return {
            tasks: {
              ...s.tasks,
              [id]: { ...t, recurrence, completions, recurrenceTime, updatedAt: now() },
            },
            timeBlocks,
          };
        }),

      moveTaskToDay: (id, day, targetOrder) =>
        set((s) => {
          const t = s.tasks[id];
          if (!t) return s;
          const fromDay = t.day;
          const tasks = { ...s.tasks };

          const destList = Object.values(tasks)
            .filter((x) => x.day === day && x.id !== id)
            .sort((a, b) => a.order - b.order);

          const insertAt = targetOrder ?? destList.length;
          destList.splice(insertAt, 0, { ...t, day, order: insertAt });

          destList.forEach((x, i) => (tasks[x.id] = { ...x, order: i, updatedAt: now() }));

          if (fromDay !== day) reflowOrders(tasks, fromDay);

          return { tasks };
        }),

      reorderTaskInDay: (id, targetOrder) =>
        set((s) => {
          const t = s.tasks[id];
          if (!t) return s;
          const list = Object.values(s.tasks)
            .filter((x) => x.day === t.day)
            .sort((a, b) => a.order - b.order);
          const from = list.findIndex((x) => x.id === id);
          if (from === -1) return s;
          const [moved] = list.splice(from, 1);
          list.splice(Math.max(0, Math.min(targetOrder, list.length)), 0, moved);
          const tasks = { ...s.tasks };
          list.forEach((x, i) => (tasks[x.id] = { ...x, order: i, updatedAt: now() }));
          return { tasks };
        }),

      addTimeBlock: ({ taskId, day, startMinute, durationMinutes }) => {
        const ts = now();
        const id = uuid();
        const block: TimeBlock = {
          id,
          taskId,
          day,
          startMinute: Math.max(0, Math.min(1440 - 1, Math.round(startMinute))),
          durationMinutes: Math.max(5, Math.round(durationMinutes)),
          createdAt: ts,
          updatedAt: ts,
        };
        set((s) => ({ timeBlocks: { ...s.timeBlocks, [id]: block } }));
        return block;
      },

      updateTimeBlock: (id, patch) =>
        set((s) => {
          const b = s.timeBlocks[id];
          if (!b) return s;
          return {
            timeBlocks: { ...s.timeBlocks, [id]: { ...b, ...patch, updatedAt: now() } },
          };
        }),

      deleteTimeBlock: (id) =>
        set((s) => {
          const { [id]: _gone, ...rest } = s.timeBlocks;
          return { timeBlocks: rest };
        }),

      moveTimeBlock: (id, { day, startMinute }) =>
        set((s) => {
          const b = s.timeBlocks[id];
          if (!b) return s;
          return {
            timeBlocks: {
              ...s.timeBlocks,
              [id]: {
                ...b,
                day: day ?? b.day,
                startMinute:
                  startMinute === undefined
                    ? b.startMinute
                    : Math.max(0, Math.min(1440 - 1, Math.round(startMinute))),
                updatedAt: now(),
              },
            },
          };
        }),

      setActiveDay: (day) => set((s) => ({ ui: { ...s.ui, activeDay: day } })),
      setWeekAnchor: (day) => set((s) => ({ ui: { ...s.ui, weekAnchor: day } })),
      selectTask: (id) => set((s) => ({ ui: { ...s.ui, selectedTaskId: id } })),
      startComposing: (target) => set((s) => ({ ui: { ...s.ui, composing: target } })),
      stopComposing: () => set((s) => ({ ui: { ...s.ui, composing: null } })),
      openTask: (id) =>
        set((s) => ({
          ui: { ...s.ui, openTaskId: id, selectedTaskId: id, openEventGroupId: null },
        })),
      closeTask: () => set((s) => ({ ui: { ...s.ui, openTaskId: null } })),
      openEvent: (groupId) =>
        set((s) => ({
          ui: { ...s.ui, openEventGroupId: groupId, openTaskId: null },
        })),
      closeEvent: () => set((s) => ({ ui: { ...s.ui, openEventGroupId: null } })),
      setView: (view) => set((s) => ({ ui: { ...s.ui, view } })),
      toggleBacklogDrawer: () =>
        set((s) => ({ ui: { ...s.ui, backlogDrawerOpen: !s.ui.backlogDrawerOpen } })),
      setCalendarMode: (calendarMode) => set((s) => ({ ui: { ...s.ui, calendarMode } })),
      openSearch: () =>
        set((s) => ({ ui: { ...s.ui, searchOpen: true, openTaskId: null } })),
      closeSearch: () => set((s) => ({ ui: { ...s.ui, searchOpen: false } })),
      toggleSearch: () =>
        set((s) => ({
          ui: { ...s.ui, searchOpen: !s.ui.searchOpen, openTaskId: null },
        })),

      addCategory: ({ name, colorKey }) => {
        const ts = now();
        const id = uuid();
        let created!: Category;
        set((s) => {
          const order = Object.keys(s.categories).length;
          const category: Category = {
            id,
            name: name.trim() || "Untitled",
            colorKey,
            order,
            createdAt: ts,
            updatedAt: ts,
          };
          created = category;
          return { categories: { ...s.categories, [id]: category } };
        });
        return created;
      },

      updateCategory: (id, patch) =>
        set((s) => {
          const c = s.categories[id];
          if (!c) return s;
          return {
            categories: { ...s.categories, [id]: { ...c, ...patch, updatedAt: now() } },
          };
        }),

      deleteCategory: (id) =>
        set((s) => {
          const { [id]: _gone, ...rest } = s.categories;
          // Detach tasks that referenced this category.
          const tasks = Object.fromEntries(
            Object.entries(s.tasks).map(([tid, t]) =>
              t.categoryId === id ? [tid, { ...t, categoryId: null, updatedAt: now() }] : [tid, t],
            ),
          );
          return { categories: rest, tasks };
        }),

      addGoogleAccount: (account) =>
        set((s) => {
          const cals = s.googleCalendars ?? {
            byAccount: {},
            selectedByAccount: {},
            loading: false,
            error: null,
          };
          const selectedByAccount = cals.selectedByAccount ?? {};
          const accounts = { ...(s.googleAccounts ?? {}), [account.email]: account };
          // First account → default push target = its primary calendar.
          const pushTarget =
            s.googlePushTarget ??
            (Object.keys(s.googleAccounts ?? {}).length === 0
              ? { accountEmail: account.email, calendarId: "primary" }
              : null);
          return {
            googleAccounts: accounts,
            googleCalendars: {
              ...cals,
              byAccount: cals.byAccount ?? {},
              selectedByAccount: {
                ...selectedByAccount,
                [account.email]: selectedByAccount[account.email] ?? ["primary"],
              },
            },
            googlePushTarget: pushTarget,
          };
        }),
      removeGoogleAccount: (email) =>
        set((s) => {
          const { [email]: _g, ...accounts } = s.googleAccounts;
          const { [email]: _c, ...byAccount } = s.googleCalendars.byAccount;
          const { [email]: _sel, ...selectedByAccount } =
            s.googleCalendars.selectedByAccount;
          const byDay: Record<ISODate, GoogleEvent[]> = {};
          for (const [d, list] of Object.entries(s.googleEvents.byDay)) {
            const keep = list.filter((e) => e.accountEmail !== email);
            if (keep.length) byDay[d] = keep;
          }
          // If push target was this account, move it to whichever account remains
          // (or clear if none).
          let pushTarget = s.googlePushTarget;
          if (pushTarget?.accountEmail === email) {
            const remaining = Object.keys(accounts);
            pushTarget = remaining.length
              ? { accountEmail: remaining[0], calendarId: "primary" }
              : null;
          }
          return {
            googleAccounts: accounts,
            googleCalendars: {
              ...s.googleCalendars,
              byAccount,
              selectedByAccount,
            },
            googleEvents: { ...s.googleEvents, byDay },
            googlePushTarget: pushTarget,
          };
        }),
      setGoogleTokens: (email, tokens) =>
        set((s) => {
          const acc = s.googleAccounts[email];
          if (!acc) return s;
          return {
            googleAccounts: { ...s.googleAccounts, [email]: { ...acc, tokens } },
          };
        }),
      setGoogleEvents: ({ events, rangeFrom, rangeTo }) =>
        set(() => {
          const byDay: Record<ISODate, GoogleEvent[]> = {};
          for (const e of events) {
            (byDay[e.day] ??= []).push(e);
          }
          for (const list of Object.values(byDay)) {
            list.sort((a, b) => a.startMinute - b.startMinute);
          }
          return {
            googleEvents: {
              byDay,
              rangeFrom,
              rangeTo,
              loading: false,
              error: null,
              fetchedAt: Date.now(),
            },
          };
        }),
      setGoogleLoading: (loading) =>
        set((s) => ({ googleEvents: { ...s.googleEvents, loading } })),
      setGoogleError: (error) =>
        set((s) => ({ googleEvents: { ...s.googleEvents, error, loading: false } })),
      setGoogleCalendarsForAccount: (email, available) =>
        set((s) => {
          const knownIds = new Set(available.map((c) => c.id));
          const previous = s.googleCalendars.selectedByAccount[email] ?? [];
          const filteredPrev = previous.filter((id) => knownIds.has(id));
          // If the user has never picked, pre-select Google's own "selected"
          // flag (the calendars they show in their main Google Calendar UI).
          const selected =
            filteredPrev.length > 0
              ? filteredPrev
              : available
                  .filter((c) => c.selected || c.primary)
                  .map((c) => c.id);
          return {
            googleCalendars: {
              ...s.googleCalendars,
              byAccount: { ...s.googleCalendars.byAccount, [email]: available },
              selectedByAccount: {
                ...s.googleCalendars.selectedByAccount,
                [email]: selected.length > 0 ? selected : ["primary"],
              },
              loading: false,
              error: null,
            },
          };
        }),
      setGoogleCalendarsLoading: (loading) =>
        set((s) => ({ googleCalendars: { ...s.googleCalendars, loading } })),
      setGoogleCalendarsError: (error) =>
        set((s) => ({
          googleCalendars: { ...s.googleCalendars, error, loading: false },
        })),
      toggleCalendarSelected: (email, calendarId) =>
        set((s) => {
          const current = s.googleCalendars.selectedByAccount[email] ?? [];
          const has = current.includes(calendarId);
          const next = has
            ? current.filter((x) => x !== calendarId)
            : [...current, calendarId];
          return {
            googleCalendars: {
              ...s.googleCalendars,
              selectedByAccount: {
                ...s.googleCalendars.selectedByAccount,
                [email]: next,
              },
            },
          };
        }),
      setGooglePushTarget: (target) => set(() => ({ googlePushTarget: target })),
      linkTimeBlockToGoogle: (id, { eventId, accountEmail, calendarId }) =>
        set((s) => {
          const b = s.timeBlocks[id];
          if (!b) return s;
          return {
            timeBlocks: {
              ...s.timeBlocks,
              [id]: {
                ...b,
                googleEventId: eventId,
                googleAccountEmail: accountEmail,
                googleCalendarId: calendarId,
                updatedAt: now(),
              },
            },
          };
        }),
      unlinkTimeBlockFromGoogle: (id) =>
        set((s) => {
          const b = s.timeBlocks[id];
          if (!b) return s;
          const {
            googleEventId: _e,
            googleAccountEmail: _a,
            googleCalendarId: _c,
            meetLink: _m,
            ...rest
          } = b;
          return {
            timeBlocks: { ...s.timeBlocks, [id]: { ...rest, updatedAt: now() } },
          };
        }),
      setTimeBlockMeetLink: (id, meetLink) =>
        set((s) => {
          const b = s.timeBlocks[id];
          if (!b) return s;
          return {
            timeBlocks: { ...s.timeBlocks, [id]: { ...b, meetLink, updatedAt: now() } },
          };
        }),
      tombstoneGoogleEvent: (accountEmail, googleEventId) =>
        set((s) => {
          const key = `${accountEmail}::${googleEventId}`;
          // 60s TTL: long enough to cover any in-flight poll, short enough
          // that if the delete actually failed we'll see the event again.
          const expiresAt = Date.now() + 60_000;
          // Opportunistically clean expired entries while we're here.
          const now = Date.now();
          const next: Record<string, number> = {};
          for (const [k, exp] of Object.entries(s.googleEventTombstones)) {
            if (exp > now) next[k] = exp;
          }
          next[key] = expiresAt;
          return { googleEventTombstones: next };
        }),
      updateGoogleAttendeesForEvent: (accountEmail, googleEventId, attendees) =>
        set((s) => {
          // Walk every cached slice of this event and swap in the new attendees.
          const byDay: Record<ISODate, GoogleEvent[]> = {};
          let touched = false;
          for (const [day, list] of Object.entries(s.googleEvents.byDay)) {
            const next = list.map((e) => {
              if (
                e.accountEmail === accountEmail &&
                e.googleEventId === googleEventId
              ) {
                touched = true;
                return { ...e, attendees };
              }
              return e;
            });
            byDay[day] = next;
          }
          if (!touched) return s;
          return { googleEvents: { ...s.googleEvents, byDay } };
        }),
    }),
    {
      name: "busta:v0",
      version: 14,
      storage: createJSONStorage(() => localStorageAdapter),
      // Persist only durable state. Transient UI fields (selectedTaskId,
      // openTaskId, composing, openEventGroupId, searchOpen) reset on load
      // via `hydrateUI`. `googleEventTombstones` is intentionally excluded —
      // tombstones are session-scoped.
      partialize: (s) => ({
        tasks: s.tasks,
        timeBlocks: s.timeBlocks,
        categories: s.categories,
        ui: {
          view: s.ui.view,
          activeDay: s.ui.activeDay,
          weekAnchor: s.ui.weekAnchor,
          calendarMode: s.ui.calendarMode,
          backlogDrawerOpen: s.ui.backlogDrawerOpen,
        },
        googleAccounts: s.googleAccounts,
        googleCalendars: {
          byAccount: {}, // refetched every session
          selectedByAccount: s.googleCalendars.selectedByAccount,
          loading: false,
          error: null,
        },
        googlePushTarget: s.googlePushTarget,
      }),
      // Migrations handle *schema-breaking* changes only. Field-defaulting
      // happens in `merge`, which runs on every load — so adding a new
      // optional field to Task just means extending `hydrateTask`, no
      // version bump required.
      migrate: (persisted: unknown, from): Partial<StoreState> => {
        if (!persisted || typeof persisted !== "object") return {};
        return legacyReshapePreV8(persisted as Record<string, unknown>, from);
      },
      // Zustand's default merge is a shallow top-level merge. We override to:
      //  1. hydrate `ui` (transient fields get reset to defaults), and
      //  2. hydrate every task (any new optional fields default cleanly).
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<StoreState> & {
          ui?: Partial<UIState>;
        };
        const tasks = Object.fromEntries(
          Object.entries((p.tasks ?? {}) as Record<UUID, Partial<Task>>).map(
            ([id, t]) => [id, hydrateTask({ ...t, id })],
          ),
        );
        return {
          ...current,
          ...p,
          tasks,
          ui: hydrateUI(p.ui),
        };
      },
    },
  ),
);

export function selectTasksForDay(state: StoreState, day: ISODate | null): Task[] {
  // Backlog: only non-recurring tasks with no day.
  if (day === null) {
    return Object.values(state.tasks)
      .filter((t) => t.day === null && t.recurrence === "none")
      .sort((a, b) => a.order - b.order);
  }
  // A given day: one-shot tasks anchored to it + any recurring task matching.
  return Object.values(state.tasks)
    .filter((t) => occursOn(t, day))
    .sort((a, b) => a.order - b.order);
}

export function selectBlocksForDay(state: StoreState, day: ISODate): TimeBlock[] {
  return Object.values(state.timeBlocks)
    .filter((b) => b.day === day)
    .sort((a, b) => a.startMinute - b.startMinute);
}

/** Recurring tasks that occur on `day` AND have a recurrenceTime template.
 *  These render as read-only virtual blocks on the timeline. */
export function selectRecurringScheduledForDay(
  state: StoreState,
  day: ISODate,
): Task[] {
  return Object.values(state.tasks)
    .filter(
      (t) =>
        t.recurrence !== "none" && t.recurrenceTime != null && occursOn(t, day),
    )
    .sort(
      (a, b) =>
        (a.recurrenceTime?.startMinute ?? 0) - (b.recurrenceTime?.startMinute ?? 0),
    );
}

export function selectBlockForTask(state: StoreState, taskId: UUID): TimeBlock | null {
  for (const b of Object.values(state.timeBlocks)) {
    if (b.taskId === taskId) return b;
  }
  return null;
}

/** Set of "<accountEmail>::<googleEventId>" for every TimeBlock that has been
 *  pushed to a Google calendar. Used to skip the GCal-side copy when rendering
 *  so we don't show the same event twice. */
export function selectOwnedGoogleEventKeys(state: StoreState): Set<string> {
  const out = new Set<string>();
  for (const b of Object.values(state.timeBlocks)) {
    if (b.googleEventId && b.googleAccountEmail) {
      out.add(`${b.googleAccountEmail}::${b.googleEventId}`);
    }
  }
  return out;
}

/** All event keys we want to hide right now: owned (duplicated by a local
 *  TimeBlock) + tombstoned (just-deleted, in-flight poll might still carry). */
export function selectIgnoredEventKeys(state: StoreState): Set<string> {
  const out = selectOwnedGoogleEventKeys(state);
  const now = Date.now();
  for (const [key, expiresAt] of Object.entries(state.googleEventTombstones)) {
    if (expiresAt > now) out.add(key);
  }
  return out;
}

export function selectGoogleEventsForDay(
  state: StoreState,
  day: ISODate,
): GoogleEvent[] {
  const events = state.googleEvents.byDay[day] ?? [];
  if (events.length === 0) return events;
  const ignored = selectIgnoredEventKeys(state);
  if (ignored.size === 0) return events;
  return events.filter(
    (e) => !ignored.has(`${e.accountEmail}::${e.googleEventId}`),
  );
}

/** The full byDay event map with ignored keys filtered out. Preserves array
 *  references for unchanged days so `useShallow` consumers don't re-render
 *  on every poll. Use this when you need *all* visible events across a range
 *  (MonthView, AllDayStrip); use `selectGoogleEventsForDay` for single-day
 *  callers. */
export function selectFilteredGoogleEventsByDay(
  state: StoreState,
): Record<ISODate, GoogleEvent[]> {
  const byDay = state.googleEvents.byDay;
  const ignored = selectIgnoredEventKeys(state);
  if (ignored.size === 0) return byDay;

  let mutated = false;
  const out: Record<ISODate, GoogleEvent[]> = {};
  for (const [day, events] of Object.entries(byDay)) {
    const kept = events.filter(
      (e) => !ignored.has(`${e.accountEmail}::${e.googleEventId}`),
    );
    if (kept.length === events.length) {
      out[day] = events;
    } else {
      mutated = true;
      if (kept.length > 0) out[day] = kept;
    }
  }
  return mutated ? out : byDay;
}

export function selectCategoriesOrdered(state: StoreState): Category[] {
  return Object.values(state.categories).sort((a, b) => a.order - b.order);
}
