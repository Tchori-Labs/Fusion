---
"@runfusion/fusion": patch
---

Post-merge prompt workflow-step agent sessions now honor the assigned agent runtime model (`runtimeConfig.model`) when the workflow step does not provide its own model override, matching the rest of the merger session model resolution path.
