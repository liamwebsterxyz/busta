const ROWS: [string, string][] = [
  ["⌘K", "Search tasks"],
  ["c", "Switch between Board and Calendar"],
  ["b", "Open / close Backlog drawer"],
  ["← / →", "Previous / next day (Board), or week / month (Calendar)"],
  ["⌥← / ⌥→", "Previous / next week, keeping the active day (Board)"],
  ["↑ / ↓", "Move task selection within the selected day (or Backlog)"],
  ["Enter", "Open selected task → else new task in selected day (or Backlog). On Month grid: open Calendar Week"],
  ["t", "Jump to today"],
  ["?", "Show / hide this help"],
];

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[380px] rounded-lg border border-(--color-border) bg-(--color-surface) p-5 shadow-xl"
      >
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Keyboard shortcuts</h2>
          <button
            onClick={onClose}
            className="text-xs text-(--color-text-subtle) hover:text-(--color-text)"
          >
            Esc
          </button>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {ROWS.map(([k, label]) => (
              <tr key={k}>
                <td className="w-20 py-1 font-mono text-[12px] text-(--color-text-muted)">
                  {k}
                </td>
                <td className="py-1 text-(--color-text)">{label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
