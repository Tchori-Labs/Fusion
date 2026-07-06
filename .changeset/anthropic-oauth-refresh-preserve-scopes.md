---
"@runfusion/fusion": patch
---

summary: Fix Claude subscription login so model calls stop 403-ing after an OAuth token refresh.
category: fix
dev: `refreshAnthropicOAuthCredential` no longer sends `scope` on the refresh request (RFC 6749 §6 re-issues the token with exactly that scope, which stripped `user:inference` and narrowed refreshed tokens to `user:profile`). `ANTHROPIC_DEFAULT_SCOPES` now mirrors pi-ai's full granted Claude Code scope set so any fallback describes a usable token.
