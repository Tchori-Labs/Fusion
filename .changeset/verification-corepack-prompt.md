---
"@runfusion/fusion": patch
---

Disable Corepack's interactive download prompt when spawning verification commands so non-TTY children no longer hang until the hard timeout when a repo pins `packageManager` to a version Corepack hasn't cached yet.
