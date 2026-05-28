---
"@runfusion/fusion": minor
---

Add Goals REST API (`/api/goals`) with list/create/update/archive/unarchive endpoints.
Creating a 6th active goal or unarchiving when already at 5 active now returns HTTP 409 with `ACTIVE_GOAL_LIMIT_EXCEEDED` details.
