---
"@fusion/dashboard": patch
---

fix(dashboard): pull syncs the worktree to local integration tip, not just to origin

The integration-mode `POST /api/git/pull` (used by the merge-advance-notice banner) only ran `git merge --ff-only origin/<branch>` after fetching. When the merger had advanced local `refs/heads/<integrationBranch>` via `update-ref` but the user hadn't pushed yet, the worktree's HEAD already resolved to the new sha (symbolic ref follow) but the working tree and index were still at the old state. The fast-forward step short-circuited (`already up to date with origin`) and the user saw "Pull completed" with `fromSha === toSha` while their files visibly stayed behind.

Pull now explicitly resets the worktree to `refs/heads/<integrationBranch>` after the origin fast-forward step. The autostash above protects user edits, so the reset is safe regardless of whether the origin FF ran.
