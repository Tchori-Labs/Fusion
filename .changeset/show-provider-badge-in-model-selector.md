---
"@gsxdsm/fusion": patch
---

Show provider badge in model selector to disambiguate duplicate models from extensions.

When extensions like `pi-claude-cli` register models that duplicate built-in ones (same model ID, different provider), the model selector now shows a `[provider]` badge next to the model name. This matches pi's CLI behavior where duplicate models show their provider for disambiguation. The provider badge appears in the trigger button, the detail modal badge, and inline in each model row.
