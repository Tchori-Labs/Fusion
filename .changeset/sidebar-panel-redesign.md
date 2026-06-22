---
"@runfusion/fusion": minor
---

Dashboard navigation and panel redesign (desktop/tablet; mobile unchanged):

- **Right sidebar**: a single show/hide toggle now lives in the top header (replacing the tablet overflow menu); the dock is hidden when closed and no longer keeps a persistent icon rail or in-dock collapse button. Its tools (Files — now the default/first tab, Activity, Activity Log, Git Manager) render inline inside the dock instead of opening popup modals. Files opens inline with a pop-out to the resizable file modal. The embedded Git Manager adapts to its width (compact horizontal tab strip in the dock, full two-pane in the wide pop-out). The dependency graph no longer appears in the dock.
- **Left sidebar**: New Task button matches the item-highlight box; footer spacing between Collapse and Settings; divider before the secondary section removed with uniform row spacing. New main-content destinations — Workflows, Import Tasks (GitHub import, with the GitHub mark), and Automations (two-pane, Command Center styling) — render in the main panel instead of as modals.
- **Embedded views**: Planning Mode embeds without modal chrome (no header/close/shadow), fills the full content area, and renders correctly on mobile; the board WorkflowSwitcher is available in Planning. Dev Server header matches Command Center. Insights header wraps so actions don't overlap. List view's left pane can be dragged much narrower with two-line title wrapping.
- **Other**: the docked terminal no longer blurs or blocks the page behind it; the footer Terminal button renders as plain text like the running-state trigger; the workflow selector matches the project selector's styling, height, and font size; the Automations screen uses theme color tokens.
