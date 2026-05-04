---
"@fusion/engine": patch
---

Restrict merger staging to squash + fix-agent files; refuse to commit unrelated working-tree changes

Replaces the blanket `git add -A` in `commitOrAmendMergeWithFixes` with an explicit allowlist: only files that were squash-staged or explicitly modified by the in-merge verification fix agent are staged. Any other dirty files in the working tree are left untouched and a warning is logged naming each excluded path. Fixes a production bug where ~13 unrelated user-edited files were bundled into a task's squash commit.

Hardened by code review: replaced all shell-interpolated `git add` calls in `commitOrAmendMergeWithFixes` and the conflict-resolution helpers (`resolveWithOurs`, `resolveWithTheirs`, `resolveTrivialWhitespace`) with `execFile` array form to eliminate path-injection surface; adopted `git -z` NUL-delimited output for all dirty-file path queries in both `snapshotDirtyFiles` and `commitOrAmendMergeWithFixes` so paths with embedded spaces round-trip correctly; truncated long allowlist debug log lines to at most 20 entries.
