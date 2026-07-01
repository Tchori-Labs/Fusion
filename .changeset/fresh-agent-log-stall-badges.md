---
"@runfusion/fusion": patch
---

summary: Stop showing stale in-review stall badges while agents are actively streaming logs.
category: fix
dev: TaskStore stall hydration now treats fresh buffered or persisted agent-log activity as active ownership.
