---
"@runfusion/fusion": patch
---

summary: Newly created tasks always get a readable title instead of showing up untitled.
category: fix
dev: `resolveCreatedTaskTitle` now covers both task-creation insert helpers while preserving deferred `autoSummarizeTitles` replacement.
