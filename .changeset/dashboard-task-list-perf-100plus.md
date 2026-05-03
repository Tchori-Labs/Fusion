---
"@runfusion/fusion": patch
---

Speed up dashboard load and interaction for projects with 100+ tasks.

Two cheap fixes that together cover the dominant hot paths:

- **DB indexes on `tasks.column` and `tasks.updatedAt`** (migration 59 in `packages/core/src/db.ts`). `listTasks()` filters by `"column"` on every board load, and the SSE/refresh paths sort by `updatedAt`; neither column had an index, so each query did a full table scan plus a temp B-tree sort. With 100+ tasks this becomes the dominant cost on initial load.
- **Debounce embedded detail-pane fetches** (`packages/dashboard/app/components/ListView.tsx`). `handleEmbeddedOpenDetail` previously fired a full `fetchTaskDetail` (which pulls log + comments) synchronously on every selection change, so rapid keyboard/mouse navigation through a long list would issue a burst of heavy requests. Fetches are now debounced to 200 ms and stale-target requests short-circuit before hitting the server and before applying state.
