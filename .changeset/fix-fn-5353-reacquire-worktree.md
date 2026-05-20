---
"@runfusion/fusion": patch
---

fix(FN-5353): reacquire fresh worktree when merge reuse handoff fails instead of falling back to main

When `mergeIntegrationWorktree=reuse-task-worktree` and no task worktree is available (worktree=null after executor teardown), the merger now acquires a fresh worktree (`git worktree add -b fusion/<id>`) instead of falling back to `cwd-main`. Falls back to `cwd-main` only if fresh acquisition itself throws. New audit events: `merge:reuse-fallback-new-worktree`, `merge:reuse-worktree-fresh-acquire`, `merge:reuse-worktree-fresh-acquired`, `merge:reuse-fallback-cwd-main`.
