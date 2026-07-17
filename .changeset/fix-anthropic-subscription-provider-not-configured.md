---
"@runfusion/fusion": patch
---

summary: Fix Anthropic subscription logins failing tasks with "Provider is not configured: anthropic".
category: fix
dev: pi-ai >=0.80 resolves provider auth via `credentials.read(provider.id)` instead of `getApiKey()`, bypassing fusion's `anthropic-subscription` -> `anthropic` alias; alias it at the credential-store `read()` layer (`createFusionCredentialStore`). Also add "not configured" to `isRetryableModelSelectionError` so an unresolved provider triggers the configured fallback model instead of hard-failing.
