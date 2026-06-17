---
"@runfusion/fusion": patch
---

Fix `fn_task_list` crashes when the runtime `@fusion/core` formatter export is unavailable by resolving defensively and returning bounded fallback text.
