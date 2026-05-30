---
"@runfusion/fusion": patch
---

Realize the mission completion-gate contract for live Goals mission workflows.

- Fix mission execution auto-pass behavior so zero-assertion features move to `loopState: "passed"` (not stuck in `implementing`) and emit `feature_auto_passed_no_assertions` telemetry while preserving `validation:passed` emission.
- Add milestone guard signaling for prose acceptance criteria with zero structured assertions via `hasProseButNoAssertions` rollup and warning event `milestone_missing_structured_assertions`.
- Add an idempotent `seedContractAssertionsForFeatures(...)` helper for operator-run assertion persistence and coverage tests.
- Reconcile MissionManager labels/copy to clearly separate enforced contract assertions from informational feature acceptance criteria, including warning badge and indicators.
