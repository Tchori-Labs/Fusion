# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Relationships

A Mission owns an ordered list of Milestones; a Milestone owns an ordered list of Slices; a Slice owns a set of Features. Status rolls **up**, not down: a Slice's status is derived from its Features, a Milestone's from its Slices, and a Mission's from its Milestones. Autopilot acts at the Slice boundary — it advances a Mission by activating the next Slice once the current one is complete.

## Missions

### Mission
A unit of autonomous, multi-step work the system plans and then drives to completion on its own, decomposed into Milestones. A Mission may run under Autopilot or be advanced manually.

### Milestone
An ordered phase of a Mission, containing Slices and optionally depending on earlier Milestones. A Milestone is complete only when all of its Slices are complete.

### Slice
A vertically-scoped, independently-completable chunk of a Milestone, containing Features. A Slice's status is derived from its Features and reaches *complete* only when every Feature counts as done — which, for a Feature carrying Contract Assertions, requires a passing Validator Run.

### Feature
The smallest unit of mission work: a single deliverable evaluated against its Contract Assertions. A Feature carries both a board status (its workflow column, e.g. done) and a loop state (its execution phase); the two are distinct and can legitimately disagree mid-flight, but a done Feature that never reached a terminal loop state is an invariant violation that will stall its Slice.

### Fix Feature
A Feature auto-generated from a failed Validator Run to carry the remediation work for the assertions that failed, linked back to the Feature it descends from.

## Mission execution

### Autopilot
The named process that watches an active Mission and advances it — activating the next pending Slice once the current Slice completes — while tracking its own watching/activating lifecycle and handling retries. When Autopilot is not watching a Mission, slice advancement falls back to a compatibility path.

### Contract Assertion
A checkable acceptance criterion linked to a Feature that an AI validator judges to decide whether the Feature is genuinely done. A Feature with no linked assertions auto-passes; a Feature with assertions counts toward Slice completion only after a passing Validator Run.

### Validator Run
A single execution of the AI judge that evaluates a Feature's Contract Assertions and yields a pass, fail, blocked, or error outcome. The validator is read-only — it inspects the implementation and records a verdict, creating no board task and editing no code. A run left running after its owner disappears is reaped to a terminal error state.

### loop state
A Feature's position in the execution loop (being implemented, awaiting or undergoing validation, awaiting a fix, passed, or blocked), distinct from its board status. Logic that gates on loop state must treat it as possibly stale and possibly contradictory with status — a Feature can be marked done while its loop state was never advanced past implementing.
