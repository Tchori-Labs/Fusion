---
"@runfusion/fusion": patch
---

Recover agent/task reassignment sync from upstream PR #58 (author: HarryCordewener). TaskStore.updateTask now keeps agents.taskId aligned with task.assignedAgentId, clears stale checkout leases held by the outgoing agent, and protects against races where the outgoing agent has already moved on.
