---
"@runfusion/fusion": minor
---

summary: Add `fn workflow validate` to dry-run a custom workflow IR without creating or mutating it.
category: feature
dev: Adds the `fn_workflow_validate` agent tool, `POST /api/workflows/validate`, and the `fn workflow validate <id> | --file <path>` CLI command. Reuses the same parseWorkflowIr/trait/code-node/column-agent validation as create/update; performs no persistence.
