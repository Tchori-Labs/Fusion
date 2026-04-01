---
"@gsxdsm/fusion": patch
---

Fix broken terminal feature in dashboard. The terminal modal had a race condition where xterm.js never initialized because the container div was conditionally rendered during session creation, and the initialization effect didn't re-run when the div became available.
