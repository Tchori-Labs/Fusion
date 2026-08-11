---
"@runfusion/fusion": patch
---

summary: Unscoped GET /api/approvals now lists approvals across all projects instead of silently reporting an empty queue.
category: fix
dev: Adds optional per-row projectId attribution; scoped reads and approval decisions remain explicitly project-scoped.
