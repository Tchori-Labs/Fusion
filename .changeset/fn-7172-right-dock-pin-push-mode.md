---
"@runfusion/fusion": minor
---

summary: Add a pin toggle to the right sidebar to push content aside instead of overlaying it.
category: feature
dev: New persisted localStorage flag `fusion:right-dock-pinned` (default false). When pinned, `.right-dock` switches from absolute overlay to in-flow (`right-dock--pinned`, position: relative) so the shell flex layout reflows `.project-content`; unpinned restores overlay. Toggle lives in the right-dock toolbar.
