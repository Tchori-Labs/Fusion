---
"@runfusion/fusion": patch
---

summary: The task-id allocator no longer treats a transient database error as "cold storage not installed" and proceeds anyway.
category: fix
dev: Three cold-storage queries in the async task-id allocator (`getMaxTaskSequenceFromTable`, `getKnownPrefixes`, `taskIdExists`) used a bare `catch` that read EVERY failure — including a permission or connectivity error — the same as "cold storage not installed," so `taskIdExists` could report a hard-deleted task's id as free and let the allocator reissue it. A new `isColdStorageMissingError` helper narrows the fallback to the actual compatibility signal (SQLSTATE 42P01, "relation does not exist"), walking a bounded `cause` chain, and rethrows anything else. Also: the single-issue GitHub import route now calls `assertImportedTaskPersisted` immediately after `createTask`, before the log-entry, comment-fetch, and image-attachment side effects run, instead of only at the end; and `assertImportedTaskPersisted` maps a REJECTED `getTask` (not just a confirmed-absent one) to the same `IMPORT_NOT_PERSISTED` code, with a message that says persistence could not be verified and the original error attached as `cause`.
