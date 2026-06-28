---
"@runfusion/fusion": patch
---

summary: Plugin sidebar icons now refresh after a plugin rebuild instead of showing stale glyphs.
category: fix
dev: Dashboard-view metadata is re-derived from the authoritative on-disk manifest so rebuilt plugins do not serve stale dashboardViews icon, label, or placement values to navigation while the in-view bundle is current.
