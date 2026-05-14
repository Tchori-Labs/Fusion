---
"@runfusion/fusion": patch
---

Fix self-owned task branch conflicts so dispatch can reclaim an existing task worktree/branch instead of hard-failing with a branch conflict. Add a self-healing sweep that reclaims stranded self-owned branch conflicts for idle todo/in-progress tasks and emits `branch:auto-reclaim` run-audit telemetry including task/branch/worktree/tip/stranded commit metadata. Cross-task (`live-foreign`) branch collisions remain blocked and still require `fn task branch-recovery`.
