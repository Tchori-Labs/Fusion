---
"@fusion/dashboard": patch
---

Fix `git diff --no-index` calls treating exit code 1 as an error in the dashboard git-routes. `--no-index` exits 1 when files differ — that's the success case for synthetic untracked-file diffs. Switched to `spawn` so we accept exit 0 and 1 with stdout, independent of how callers wrap `execFile`/`promisify`.
