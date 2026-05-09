---
"@runfusion/fusion": patch
---

Fix in-review tasks getting stranded after pre-merge workflow completes. Two regressions piled up:

1. The `task:moved → in-review` immediate-handoff path silently no-op'd whenever `internalEnqueueMerge` short-circuited on a leaked `mergeActive` entry — and every skip reason ("paused", "blocker", "autoMerge off", "engine paused") returned without logging, so the silence was opaque. Each branch now logs at info or warn level, the handler clears its own stale `mergeActive` entry before enqueueing, and the catch block's message identifies the task instead of pretending the failure was always a settings read.
2. The 15s `scheduleMergeRetry` sweep ran `enqueueEligibleInReviewTasks` → `internalEnqueueMerge` blindly, so a leaked `mergeActive` entry from a wedged prior attempt would skip the same task on every poll forever. Tasks were only rescued by the 15-min maintenance recovery loop ("Auto-recovered: eligible in-review task re-enqueued for merge"). Added `reconcileStaleMergeActive()` which drops `mergeActive` entries that aren't queued and aren't the active merge target, and call it before each 15s sweep. `internalEnqueueMerge` also now warns when a leaked entry causes a skip, so the next regression is visible.
