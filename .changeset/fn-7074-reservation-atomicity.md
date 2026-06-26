---
"@runfusion/fusion": patch
---

summary: Task creation no longer leaves orphaned reserved-ID records when a create fails partway.
category: fix
dev: createTaskWithDistributedReservation now commits the distributed_task_id_reservations row in the same SQLite transaction as the tasks-row insert, and a rollback guard reverts both the row and the reservation if post-insert task.json/PROMPT.md materialization or create validation fails, preventing committed-reservation-without-task phantoms. Adds transaction-participating allocator helpers for commit and failed-create rollback.
