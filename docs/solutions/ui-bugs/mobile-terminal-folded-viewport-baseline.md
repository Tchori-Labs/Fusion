---
title: "Mobile terminal folded viewport baseline"
date: 2026-06-30
category: ui-bugs
module: packages/dashboard/app/components/TerminalModal.tsx
problem_type: ui_bug
component: frontend_terminal
applies_when: "A foldable or narrow mobile viewport settles to a closed posture before or during soft-keyboard entry for an xterm surface."
symptoms:
  - "Terminal commands render with excessive inter-character spacing or premature wrapping in folded mobile posture"
  - "Keyboard-open terminal height/overlap is computed from an earlier unfolded viewport"
  - "Embedded CLI session terminal input bar is lifted too far after a fold/narrow transition"
root_cause: stale_unfolded_visualviewport_baseline
resolution_type: code_fix
severity: medium
related_components:
  - packages/dashboard/app/components/TerminalModal.tsx
  - packages/dashboard/app/hooks/useMobileKeyboard.ts
  - packages/dashboard/app/components/SessionTerminal.tsx
  - FN-7281
tags:
  - terminal
  - xterm
  - mobile-keyboard
  - visualviewport
  - foldable
  - ios
---

# Mobile terminal folded viewport baseline

## Problem

The terminal has two mobile xterm surfaces: the PTY `TerminalModal` and the embedded `SessionTerminal`. Both depend on visualViewport-derived keyboard metrics before fitting xterm rows/cols. On iOS-style browsers, `innerHeight` can shrink with the keyboard, so the code keeps a baseline viewport height captured while the keyboard is closed.

A foldable device can first expose an unfolded/wide closed baseline, then settle to a narrower folded baseline before the keyboard opens. If the folded closed sample is shorter than the previous baseline and the baseline only ever grows, the later keyboard-open sample overestimates the overlap. Conversely, a fold/orientation width sample can arrive after xterm's helper textarea is focused and the soft keyboard is already open; if that focused sample replaces the baseline, the keyboard-open height looks closed and clears the terminal CSS variables. Both stale geometries make the terminal fit against the wrong box and can surface as premature wrapping or spaced ASCII such as `p n p m  b u i l d`.

## Solution

Treat a keyboard-closed width/posture change as a new baseline, not as keyboard overlap.

- Track the viewport width alongside the baseline height.
- Preserve the max-observed baseline behavior for same-posture recovery from keyboard-open first samples.
- When width changes and the viewport height is a settled folded value, replace the baseline before computing iOS fallback overlap.
- Gate that replacement to keyboard-closed samples; if a keyboard-focusable element is active, keep the previous baseline so a focused keyboard-open folded sample cannot zero out the overlap.
- Keep xterm's measured font family symbols-free; the fix is viewport measurement, not a letter-spacing or cell-width workaround.

## Regression coverage

Guard the invariant at three seams:

- `TerminalModal.test.tsx` simulates unfolded closed → folded closed → folded keyboard-open and asserts `--keyboard-overlap` / `--vv-height` use the folded baseline. It also covers a focused folded keyboard-open sample so posture re-baselining cannot clear those CSS variables.
- `SessionTerminal.mobile.test.tsx` proves the embedded mobile input bar uses the folded baseline instead of the stale unfolded height.
- `useMobileKeyboard.test.ts` covers the shared hook so future consumers inherit the posture-aware baseline behavior.

Existing terminal tests continue to cover symbols-free xterm font stacks, glyph fallback for Nerd Font/powerline output, duplicate visualViewport resize coalescing, keyboard close clearing, undefined visualViewport, tab-switch scrollback replay, and desktop/tablet terminal modes.
