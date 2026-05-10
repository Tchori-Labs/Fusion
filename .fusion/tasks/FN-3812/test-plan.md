# FN-3812 Room Test Plan

This plan defines contract-neutral coverage for room creation, room switching, persisted history, mention routing, and hybrid room response behavior. Each bullet below maps 1:1 to a single `it.todo(...)` title in the matching scaffold file.

## Layer 1 — Core chat-store (persistence)

### Room lifecycle and membership
- room creation persists a new room record with creator context and retrievable metadata — creating a room must make it available to later room reads/lists.
- member add/remove updates room membership deterministically — adding a member makes them present in membership reads and removing them makes them absent.

### Room message persistence and retrieval
- room-scoped append + list preserves message order and payload fields — appending messages to a room and listing them must return them in stable chronological order with stored content.
- cross-room isolation keeps each room history independent — reading room A history must never include messages appended to room B.
- room-vs-direct isolation keeps room history separate from direct sessions — room message reads must not surface direct-chat messages, and direct message reads must not surface room messages.

### Persistence round-trip and metadata fidelity
- close/reopen round-trip preserves room, membership, and room history state — reopening the store/database must return the same room data and history without loss.
- mention metadata round-trip persists and rehydrates mention routing context — stored mention markers on room messages must be returned unchanged on read.
- responder metadata round-trip persists and rehydrates responder attribution — stored responder identity/role markers on assistant room messages must be returned unchanged on read.

## Layer 2 — Chat orchestration (routing + dispatch)

### Mention routing in rooms
- direct mention in room routes targeted response from addressed room member — mentioning a room member should produce a targeted responder output from that member.
- non-member mention behavior does not dispatch to out-of-room agents and surfaces explicit feedback — mentioning an agent outside the room should not trigger that agent and should produce a user-visible non-member notice.

### Hybrid dispatch behavior
- hybrid ambient response includes non-mentioned room members when room dispatch mode allows ambient participation — room messages with mentions can still trigger additional ambient responders.
- mention suppresses ambient on the addressed agent to avoid duplicate responses — the directly mentioned agent should respond once, not once direct plus once ambient.

### Regression guard
- direct-chat regression guard keeps legacy direct send path unchanged — non-room chat routing should continue to behave as before room support.

## Layer 3 — HTTP + SSE

### Room API endpoints
- room create + list endpoints return created room and include it in subsequent listings — API callers can create a room then retrieve it via list/read endpoints.
- per-room history read returns only the selected room timeline — room history endpoint must scope results to the requested room.
- send room message with mention records mention data and triggers routed responder behavior — room send endpoint must accept mention text and emit resulting room messages.

### Streaming scope and permissions
- SSE room channel scoping delivers events only to matching room subscribers (`it.each` over A↔B subscribers) — a subscriber for room A receives A events and not B events, and vice versa.
- v1 permissions allow same-project room operations without cross-user 403 checks — current project-scoped room routes should not reject same-project callers for cross-user constraints.

## Layer 4 — Dashboard ChatView (UI)

### Mode and navigation
- Direct/Rooms toggle render exposes both scopes when room mode is enabled — users should see and switch between Direct and Rooms modes.
- room switching loads selected room history without leakage (`it.each` A↔B matrix) — switching rooms should show only the selected room thread and no carryover from other rooms.

### Mention UX in room mode
- mention popup in room mode prioritizes room members before non-members when filtering — member suggestions appear first for the same query.
- non-member mention chip class marks out-of-room mentions in rendered messages — rendered mention chips for non-members should include the non-member styling/state marker.

### Persistence + regression
- persisted history survives remount and reload in room mode — room thread content should still render after component remount/re-init.
- direct-chat parity regression guard keeps direct mode behavior unchanged in the same view — existing direct-chat composer/render/send behavior remains intact.

## Handoff: converting `it.todo` to real assertions

1. Re-read the merged FN-3805..FN-3811 implementation across core store, orchestration, HTTP/SSE routes, and ChatView to confirm the final shipped contracts.
2. Record actual discovered symbols (type names, method names, route paths, SSE event names, prop names, CSS class names) next to each planned assertion before editing test bodies.
3. Replace each `it.todo("...")` entry with a concrete `it("...", async () => { ... })` assertion against the merged contract; keep behavior-focused titles but make them implementation-specific where necessary.
4. Run targeted suites first (the four rooms scaffold files and adjacent existing room tests), then run `pnpm test` to validate whole-workspace integration.
5. Update this plan with any contract surprises or changed assumptions found during conversion so future maintainers can trace why assertions differ from the original stub wording.

**Do not weaken coverage:** every `it.todo` in these scaffolds must become a real assertion (or a stricter split/consolidation with `it.each` for true matrices). Coverage shrinkage is not acceptable except legitimate matrix consolidation.
