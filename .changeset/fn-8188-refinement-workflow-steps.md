---
"@runfusion/fusion": patch
---

summary: Refinement tasks now inherit the default workflow's optional review steps.
category: fix
dev: refineTaskImpl seeds enabledWorkflowSteps via materializeDefaultWorkflowSteps() and records the workflow selection, mirroring createTask (FN-8188).
