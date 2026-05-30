---
"@runfusion/fusion": patch
---

Treat foreign-attributed commits reachable from origin/main as already integrated during branch contamination checks to avoid false-positive recovery loops when local main is stale.
