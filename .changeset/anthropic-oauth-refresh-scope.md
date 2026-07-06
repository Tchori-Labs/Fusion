---
"@runfusion/fusion": patch
---

summary: Fix Anthropic subscription showing "logged in" while all model calls fail.
category: fix
dev: OAuth token refresh in `packages/engine/src/auth-storage.ts` sent a `scope` param (defaulting to `user:profile`), which per RFC 6749 §6 re-issued the access token narrowed to that scope and stripped `user:inference` — so refreshed tokens 403'd on every model call. Refresh now omits `scope` (preserving the originally-granted scopes, matching pi-ai's own refresh), and `ANTHROPIC_DEFAULT_SCOPES` mirrors the full Claude Code scope set. Existing narrowed tokens need one re-login to obtain a fresh broad grant.
