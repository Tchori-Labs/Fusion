---
"@fusion/core": minor
"@fusion/engine": minor
---

fix(engine,core): dedup heartbeat-spawned follow-ups by parent task

Heartbeat agents create follow-up tasks via `fn_task_create`. Until
now, the intake similarity guard scoped candidates by `sourceAgentId`
only, so the same parent task could spawn many sibling tasks across
heartbeats whenever triage rewrote their titles enough to dodge the
title-fingerprint guard.

The task-scoped heartbeat now stamps `sourceParentTaskId` (and
`sourceRunId`) on every `fn_task_create`, and the intake duplicate
matcher treats a candidate as a sibling when it shares either the
caller's agent ID or the caller's parent task ID. Same-parent
siblings with similar descriptions are auto-archived as before.

Tool description and heartbeat prompts also now instruct agents to
scan existing open tasks before creating, as a belt-and-suspenders
layer above the deterministic dedup.
