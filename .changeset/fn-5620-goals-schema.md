---
"@runfusion/fusion": patch
---

Add a new project-level `goals` table to the core schema and fresh database DDL.
Bump `SCHEMA_VERSION` from 91 to 92 with an idempotent migration that creates `goals` and `idxGoalsStatus`.
