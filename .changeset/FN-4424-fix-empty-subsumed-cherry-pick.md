---
"@runfusion/fusion": patch
---

Merger now treats history-preserving cherry-picks that are fully duplicated on `main` as a clean no-op: tasks auto-complete to `done` with a clear log message instead of failing as `Auto-merge failed`. Partial duplicate branches also skip only empty cherry-picks and continue landing non-empty commits.
