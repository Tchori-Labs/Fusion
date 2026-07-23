---
"@runfusion/fusion": patch
---

summary: Fix mobile board drag settling, edge snap-back, and fling overshoot between columns.
category: fix
dev: useColumnScrollSnap now ignores pointercancel while the touch stream is live, settles to nearest-with-min-progress (resolveSettleTargetIndex), requires horizontal-dominant finger travel for pan intent, and lets a gesture begun mid-transit settle to plain nearest so a corrective drag wins.
