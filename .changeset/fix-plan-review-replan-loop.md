---
"@runfusion/fusion": patch
---

summary: Plan Review revisions no longer loop forever; tasks escalate to approval after repeated revises.
category: fix
dev: The triage pre-execution plan-review gate now seeds replan feedback from the plan-review REVISE output in workflowStepResults and caps consecutive REVISE replans at 3 (new planReviewReplanCount counter, store migration 146), routing the task to awaiting-approval instead of looping.
