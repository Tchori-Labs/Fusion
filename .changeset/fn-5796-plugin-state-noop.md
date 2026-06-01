---
"@runfusion/fusion": patch
---

Fix a spurious Settings → Plugins error for the bundled Dependency Graph plugin where plugin startup could fail with `Invalid state transition from "started" to "started"`.

Plugin state transitions now treat same-state updates as idempotent no-ops, while still allowing same-state calls with an explicit error payload to update the persisted error field without emitting a state-changed transition.
