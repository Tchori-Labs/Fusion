# fusion-plugin-grok-runtime

Grok CLI-backed provider/runtime plugin for Fusion.

## Install

This plugin ships bundled with Fusion and is auto-installed like the other
built-in runtime plugins. It shells out to an **operator-installed** `grok`
binary on PATH — Fusion never downloads or bundles the CLI itself.

- Canonical upstream repo: https://github.com/superagent-ai/grok-cli
- Docs / homepage: https://github.com/superagent-ai/grok-cli#readme
- Install script: https://raw.githubusercontent.com/superagent-ai/grok-cli/main/install.sh
- npm alternative: `bun add -g grok-dev` (see https://github.com/superagent-ai/grok-cli/releases)
- Binary name: `grok`
- This is a community-built project, not affiliated with xAI. No fixed
  release artifact is bundled by Fusion, so no checksum is pinned
  (`upstream-pending-verification`).

## Contract summary

- Provider ID: `grok-cli`
- Binary probe: `grok --version`
- **Auth model — the `grok` CLI owns its own authentication; Fusion does
  not require a Fusion-visible API key to enable/use it (FN-7716).** Grok
  has no `status`/`whoami` subcommand, so Fusion probes binary availability
  only and treats a working binary as "ready" (`authenticated: true`). The
  CLI itself resolves credentials from more sources than Fusion can see
  (`GROK_API_KEY` env var, a project `.env`, `grok -k <key>`,
  `GROK_BASE_URL`, sandbox secrets, etc.). Fusion additionally probes two of
  those locations — the `GROK_API_KEY` env var and
  `~/.grok/user-settings.json` → `{ "apiKey": "..." }` — purely as a
  **non-blocking informational hint** (`apiKeyDetected`); it never gates
  Enable or the authenticated state, and a missing/unreadable/malformed
  settings file degrades gracefully (never throws). The direct xAI
  OpenAI-compatible streaming path (base URL `https://api.x.ai/v1`) still
  uses `$GROK_API_KEY` when present, independent of the CLI provider.
- Model discovery: `grok models` (plain-text output, with pricing hints per
  the upstream README). The exact line shape is
  `upstream-pending-verification`, so discovery parses conservatively: the
  leading token before a ` - ` label separator, or before the first
  multi-space pricing column, is treated as the model id; ids are
  deduplicated. Output that happens to be JSON is tolerated defensively even
  though the CLI is not known to emit it.

## Enable via Settings → Authentication

1. Install the `grok` CLI and authenticate it by any method it supports
   (env var, project `.env`, `grok -k`, etc.) — Fusion does not need to see
   the key.
2. Open Settings → Authentication in the Fusion dashboard.
3. The "Grok — via Grok CLI" card shows probe status. Click **Enable** once
   the binary is available; a non-blocking hint appears only if Fusion did
   not detect a key, noting the direct xAI streaming path uses
   `GROK_API_KEY` when present.
4. Discovered Grok models (via `grok models`) then merge into the model
   picker under the `grok-cli` provider id.

## Notes

Do not invent a `grok status`/`whoami` JSON auth contract — readiness is
derived from binary availability, mirroring the Cursor CLI provider. See
`AGENTS.md`'s "External-integration evidence" policy for why the
release/checksum fields above stay at `upstream-pending-verification`.
