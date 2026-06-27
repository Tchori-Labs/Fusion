---
"@runfusion/fusion": patch
---

summary: Project health In-Flight Agents now counts agents actively triaging tasks.
category: fix
dev: The dashboard /projects/:id/health route and the CLI fn project list/info in-flight count now add triage-column tasks with status "planning" (not paused) to the live in-progress count, matching FN-7097's countRunningAgentsInStore predicate; persisted projectHealth.inFlightAgentCount and slot semantics are unchanged.
