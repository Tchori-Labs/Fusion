---
"@runfusion/fusion": patch
---

User-initiated drag/move of an in-progress task back to todo now hard-cancels the active executor session, aborts running task work before disposal, and parks the task with `userPaused: true` so scheduler dispatch does not immediately restart it.
