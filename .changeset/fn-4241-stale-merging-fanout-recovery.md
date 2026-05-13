---
"@runfusion/fusion": patch
---

Self-healing now clears downstream `blockedBy` fan-out when an `in-review` blocker has been stuck in `status=merging` past a configurable threshold, preventing a single hung merge-verification from freezing the todo lane.
