---
"@runfusion/fusion": patch
---

summary: Task-detail popups now open in — and stay scoped to — the view where you opened them.
category: fix
dev: isTaskPopupVisibleForView now scopes by origin view for all views (not just Board/List); taskPopupsBoardListOnly defaults on and popups dedupe per (task id, origin view) so the same task can open independently in multiple views. Escape/keyboard close carries (taskId, originView) identity. FN-8016.
