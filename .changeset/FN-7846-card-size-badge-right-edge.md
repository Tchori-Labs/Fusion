---
"@runfusion/fusion": patch
---

summary: Task card size badge (S/M/L) now sits flush against the card's right edge.
category: fix
dev: Renders `.card-size-badge` as the last child of `.card-header-actions` in TaskCard so its right margin equals the card's top padding (FN-7846).
