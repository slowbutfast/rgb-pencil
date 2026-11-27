# Patch Ledger: out-of-focus-preview

## Patch Ledger

### [PATCH-01] PR #2 review: close the view menu on outside press or focus loss; keyboard focus return; slider snap-back guard
- **Date**: 2026-11-27 18:06:03 UTC
- **Feedback Source**: Code Review (`openspec-pr-review` of https://github.com/slowbutfast/rgb-pencil/pull/2)
- **Feedback Summary**:
  Overview: PR #2 was reviewed against the change artifacts and `verification.md` (tests assumed passing). No Critical findings; the blur engine and the Space-peek activation safety were verified correct. One Important defect and two small nits are in scope; one optional performance nit is deliberately excluded.
  Itemized:
  1. **[Important · Spec / Logic Bug]** The view-mode dropdown never closes on an outside tap or when keyboard focus leaves it. Existing close paths are only `mouseleave` (hover devices), selecting an option, Escape, and re-toggling the trigger. On phones (390×844 is a stated target) tapping the canvas leaves the menu open; a keyboard user who Tabs away leaves it open; on a hover device a click-opened menu stays open when the pointer moves elsewhere (no `mouseleave` after a click-open when the pointer was already outside). The "outside click" tests in `ui.test.ts` cover Settings only. The spec omitted this behaviour (it was dropped when the squint spec was rewritten), so spec and implementation both need it.
  2. **[Minor · Accessibility]** `onViewModeOptionClick` always calls `viewModeTrigger.blur()`. Right for pointer selection, but a keyboard selection (`event.detail === 0`) drops focus to `body` instead of returning it to the trigger, as the WAI-ARIA menu-button pattern expects.
  3. **[Minor · Edge Case]** The top-bar render rewrites `focusInput.value` from the store on every render while the Focus pill is visible. Between an `input` event and the coalesced `requestAnimationFrame` commit, any unrelated store commit writes the stale store value back, snapping the thumb during a drag.
  Category/severity: item 1 Important (mobile and keyboard UX plus spec gap); items 2 and 3 Minor.
  Excluded on purpose: the vertical-pass cache locality / 96×72 frame-time optimisation in `opticalBlur.ts` (optional, higher regression risk, measured 21.7 ms is report-only).
  Blast radius: the view-menu handlers and focus-pill render block in `topBar.ts`, one MODIFIED requirement (two spec files kept identical), and new tests in `ui.test.ts`.
- **Reported Issue / Raw Trace**:
  - `src/ui/topBar.ts` (view-menu handlers `L253-L325`, listeners `L553-L559`, cleanup `L585-L591`): no `pointerdown`-outside or `focusout` handling for `viewModeMenu`.
  - `src/ui/topBar.ts:317-325`: `store.setViewMode(mode); setMenuOpen(false); viewModeTrigger.blur();` runs for pointer and keyboard activation alike.
  - `src/ui/topBar.ts:462`: `focusInput.value = String(state.blurCells);` runs on every render while the pill is visible.
- **Root Cause**:
  1. Menu state is driven only by pointer-enter/leave, trigger click, option click, and Escape; nothing observes presses or focus outside the menu. The spec never required it.
  2. The pointer-oriented blur was applied unconditionally.
  3. Render treats the store as the only source of truth for the slider value, but the store updates one frame after the DOM `input`.
- **Target Files**: `src/ui/topBar.ts`, `src/ui/__tests__/ui.test.ts`, `openspec/changes/out-of-focus-preview/specs/interactive-pixel-grid/spec.md`, `openspec/specs/interactive-pixel-grid/spec.md`, `openspec/changes/out-of-focus-preview/{tests.md,tasks.md,verification.md,patch.md}`
- **Resolution Strategy**:
  - Spec: extend the MODIFIED "Pixel Grid and Stripes view mode toggle" requirement (delta and main spec, identical text) with outside-press close, focus-out close, and keyboard focus return.
  - Outside press: while open, close on a capture-phase `document` `pointerdown` whose target is outside `viewModeMenu`; never `preventDefault`/`stopPropagation`, so the same tap still reaches its target (for example a canvas cell).
  - Focus loss: `focusout` on `viewModeMenu` closes only when `event.relatedTarget` is a non-null element outside the menu. A `null` related target must NOT close it (Safari does not focus buttons on click; closing there would hide the menu between mouse-down and click and swallow the option press).
  - Keyboard selection: in `onViewModeOptionClick`, `event.detail === 0` focuses the trigger; otherwise keep `blur()`.
  - Slider: skip the `focusInput.value` write while `pendingBlurFrame !== null`.
- **Regression Tests** (new, in `src/ui/__tests__/ui.test.ts`):
  - View-mode dropdown: "closes when a pointer press lands outside the menu" (tap-opened, no hover) and the same for a click-opened menu with hover available; "does not close for a press inside the menu"; "closes when keyboard focus moves outside the menu"; "ignores a focus change with no destination element"; "returns focus to the trigger after keyboard selection and blurs it after pointer selection"; "does not swallow the same press that lands on another control" (outside `pointerdown` is not default-prevented).
  - Focus bar: "does not overwrite the slider value while a frame is pending".
- **Verification Commands**:
  ```bash
  npm test -- src/ui/__tests__/ui.test.ts -t "outside the menu|focus moves outside|no destination|keyboard selection|swallow|frame is pending"
  SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm test -- --maxWorkers=1
  SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm run build
  openspec validate out-of-focus-preview --strict
  ```
- **Status**: APPLIED
- **Resolution Proof**:
  - Red run: `npx vitest run src/ui/__tests__/ui.test.ts --maxWorkers=1 -t "outside the menu|focus moves outside|no destination|keyboard selection|swallow|frame is pending"` → **6 failed / 1 passed / 37 skipped** (outside press, click-opened outside press, focus-out, keyboard-selection focus, swallow guard, slider snap-back all failed; the inside-press and null-destination guards stayed green).
  - Green targeted run: same command → **7 passed / 37 skipped**; full `ui.test.ts` → **44/44**.
  - Full suite: `SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm test -- --maxWorkers=1` → **19 files / 265 tests passed** (baseline 257 + 8).
  - Build: `SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm run build` → clean, 356 modules, worker chunk separate.
  - Specs: `openspec validate out-of-focus-preview --strict` valid; `openspec validate --specs --strict` → 13/13. Delta and main `interactive-pixel-grid` requirement text was diff-verified identical.
  - Chromium 390×844 (touch, `(hover: hover) and (pointer: fine)` false): tap trigger → menu open; tap canvas cell (10,5) → menu closed (`aria-expanded="false"`) **and** the same tap inspected `X11, Y6` with the inspector visible. Desktop 1280×800: outside press closed the click-opened menu. No console errors. Screenshots captured under `.scratch/shots/` during verification (not committed).
  - Guardrails preserved: no engine, store, canvas, inspector, CSS, HTML, dependency, or Space-peek changes.
