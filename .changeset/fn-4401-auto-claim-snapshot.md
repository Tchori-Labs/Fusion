---
"@runfusion/fusion": patch
---

Cache no-task auto-claim candidates project-wide with scheduler-driven invalidation and a 30s TTL snapshot to reduce duplicate board scans. Add `autoClaimCandidatesInPrompt` (project setting + per-agent runtime override) to cap/suppress injected candidate lines in heartbeat prompts, and add a Coordination-only preset in Agent Detail to disable auto-claim for routing-style agents.
