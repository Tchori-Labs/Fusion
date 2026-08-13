---
"@runfusion/fusion": patch
---

summary: Agents paused by repeated provider errors now resume after their retry cooldown expires.
category: fix
dev: Adds rearmExpiredRetryExhaustedAgents, the agent:rearm-error-retry-exhausted audit event, and a 15-minute metadata-clear floor.
