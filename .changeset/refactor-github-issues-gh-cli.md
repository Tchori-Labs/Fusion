---
"@dustinbyrne/kb": patch
---

Refactor GitHub issue import/fetch routes to use gh CLI instead of direct REST API calls. This ensures consistent authentication handling across all GitHub operations and removes the need for GITHUB_TOKEN environment variable for issue operations.
