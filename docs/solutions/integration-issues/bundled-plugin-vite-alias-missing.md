---
title: Bundled plugin dashboard views fail to load when Vite alias is missing
date: 2026-06-06
category: integration-issues
module: plugins
problem_type: integration_issue
component: tooling
symptoms:
  - "Plugin fails to enable with: Unknown file extension \".css\" for /path/to/PluginView.css"
  - "Dynamic import of bundled plugin view returns 404 or module not found"
  - "Plugin works in its own package build but fails when loaded by the dashboard"
root_cause: incomplete_setup
resolution_type: config_change
severity: medium
tags: [plugins, bundled-plugins, vite, alias, dashboard-view, registration-drift, css-loader]
---

# Bundled plugin dashboard views fail to load when Vite alias is missing

## Problem

When a bundled plugin exports a dashboard view, the dashboard dynamically imports it at runtime via `registerBundledPluginViews.ts`. For this to work, the dashboard's Vite configuration must include a `resolve.alias` entry that maps the plugin's package name to its source directory. Without this alias, Vite cannot resolve the dynamic import, and the plugin view fails to load.

The error message is misleading: Vite reports `Unknown file extension ".css"` because the module resolution fails entirely and the error bubbles up through an unrelated loader path.

## Symptoms

- The Compound Engineering plugin (or any bundled plugin with a dashboard view) fails to enable
- Console shows: `Failed to enable Compound Engineering: Unknown file extension ".css" for /path/to/PluginView.css`
- The plugin's own package builds successfully — the issue only manifests when the dashboard tries to load it
- Other bundled plugins (e.g., dependency-graph) load correctly — they have aliases

## What Didn't Work

- Investigating CSS loader configuration — the `.css` error is a red herring; the real issue is module resolution
- Checking the plugin's `package.json` exports — they were correct (`"./dashboard-view"` → `"./src/dashboard-view.tsx"`)
- Verifying the plugin's CSS file exists and is valid — it was fine

## Solution

Add the missing `resolve.alias` entries to `packages/dashboard/vite.config.ts`:

```ts
// packages/dashboard/vite.config.ts
export default defineConfig({
  // ...
  resolve: {
    alias: {
      // ... existing aliases ...
      "@fusion-plugin-examples/compound-engineering/dashboard-view": resolve(
        __dirname,
        "../../plugins/fusion-plugin-compound-engineering/src/dashboard-view.tsx",
      ),
      "@fusion-plugin-examples/compound-engineering": resolve(
        __dirname,
        "../../plugins/fusion-plugin-compound-engineering/src/index.ts",
      ),
      // ... other plugin aliases ...
    },
  },
});
```

Both aliases are needed:
- The `/dashboard-view` alias resolves the view component import
- The package root alias resolves any internal imports the view makes to the plugin's index

## Why This Works

The dashboard uses dynamic imports with `@vite-ignore` to load plugin views at runtime:

```ts
// packages/dashboard/app/plugins/registerBundledPluginViews.ts
const mod = await import(/* @vite-ignore */ moduleId);
```

Vite's static analysis cannot trace these imports, so it relies on `resolve.alias` to map the module ID to a filesystem path. Without the alias, Vite falls through to default resolution, which fails because the plugin package is in a sibling `plugins/` directory outside the dashboard's root. The error surfaces through the CSS loader because Vite's fallback resolution path misattributes the failure.

## Prevention

- **When adding a bundled plugin with a dashboard view, grep for an existing plugin alias** in `packages/dashboard/vite.config.ts` and mirror the pattern for the new plugin
- **Verify the alias in both dev and production builds** — the alias must resolve correctly for Vite's dev server and its production bundler
- **Consider a consistency test** that asserts every plugin registered in `registerBundledPluginViews.ts` has a corresponding Vite alias (similar to the existing `lazy-loaded-views-docs.test.ts` that keeps the AGENTS.md view inventory in sync)
- **Watch for the misleading `.css` error** — when Vite reports an unknown file extension for a file that clearly exists, suspect module resolution failure before investigating loaders

## Related Issues

- `docs/solutions/integration-issues/bundled-plugin-registration-drift.md` — the broader registration-drift problem (4 independent lists for bundled plugins); this doc covers a fifth implicit registration point (Vite aliases)
- PR #1464 — the fix for the Compound Engineering alias
