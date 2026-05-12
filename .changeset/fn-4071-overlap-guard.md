---
"@runfusion/fusion": patch
---

Merger now detects when the Attempt 3 `-X ours` fallback under
`mergeConflictStrategy="smart-prefer-main"` would resolve files that main has
recently modified, and by default prefers the branch side on those overlapping
files to avoid silently discarding branch work (FN-3936). Configurable via the
new `mergeStrategyOverlapBehavior` setting (`flip-to-prefer-branch` default,
`warn-only`, or `ignore`).
