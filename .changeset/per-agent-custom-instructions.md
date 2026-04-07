---
"@gsxdsm/fusion": minor
---

Add per-agent custom instructions support. Each agent can now have `instructionsText` (inline markdown) and/or `instructionsPath` (path to a .md file) that are appended to the agent's system prompt at execution time. This enables customizing agent behavior (coding style, project conventions, review criteria) without modifying built-in system prompts.

- New fields on Agent type: `instructionsPath` and `instructionsText`
- New API endpoint: `PATCH /api/agents/:id/instructions`
- Dashboard: Custom Instructions section in agent Config tab
- Executor, triage, reviewer, and merger all resolve per-agent instructions at session creation
