---
"@runfusion/fusion": patch
---

Fix phantom-merge guard stranding tasks whose branch content is already on
main under a different SHA (sibling-task duplication, cherry-pick, prior
in-merge fix). The merger finalize path now recognizes ancestor and
equivalent-patch-id branches as a no-op success instead of refusing the
merge. The FN-1858 phantom-merge guard remains intact for the real-phantom
case (no recoverable content anywhere).
