---
title: "Task title and description persistence must strip U+0000"
date: 2026-08-11
problem_type: reliability
module: "@fusion/core"
component: task-persistence
tags:
  - postgres
  - tasks
  - github-import
  - nul
  - json
symptoms:
  - "PostgreSQL task creation or update rejects text containing a raw U+0000 byte"
  - "Task API consumers need response bodies safe for strict JSON parsers"
root_cause: "Task title and description descriptor serialization passed externally authored text directly to PostgreSQL text columns without the NUL guard already used by chat and mailbox persistence."
resolution_type: code_fix
---

## Problem

PostgreSQL `text` rejects U+0000. Task titles and descriptions accept arbitrary free-text input, including GitHub issue title/body content and captured process output that can contain the logger frame marker `\u0000fnlvl=info\u0000`. Unlike chat and mailbox writes, the shared task persistence descriptors did not sanitize that byte before binding it to PostgreSQL.

## Exact reproduction

With the PostgreSQL-backed `TaskStore`, create a task with a title or description such as `before\u0000fnlvl=info\u0000after`, then update an existing task with the same text. Before this fix, PostgreSQL rejects either write with its NUL-byte text encoding error (`invalid byte sequence for encoding UTF8: 0x00` / `unsupported Unicode escape sequence`, depending on driver encoding).

The regression test is deliberately a `pgDescribe` test, so it auto-skips when PostgreSQL is unavailable. The local KB-010 run had no reachable PostgreSQL and therefore skipped that lane; the test still records the real-store reproduction and expected persisted values for PostgreSQL-enabled verification.

## Protected surfaces

`TASK_COLUMN_DESCRIPTORS` now applies `sanitizeTextValue` to `title` and `description` while retaining the existing `null` and empty-string fallbacks. The descriptor registry feeds `insertTaskRow`, `insertTaskRowInTransaction`, and `upsertTaskRowInTransaction`, so it protects task creation and update without duplicate route-level sanitizers. It also covers the `buildTaskInsertValues` consumers in `project-store-ops` and `workflow-task-create-ops`.

This includes `POST /tasks`, single and batch `POST /github/issues/import`, CLI/tool task creation, and every task update caller. The sanitization occurs only at persistence time, so request-time duplicate detection continues to inspect the original caller input.

## Why strip U+0000

U+0000-only stripping is the narrow database fix: PostgreSQL `text` rejects that byte but accepts the rest of the C0 range. `JSON.stringify` and Express `res.json()` escape all C0 characters when serializing JSON strings; both reported endpoint success paths use `res.status(201).json(...)`. Route regression tests inspect raw `bodyBuffer` bytes rather than relying on `JSON.parse`, proving the response contains no 0x00–0x1F bytes and remains safe for strict consumers such as `jq`.

The existing helper preserves clean string identity through its no-op fast path, which avoids false changes in the descriptor-based `Object.is` row diffing path.

## Regression commands

```bash
pnpm lint
pnpm --filter @fusion/core exec vitest run src/task-store/__tests__/task-persistence-nul-sanitize.test.ts --silent=passed-only --reporter=dot
pnpm --filter @fusion/core exec vitest run src/__tests__/postgres/task-title-description-nul-sanitize.pg.test.ts --silent=passed-only --reporter=dot
pnpm --filter @fusion/core exec vitest run src/__tests__/nul-sanitize.test.ts --silent=passed-only --reporter=dot
pnpm --filter @fusion/dashboard exec vitest run src/__tests__/routes-tasks.test.ts --silent=passed-only --reporter=dot
pnpm --filter @fusion/dashboard exec vitest run src/__tests__/routes-github.test.ts --silent=passed-only --reporter=dot
pnpm --filter @fusion/core typecheck
pnpm --filter @fusion/dashboard typecheck
pnpm --filter @fusion/core build
pnpm --filter @fusion/dashboard build
```
