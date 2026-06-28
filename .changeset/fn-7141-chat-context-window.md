---
"@runfusion/fusion": minor
---

summary: Show an estimated token count against the model's context window in the chat thread header.
category: feature
dev: Client-side estimate via app/utils/estimateChatTokens.ts; context window from ModelInfo.contextWindow. Desktop Direct-chat header only; hidden on mobile, in rooms, and when the model context window is unknown.
