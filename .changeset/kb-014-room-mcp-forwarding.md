---
"@runfusion/fusion": patch
---

summary: Chat room agents now receive configured MCP tools with the same approval gating as tasks and direct chat.
category: fix
dev: ChatManager.generateRoomResponderReply forwards resolveMcpServersForStore(taskStore, { agentId: responder.id }).servers into createResolvedAgentSession, matching the direct-chat/QuickChat lane (Tchori-Labs/Fusion#16).
