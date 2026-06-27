---
"@runfusion/fusion": patch
---

summary: Suppress brief footer Connecting flashes after one transient executor stats poll failure.
category: fix
dev: Debounces post-success suspension-like /api/executor/stats failures in useExecutorStats.
