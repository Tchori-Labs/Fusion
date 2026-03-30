---
"@dustinbyrne/kb": patch
---

Fix terminal session leak: WebSocket disconnect now properly kills PTY sessions. Added stale session eviction to automatically clean up inactive sessions when approaching the session limit. Session listing endpoint now includes `lastActivityAt` for observability.
