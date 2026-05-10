# fusion-plugin-cli-printing-press

Bundled first-party Fusion plugin that adds a plugin-owned dashboard wizard for drafting an external service CLI definition.

## v1 scope (FN-3763)

- Provides one dashboard view: **Create Service CLI** (`viewId: wizard`)
- Wizard collects service basics, HTTP transport details, endpoints, and non-OAuth credential placeholders
- Saves draft payloads to interim JSON files under:
  - `<projectRoot>/.fusion/plugins/cli-printing-press/drafts/<id>.json`
- Success state is **draft saved** only

## Provisional architecture assumptions (pending FN-3762/FN-3766)

The following choices are intentionally provisional and may be revised by architecture/storage follow-up work:

- `PluginContext` usage pattern in route handlers
- Express route shape and plugin-relative path conventions
- Credential union shape for wizard payloads (non-OAuth only in v1)
- Draft storage location and JSON schema

## Deferred follow-ups

- OAuth credential flows: **FN-3762 / FN-3766**
- Draft management views (list/inspect/edit): **FN-3764**
- Run/test and regenerate actions: **FN-3765**
- Canonical storage migration (replace JSON stash): **FN-3766**
- Runtime exposure/integration: **FN-3767**
- Workflow-step exposure: **FN-3768**

## Frontend API target

The wizard posts drafts to `/api/plugins/fusion-plugin-cli-printing-press/drafts` (host-prefixed plugin route target), following the roadmap plugin routing convention.
