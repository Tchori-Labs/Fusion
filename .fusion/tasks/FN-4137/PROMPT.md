# Task: FN-4137 - Add markdown rendering toggle to Task Review tab

**Created:** 2026-05-09
**Size:** S

## Review Level: 1 (Plan Only)

**Assessment:** Retry-only coordination spec. The implementation work is already committed on `fusion/fn-4137`; this retry exists only to verify and deliver the branch without redoing the feature work.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 0, Security: 0, Reversibility: 1

## Mission

Ship the already-implemented Task Review markdown toggle work from branch `fusion/fn-4137` without re-implementing it.

The branch already contains these committed changes:
- `75e2775c7` — `feat(FN-4137): complete Step 1 — add review markdown toggle`
- `b07ec4dcc` — `feat(FN-4137): complete Step 4 — document review markdown toggle`
- `16b16232b` — `fix(FN-4137): address Frontend UX Design review — unwrap body from checkbox label, soften mobile actions row`

This retry is limited to verification, merge-conflict cleanup if needed, and delivery.

## Dependencies

- None

## Context to Read First

- `packages/dashboard/app/components/TaskReviewTab.tsx`
- `packages/dashboard/app/components/TaskReviewTab.css`
- `packages/dashboard/app/components/__tests__/TaskReviewTab.test.tsx`
- `.changeset/FN-4137-review-markdown-toggle.md`
- `AGENTS.md` → "Dashboard UI Styling Guide"

## File Scope

Verification only. Do not re-edit the implemented FN-4137 feature files unless resolving a main-merge conflict introduced during retry.

## Steps

### Step 1: Verify the existing branch contents

- [ ] Confirm `fusion/fn-4137` contains the markdown toggle implementation from `75e2775c7`.
- [ ] Confirm `TaskReviewTab.tsx` keeps the checkbox/summary metadata inside the label but renders the markdown/plain body outside the label so body clicks do not toggle selection.
- [ ] Confirm `TaskReviewTab.css` includes the relaxed mobile actions layout (wrapping actions row; no forced equal-width three-button row on mobile).
- [ ] Confirm `packages/dashboard/app/components/__tests__/TaskReviewTab.test.tsx` includes the FN-4137 regression test covering markdown-body clicks not toggling the checkbox.
- [ ] Confirm `.changeset/FN-4137-review-markdown-toggle.md` exists.
- [ ] **Do NOT re-edit these files during this step.**

### Step 2: Testing & Verification

- [ ] Run `pnpm --filter @fusion/dashboard test`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm build`.
- [ ] Fix only failures caused by merge conflicts or retry-specific integration drift from `main`; do not refactor.

### Step 3: Documentation & Delivery

- [ ] Confirm the existing changeset file still exists and is staged for merge via branch history.
- [ ] No additional docs are required.
- [ ] Hand off for merge/delivery.

## Documentation Requirements

**Must Update:**
- None, unless conflict resolution requires updating an already-touched FN-4137 file.

**Check If Affected:**
- None.

## Completion Criteria

- [ ] Existing FN-4137 implementation remains intact on `fusion/fn-4137`
- [ ] Dashboard tests pass
- [ ] Workspace lint, test, and build pass
- [ ] Changeset file `.changeset/FN-4137-review-markdown-toggle.md` remains present
- [ ] Task is delivered without redoing the original implementation steps

## Git Commit Convention

- Preserve existing FN-4137 history where possible
- Any conflict-resolution follow-up commit must include the task ID: `fix(FN-4137): ...`

## Do NOT

- Do NOT redo Step 1 of the original prompt.
- Do NOT re-implement the markdown toggle.
- Do NOT refactor `TaskReviewTab` beyond conflict-resolution needs.
- Do NOT add a second changeset.
- Do NOT remove the existing regression coverage.

## Changeset Requirements

Use the existing `.changeset/FN-4137-review-markdown-toggle.md`. Do not add another changeset unless the existing file has been lost and must be restored exactly.

## Project Commands

- **Test:** `pnpm test`
- **Build:** `pnpm build`
