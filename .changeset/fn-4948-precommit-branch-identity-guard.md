---
"@runfusion/fusion": patch
---

Prevent cross-branch commit contamination at the source: every task worktree now installs a pre-commit hook that refuses commits when HEAD does not match the worktree's owning task branch (with an allowlist for parallel-step branches). As defense-in-depth, contamination auto-recovery now drops `obviously-misrouted` foreign commits whose task-id attribution and changed-path namespace unambiguously belong to another task (initial heuristic: `.changeset/fn-<that-id>-*`), instead of escalating them to human adjudication.
