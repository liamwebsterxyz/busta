import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { BacklogDrawer } from "../backlog/BacklogDrawer";
import { useStore } from "../../store";

interface AppShellProps {
  main: ReactNode;
  aside?: ReactNode;
}

export function AppShell({ main, aside }: AppShellProps) {
  // Backlog drawer is mounted here at the app level so it works in every
  // view, not just Week board. b hotkey + sidebar toggle just flip
  // ui.backlogDrawerOpen; we handle the rendering.
  const backlogOpen = useStore((s) => s.ui.backlogDrawerOpen);

  return (
    <div className="flex h-full w-full">
      <Sidebar />
      {backlogOpen && <BacklogDrawer />}
      <main className="flex min-w-0 flex-1">
        <section className="min-w-0 flex-1 overflow-hidden">{main}</section>
        {aside && (
          <section className="w-80 shrink-0 border-l border-(--color-border) bg-(--color-surface)">
            {aside}
          </section>
        )}
      </main>
    </div>
  );
}
