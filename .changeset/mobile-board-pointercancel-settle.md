---
"@runfusion/fusion": patch
---

summary: Fix mobile board column snapping — mid-screen rests, edge glitches, fling overshoot, false swipes from vertical card scrolls, and re-drags after tap-to-stop.
category: fix
dev: useColumnScrollSnap now ignores pointercancel while the touch stream is live, settles to nearest-with-min-progress (resolveSettleTargetIndex), requires horizontal-dominant finger travel for pan intent, and lets a gesture begun mid-transit settle to plain nearest so a corrective drag wins.
