---
"@runfusion/fusion": patch
---

Fix: enabling GitHub tracking on a task imported from GitHub now creates a tracking issue instead of silently skipping. The board task card shows the tracking-issue link unless it points at the exact same `owner/repo#number` as the imported source issue.
