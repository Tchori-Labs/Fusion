---
"@runfusion/fusion": minor
---

summary: Tasks with a manually-created open Pull Request are no longer auto-merged.
category: feature
dev: New PrInfo.manual flag set by POST /tasks/:id/pr/create; allowsAutoMergeProcessing now returns false when a task has an open manual PR (status === "open"), excluding it from the engine merge queue and self-healing sweeps until the human merges the PR. Pipeline (PR-merge-strategy) PRs are unaffected. FN-7182.
