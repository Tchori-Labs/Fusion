---
"@runfusion/fusion": patch
---

Workaround long-standing bug where ChatView's mobile send button only
fired on a long press — quick taps silently did nothing. The previous
implementation used `pointerdown` + `touchstart` with `preventDefault`
and a focus-preservation dance so the keyboard would stay up while
sending; on iOS that path made quick taps fall through entirely. The
button now uses plain `onClick` with `touch-action: manipulation`. The
soft keyboard may dismiss on send, which is a minor UX regression
compared to silent failure. QuickChat is unchanged (it already works
on mobile).
