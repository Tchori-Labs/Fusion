---
"@fusion/core": patch
---

Fix `reconcileOrphanedTaskDirs` silently resurrecting long-deleted tasks onto the live board after a restart ("all task IDs reset / starting over").

The sweep re-imports `.fusion/tasks/<id>/` directories that have no DB row, to recover heartbeat-created dirs that race store init or rows lost to a recent DB corruption. But it didn't distinguish a genuinely-recent orphan from an ancient deleted-task dir that merely lingered on disk. Modern deletes leave a soft-delete tombstone (caught by `taskIdExistsAnywhere`), but legacy hard-deletes left no tombstone — so a months-old `task.json` with no DB row was re-imported as a live task, surfacing old low-numbered IDs (FN-001, FN-002, …) at the top of the board.

Reconcile now gates recovery on a recency window (`task.json` modified within the last 7 days). Older orphan dirs are skipped with reason `stale-orphan-dir-beyond-recency-window` and left for explicit recovery (unarchive/restore) or directory cleanup, while heartbeat-race and recent-corruption recovery still work.
