---
"@runfusion/fusion": minor
---

summary: Branching workflows now run on the graph interpreter; the legacy step-compiler and its interpreter-only banner are gone.
category: feature
dev: Removed the linear WorkflowStep compiler (compileWorkflowToSteps/validateLinearity/WorkflowCompileError) from @fusion/core; parseWorkflowIr is now the sole workflow validity gate at save/select/refine and in the graph task runner. Deleted the POST /api/workflows/:id/compile preview route and its client wrapper, and dropped the interpreterOnly response field and editor banner. MERGE_REGION_NODE_KINDS moved into workflow-lifecycle-validation.
