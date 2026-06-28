---
"@runfusion/fusion": patch
---

summary: Fix Compound Engineering, Quick fix, and Review-heavy workflow tasks getting stuck in Todo.
category: fix
dev: linear() built-in workflows now synthesize the canonical default column traits (hold(capacity) on todo, wip on in-progress, merge on in-review) matching BUILTIN_CODING_WORKFLOW_IR, so the hold/release sweep dispatches their todo cards. Fixes FN-7190.
