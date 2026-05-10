---
"@runfusion/fusion": patch
---

Align `fn_task_retry` retry classification for `in-review` failures across dashboard and CLI surfaces. Execution-failed review tasks (incomplete steps) now retry back to `todo` with preserved progress, while merge-only failures (all steps done) stay in `in-review` with merge retry state reset. Also removes visible mission validation board-task creation in favor of internal validator runs.