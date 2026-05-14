---
"@runfusion/fusion": patch
---

Emit a new run_audit git-domain mutation type, `merge:audit-failure`, for dirty post-merge audit outcomes in the merger path.

The event metadata now records the audit decision contract: `mode`, `strategy`, `action`, `reason`, `issueCount`, `duplicateSubjectCount`, `touchedFileOverlapCount`, `verificationPassed`, and `auditTargetLabel`. This covers both blocking failures and warn/verified-short-circuit pass-through outcomes so downstream reliability metrics (FN-4360) can source post-merge audit failures from `run_audit` instead of agent-log scraping.
