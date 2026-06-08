import { useEffect } from "react";
import { addDays, addMonths, endOfMonth, startOfMonth, subMonths } from "date-fns";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store";
import { fromISODate, toISODate } from "../lib/date";
import {
  listCalendars,
  listEventsForRange,
  type GoogleEvent,
} from "./calendar";

const POLL_MS = 10_000;

/**
 * Keeps cached Google data fresh.
 *
 *  - Fetches each connected account's calendar list (once per session).
 *  - Maintains a 3-month sliding window (prev / curr / next month) centered
 *    on the user's current `weekAnchor`. The window only changes when the
 *    anchor crosses a month boundary.
 *  - Polls the window every 10s so new invites land in ~sub-10s.
 *  - First fetch in a window flashes the syncing indicator; subsequent
 *    background polls are silent.
 *
 * Mount this once at the root.
 */
export function useGoogleSync() {
  const accountEmails = useStore(
    useShallow((s) => Object.keys(s.googleAccounts)),
  );
  const weekAnchor = useStore((s) => s.ui.weekAnchor);
  const selectedByAccount = useStore(
    useShallow((s) => s.googleCalendars.selectedByAccount),
  );
  const byAccount = useStore(useShallow((s) => s.googleCalendars.byAccount));
  const setLoading = useStore((s) => s.setGoogleLoading);
  const setEvents = useStore((s) => s.setGoogleEvents);
  const setError = useStore((s) => s.setGoogleError);
  const setCalendarsForAccount = useStore((s) => s.setGoogleCalendarsForAccount);
  const setCalsLoading = useStore((s) => s.setGoogleCalendarsLoading);
  const setCalsError = useStore((s) => s.setGoogleCalendarsError);

  // --- Calendar list fetch -------------------------------------------------
  useEffect(() => {
    const missing = accountEmails.filter(
      (email) => !byAccount[email] || byAccount[email].length === 0,
    );
    if (missing.length === 0) return;
    let cancelled = false;
    setCalsLoading(true);
    Promise.all(
      missing.map((email) =>
        listCalendars(email)
          .then((cals) => {
            if (!cancelled) {
              console.log(`[gcal] ${email}: ${cals.length} calendars`);
              setCalendarsForAccount(email, cals);
            }
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[gcal] calendarList(${email}) failed:`, msg);
            if (!cancelled) setCalsError(msg);
          }),
      ),
    ).finally(() => {
      if (!cancelled) setCalsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [
    accountEmails,
    byAccount,
    setCalendarsForAccount,
    setCalsLoading,
    setCalsError,
  ]);

  // --- Event sync (initial + polling) --------------------------------------
  // 3-month window centered on the user's current week, month-aligned.
  const focusMonth = startOfMonth(fromISODate(weekAnchor));
  const windowFrom = toISODate(startOfMonth(subMonths(focusMonth, 1)));
  const windowTo = toISODate(endOfMonth(addMonths(focusMonth, 1)));

  useEffect(() => {
    if (accountEmails.length === 0) {
      setEvents({ events: [], rangeFrom: "", rangeTo: "" });
      return;
    }
    let cancelled = false;
    const timeMin = fromISODate(windowFrom);
    const timeMax = addDays(fromISODate(windowTo), 1);

    const doFetch = async (silent: boolean) => {
      const fetches: Promise<GoogleEvent[]>[] = [];
      for (const email of accountEmails) {
        const ids = selectedByAccount[email] ?? [];
        if (ids.length === 0) continue;
        const cals = byAccount[email] ?? [];
        const colorById = new Map(cals.map((c) => [c.id, c.backgroundColor]));
        for (const id of ids) {
          fetches.push(
            listEventsForRange(email, timeMin, timeMax, id, colorById.get(id)).catch(
              (err) => {
                console.warn(`[gcal] skipping ${email}/${id}:`, err);
                return [] as GoogleEvent[];
              },
            ),
          );
        }
      }
      if (fetches.length === 0) {
        if (!cancelled) setEvents({ events: [], rangeFrom: windowFrom, rangeTo: windowTo });
        return;
      }

      if (!silent) setLoading(true);
      const started = performance.now();
      try {
        const batches = await Promise.all(fetches);
        if (cancelled) return;
        const events = batches.flat();
        const elapsed = Math.round(performance.now() - started);
        if (!silent) {
          console.log(`[gcal] fetched ${events.length} events in ${elapsed}ms`);
        }
        setEvents({ events, rangeFrom: windowFrom, rangeTo: windowTo });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[gcal] fetch failed:", msg);
        setError(msg);
      }
    };

    // Foreground fetch on mount / window change.
    void doFetch(false);
    // Background poll for new events / changes.
    const intervalId = setInterval(() => void doFetch(true), POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [
    windowFrom,
    windowTo,
    accountEmails,
    selectedByAccount,
    byAccount,
    setLoading,
    setEvents,
    setError,
  ]);
}
