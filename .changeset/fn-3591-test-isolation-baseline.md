---
"@runfusion/fusion": patch
---

Fix `scripts/check-test-isolation.mjs` false-failing when `--before` and the
post-run check are invoked from different working directories (e.g. a worktree
recorded the baseline, then the main repo ran the check). The shared baseline
file in `tmpdir()` is now namespaced by a hash of the cwd so concurrent
worktrees don't clobber each other, and protected `.fusion` dirs that were
absent from the baseline are now skipped with a warning instead of being
treated as `{exists: false}` (which previously flagged the entire pre-existing
directory tree as a "test mutation").
