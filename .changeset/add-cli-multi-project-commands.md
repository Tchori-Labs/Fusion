---
"@gsxdsm/fusion": minor
---

Add CLI multi-project commands and --project flag support.

New commands:
- `kb project list [--json]` — List all registered projects with task counts and health
- `kb project add [name] [path] [--isolation <mode>] [--interactive]` — Register a project
- `kb project remove <name> [--force]` — Unregister a project
- `kb project show <name>` — Show project details with health and task counts
- `kb project info [name]` — Alias for show command
- `kb project set-default <name>` — Set default project
- `kb project detect` — Detect project from current directory

All task and settings commands now support `--project <name>` flag:
- `kb task list --project myapp`
- `kb settings --project myapp`

Projects are auto-detected from cwd by walking up to find `.fusion/`.
