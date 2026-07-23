# Stable dashboard `data-testid` contract

[← Dashboard guide](./dashboard-guide.md) · [Plugin authoring guide](./PLUGIN_AUTHORING.md)

Fusion exposes the selectors below as a compatibility contract for dashboard integrators, plugins, and end-to-end tests. Contracted testids are based on stable entity or view ids rather than translated labels, CSS classes, or DOM position.

Removing or renaming a contracted testid is a breaking integrator change and requires a changeset plus an update to this page and its sync test. Additive selectors may be introduced without breaking existing integrations. Unless a pattern says otherwise, dynamic suffixes use the raw Fusion id without escaping.

## Machine-readable contract

`packages/dashboard/app/__tests__/testid-contract-docs.test.tsx` parses the delimited block below. Keep the entries one per line in `kind:value` form.

<!-- stable-dashboard-testid-contract:start -->
```text
settings-section-id:global-general
settings-section-id:keyboard-shortcuts
settings-section-id:authentication
settings-section-id:appearance
settings-section-id:notifications
settings-section-id:node-sync
settings-section-id:global-models
settings-section-id:global-mcp
settings-section-id:cli-agents
settings-section-id:research-global
settings-section-id:remote
settings-section-id:experimental
settings-section-id:hermes-runtime
settings-section-id:openclaw-runtime
settings-section-id:paperclip-runtime
settings-section-id:general
settings-section-id:commands
settings-section-id:worktrees
settings-section-id:scheduling
settings-section-id:scheduled-evals
settings-section-id:node-routing
settings-section-id:merge
settings-section-id:agent-permissions
settings-section-id:memory
settings-section-id:backups
settings-section-id:research-project
settings-section-id:project-models
settings-section-id:secrets
settings-section-id:mcp
settings-section-id:prompts
settings-section-id:plugins
static:settings-mobile-section-select
static:left-sidebar-nav
static:sidebar-nav-new-task
static:sidebar-nav-settings
static:project-selector-trigger
static:project-selector-dropdown
static:project-selector-search-input
dynamic:settings-section-<sectionId>
dynamic:sidebar-nav-<viewId>
dynamic:sidebar-nav-plugin-<pluginId>-<viewId>
dynamic:project-selector-item-<projectId>
dynamic:task-card-<taskId>
```
<!-- stable-dashboard-testid-contract:end -->

## Settings navigation

| Selector | Availability | Contract |
| --- | --- | --- |
| `settings-section-<sectionId>` | Desktop/tablet settings navigation | One button for every rendered non-group-header entry in `SETTINGS_SECTIONS`. The machine-readable `settings-section-id` entries above enumerate the current authoritative section ids. Search filtering can temporarily remove unmatched buttons. |
| `settings-mobile-section-select` | Mobile settings navigation | The section picker. Address an individual section with `option[value="<sectionId>"]`; per-option testids are intentionally not provided. |

Group-header ids such as `__global_header`, `__runtimes_header`, and `__project_header` are labels rather than selectable sections and are not part of this contract.

## Left sidebar navigation

The left sidebar is a desktop/tablet surface and is not rendered on mobile, where `MobileNavBar` owns navigation.

| Selector | Contract |
| --- | --- |
| `left-sidebar-nav` | Sidebar root. |
| `sidebar-nav-<viewId>` | Built-in destination. Current stable suffixes include `command-center`, `board`, `list`, `planning`, `missions`, `agents`, `chat`, `mailbox`, `skills`, `memory`, `documents`, `goals`, `automations`, `import-tasks`, `workflows`, `insights`, `research`, and `evals`; feature-gated entries render only when enabled. |
| `sidebar-nav-plugin-<pluginId>-<viewId>` | Plugin-provided destination, using the raw plugin and view ids. |
| `sidebar-nav-new-task` | Persistent New Task action when its callback is available. |
| `sidebar-nav-settings` | Persistent Settings action. |

## Project selector

| Selector | Contract |
| --- | --- |
| `project-selector-trigger` | Opens the project selector when the selector is available. |
| `project-selector-dropdown` | Open project selector listbox. |
| `project-selector-search-input` | Project search/type-ahead input inside the open dropdown. |
| `project-selector-item-<projectId>` | Selectable project row in bookmarked, recent, filtered, and general result groups, using the raw project id. |

## Task cards

`task-card-<taskId>` identifies the `TaskCard` component root using the raw task id. The selector is present on every host surface, including board columns, worktree groups, dashboard/plugin hosts, and right-dock lists, and remains on the root while the card is in its editing or saving render path.

## Non-contracted testids

Any dashboard testid not listed in the machine-readable block is an implementation detail and is not covered by this stability promise. Examples include `bookmark-toggle-<projectId>`, `manage-projects-action`, `card-menu-btn-<taskId>`, `sidebar-nav-collapse-toggle`, and `sidebar-nav-resize-handle`. Integrators should not depend on undocumented selectors remaining available or unchanged.
