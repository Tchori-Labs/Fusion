---
"@runfusion/fusion": minor
---

summary: Deep-link Settings sections and make view, task, and project URL transitions SPA-side without reloads.
category: feature
dev: New app/utils/viewUrlState.ts owns the view/section params; useViewState/useDeepLink now apply URL params on popstate; plugins can navigate via pushState + PopStateEvent.
