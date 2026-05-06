# Plugin Management Guide

[← Docs index](./README.md)

This guide is the canonical end-user workflow for managing Fusion plugins across the full lifecycle: discover, install, enable/disable, configure, use, update, uninstall, and troubleshoot.

> Plugin author/developer details (manifest, SDK APIs, hooks, routes, and runtime implementation) live in [Plugin Authoring](./PLUGIN_AUTHORING.md).

## 1) Plugin basics

Fusion uses two plugin surfaces in Settings:

- **Fusion Plugins** (`Settings → Plugins → Fusion Plugins`): extend Fusion behavior (tools, routes, UI slots/views, runtimes)
- **Pi Extensions** (`Settings → Plugins → Pi Extensions`): manage pi extension packages/sources

These are related but different systems; do not treat Pi Extensions as Fusion Plugins.

### Lifecycle states

| State | Meaning |
|---|---|
| `installed` | Registered but not started yet |
| `started` | Loaded and active |
| `stopped` | Disabled/stopped |
| `error` | Failed to load or failed at runtime |

### Common locations

| Location | Purpose |
|---|---|
| `~/.fusion/plugins/` | Default local plugin install location |
| Bundled plugin manifests (shipped with Fusion) | Discoverable/installable from Plugin Manager |
| Custom local path (absolute path) | Install plugin from a local directory |

## 2) Discover available plugins

### Dashboard

1. Open **Settings → Plugins → Fusion Plugins**.
2. Review bundled entries in **Bundled Plugins** and currently installed entries.
3. Check each plugin’s status/state in the manager.

Expected outcome: You can see what is already installed, what is bundled and available, and each plugin’s current lifecycle state.

### CLI

1. Run:
   ```bash
   fn plugin list
   ```
2. Review installed plugin IDs and status.

Expected outcome: You have a terminal view of installed plugins for scripting/remote workflows.

## 3) Install plugins

### Install bundled plugin (dashboard)

1. Go to **Settings → Plugins → Fusion Plugins**.
2. In **Bundled Plugins**, click **Install** for the plugin.

Expected outcome: Plugin is registered and appears with an initial state (typically `installed` then `started` when enabled/loaded).

### Install from local path (dashboard)

1. Go to **Settings → Plugins → Fusion Plugins**.
2. Use **Install** and provide an absolute plugin path.
3. Confirm installation.

Expected outcome: Plugin is added to your local plugin set and appears in the manager.

### Install from local path (CLI)

1. Run:
   ```bash
   fn plugin install <path>
   ```
2. Confirm the plugin appears in:
   ```bash
   fn plugin list
   ```

Expected outcome: Plugin is installed from the specified path and visible in plugin listings.

## 4) Enable, disable, and reload plugins

### Dashboard

1. Open **Settings → Plugins → Fusion Plugins**.
2. Toggle plugin enable/disable controls.
3. Use reload controls when available.

Expected outcome: Plugin transitions between runtime states (`started` / `stopped`) and reflects transitions in the manager.

### CLI

```bash
fn plugin enable <id>
fn plugin disable <id>
```

Expected outcome: Plugin is enabled or disabled by ID.

## 5) Configure plugin settings

1. Go to **Settings → Plugins → Fusion Plugins**.
2. Open the plugin settings editor (gear/settings action).
3. Update fields and save.

Expected outcome: Plugin-defined settings are persisted and used by that plugin at runtime.

## 6) Verify plugin is working

After installing/enabling, verify success signals relevant to that plugin:

- New agent tools become available in runtime/tooling surfaces
- Plugin routes are reachable through plugin API paths
- Plugin UI slots/views appear in dashboard surfaces (tabs, sections, cards, nav entries)
- Runtime-providing plugins become available for runtime hint selection/usage
- Plugin state remains `started` (not `error`)

If you need capability-level details for a specific plugin, check its README and [Plugin Authoring](./PLUGIN_AUTHORING.md).

## 7) Update plugins

Fusion does not use a dedicated `fn plugin update` command. Update by reinstalling the desired plugin version/source.

### Dashboard

1. Reinstall from the bundled entry or updated local path.
2. Re-check state and behavior in the plugin manager.

### CLI

1. Re-run install against the updated source path:
   ```bash
   fn plugin install <path>
   ```
2. Confirm with:
   ```bash
   fn plugin list
   ```

Expected outcome: Updated plugin build/version is installed and operational.

## 8) Uninstall plugins

### Dashboard

1. Open **Settings → Plugins → Fusion Plugins**.
2. Uninstall the target plugin.

Expected outcome: Plugin is removed from the installed list and no longer active.

### CLI

1. Run:
   ```bash
   fn plugin uninstall <id> --force
   ```
2. Verify removal:
   ```bash
   fn plugin list
   ```

Expected outcome: Plugin is removed by ID.

## 9) Dashboard vs CLI mapping

| Workflow | Dashboard path | CLI command |
|---|---|---|
| List installed plugins | Settings → Plugins → Fusion Plugins | `fn plugin list` |
| Install plugin | Settings → Plugins → Fusion Plugins → Install | `fn plugin install <path>` |
| Enable plugin | Settings → Plugins → Fusion Plugins → Enable toggle | `fn plugin enable <id>` |
| Disable plugin | Settings → Plugins → Fusion Plugins → Disable toggle | `fn plugin disable <id>` |
| Uninstall plugin | Settings → Plugins → Fusion Plugins → Uninstall | `fn plugin uninstall <id> --force` |
| Scaffold new plugin (authoring) | n/a (developer workflow) | `fn plugin create <name>` |

## 10) Troubleshooting

### Plugin is in `error` state

1. Open **Settings → Plugins → Fusion Plugins** and inspect state/transition feedback.
2. Disable then re-enable the plugin.
3. Confirm plugin source path and dependencies are valid.
4. If needed, uninstall and reinstall the plugin.

### Plugin installed but features are not visible

1. Confirm plugin state is `started`.
2. Verify what that plugin actually contributes (tools/routes/UI/runtime) in plugin docs.
3. Confirm you are checking the correct dashboard surface (for example nav view vs settings section vs task detail slot).

### Confusion between Fusion Plugins and Pi Extensions

1. Use **Fusion Plugins** for Fusion plugin lifecycle management.
2. Use **Pi Extensions** only for pi extension sources/extensions/skills/prompts/themes.

### Need implementation/API details

Use [Plugin Authoring](./PLUGIN_AUTHORING.md) for manifest fields, lifecycle hook signatures, UI/runtime contribution contracts, and SDK examples.
