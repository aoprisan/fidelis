/**
 * Top-level tab shell: Plan · Info · Avansat. Purely presentational — it toggles
 * which of the three `.tabview` panels is visible and marks the pressed tab.
 * Tab state is transient (not persisted, not in the URL), matching how the
 * backtester/planner `mode` is held inside the app.
 */

export type Tab = "plan" | "info" | "advanced";

const viewId = (t: Tab): string => `view-${t}`;

/** Wire the `#tabBar` buttons and open `initial` (defaults to Plan). */
export function initTabs(initial: Tab = "plan"): void {
  const bar = document.getElementById("tabBar");
  if (!bar) throw new Error("Missing #tabBar");
  const buttons = Array.from(bar.querySelectorAll<HTMLButtonElement>("button[data-tab]"));

  const show = (tab: Tab): void => {
    for (const b of buttons) {
      const active = b.dataset.tab === tab;
      b.setAttribute("aria-selected", String(active));
      const view = document.getElementById(viewId(b.dataset.tab as Tab));
      if (view) view.hidden = !active;
    }
  };

  for (const b of buttons) b.onclick = () => show(b.dataset.tab as Tab);
  show(initial);
}
