---
"@runfusion/fusion": minor
---

summary: Open tasks as popups now applies to List clicks with the same movable task window as the Board.
category: feature
dev: Threads openMobileTasksInPopup App -> MainContent -> ListView; ListView.handleRowClick routes to onPopOut/popOutTaskDetail (floating-window--task-detail) when enabled, on both desktop split-pane and mobile/tablet single-pane, preserving docked behavior when off.
