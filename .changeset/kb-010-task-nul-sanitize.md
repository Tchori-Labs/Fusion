---
"@runfusion/fusion": patch
---

summary: Task creation and GitHub issue import now handle text containing NUL bytes.
category: fix
dev: Reuses sanitizeTextValue for task title and description descriptors.
