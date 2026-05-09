---
"@runfusion/fusion": patch
---

Fix dependency-graph plugin failing to load under real Node ESM resolution by switching to Node16 module resolution semantics and ensuring emitted relative imports include `.js` extensions. Aliased `@fusion-plugin-examples/dependency-graph` (and its `/dashboard-view` subpath) in the dashboard's vite and vitest configs so the dashboard resolves the plugin from `src/` instead of a potentially stale `dist/`, preventing "Bundled plugin view unavailable" regressions when plugin source changes without a rebuild. Added regression tests for built-entrypoint Node-ESM safety and dashboard alias wiring.
