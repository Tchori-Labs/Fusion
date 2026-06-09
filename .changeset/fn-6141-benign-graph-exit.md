---
"@runfusion/fusion": patch
---

Stop classifying benign workflow-graph exits after a task already advanced or paused as failures. These exits now use info-level benign wording while genuine in-progress graph failures keep the existing failure handling.
