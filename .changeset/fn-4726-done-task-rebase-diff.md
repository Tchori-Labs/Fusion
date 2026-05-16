---
"@runfusion/fusion": patch
---

Fix done-task Files Changed reporting for history-preserving rebase/cherry-pick merges by preferring the `rebaseBaseSha..commitSha` range when lineage aggregation is partial.
