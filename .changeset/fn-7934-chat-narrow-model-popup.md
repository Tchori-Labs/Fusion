---
"@runfusion/fusion": patch
---

summary: Fix the in-chat model/thinking popup being cut off inside a narrow floating Chat window.
category: fix
dev: The popover's viewport-fitting inset is now keyed on ChatView's .chat-view--narrow class (surface width, incl. floating window / compact dock) instead of only @media (max-width: 768px) (browser viewport), so a narrow floating Chat window on a wide viewport no longer clips the popup. CustomModelDropdown is unchanged.
