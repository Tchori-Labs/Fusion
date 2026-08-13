---
"@runfusion/fusion": patch
---

summary: GitHub imports now target the project you name and never report a task that was not saved.
category: fix
dev: Import routes require an explicit projectId once more than one project is registered (400 PROJECT_ID_REQUIRED), verify persistence with a read-back (500 IMPORT_NOT_PERSISTED), match issue URLs at a boundary, and the task-id allocator reserves ids held by cold-storage archived tasks.
