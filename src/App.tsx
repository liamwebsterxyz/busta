import { useEffect, type ReactElement } from "react";
import { enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { AppShell } from "./components/layout/AppShell";
import { ErrorBoundary } from "./components/layout/ErrorBoundary";
import { WeekBoard } from "./components/board/WeekBoard";
import { TaskDetail } from "./components/board/TaskDetail";
import { MonthView } from "./components/month/MonthView";
import { CalendarWeekView } from "./components/month/CalendarWeekView";
import { SearchPalette } from "./components/search/SearchPalette";
import { EventDetail } from "./components/google/EventDetail";
import { useGoogleSync } from "./google/useGoogleSync";
import { DayTimeline } from "./components/timeline/DayTimeline";
import { DndProvider } from "./dnd/DndProvider";
import { HotkeyProvider } from "./hotkeys/HotkeyProvider";
import { useStore } from "./store";

function Layout() {
  const view = useStore((s) => s.ui.view);
  const calendarMode = useStore((s) => s.ui.calendarMode);

  let main: ReactElement;
  let aside: ReactElement | undefined;
  if (view === "month") {
    main = calendarMode === "week" ? <CalendarWeekView /> : <MonthView />;
  } else {
    main = <WeekBoard />;
    aside = <DayTimeline />;
  }

  return <AppShell main={main} aside={aside} />;
}

export default function App() {
  useGoogleSync();
  useAutoLaunch();
  return (
    <ErrorBoundary>
      <HotkeyProvider>
        <DndProvider>
          <Layout />
          <TaskDetail />
          <EventDetail />
          <SearchPalette />
        </DndProvider>
      </HotkeyProvider>
    </ErrorBoundary>
  );
}

/** Opt the app into launch-at-login on the very first run. The flag is sticky
 *  so a later user-initiated disable (via System Settings) isn't undone on the
 *  next launch. */
const AUTOSTART_BOOTSTRAP_KEY = "busta:autostart-bootstrapped";

function useAutoLaunch() {
  useEffect(() => {
    if (localStorage.getItem(AUTOSTART_BOOTSTRAP_KEY) === "true") return;
    let cancelled = false;
    (async () => {
      try {
        if (!(await isEnabled())) await enable();
        if (!cancelled) {
          localStorage.setItem(AUTOSTART_BOOTSTRAP_KEY, "true");
        }
      } catch {
        // No-op outside Tauri (e.g., when running `npm run dev` in a browser).
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}
