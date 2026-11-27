# Surgical Patch Handoff: OpenSpec Change 'out-of-focus-preview' [PATCH-01]

## 1. Executive Objective & Diagnostic Feedback
- **Change Name**: `out-of-focus-preview`
- **Patch ID**: PATCH-01 (see `openspec/changes/out-of-focus-preview/patch.md`; its tasks are the `## Patch 01` group at the bottom of `tasks.md`)
- **Branch**: `feat/out-of-focus-preview` (PR #2, https://github.com/slowbutfast/rgb-pencil/pull/2, base `master`). Work on this branch only, currently at `2ed11ba`. Do NOT create commits, push, or switch branches; leave changes uncommitted for the user. Do not change git config (commits use the GitHub noreply identity).
- **Objective**: Make the single-button view-mode dropdown close on an outside press or when keyboard focus leaves it, return focus to the trigger after keyboard selection, and stop the Focus slider thumb snapping back mid-drag.
- **Feedback & Diagnostic Trace** (verbatim from the PR #2 review):
  ```
  Important: [src/ui/topBar.ts dropdown handlers; specs/interactive-pixel-grid and design-language]
  The view menu never closes on an outside tap or when focus leaves it. The only close paths are
  `mouseleave` on hover devices, selecting an option, Escape from the trigger or menu, and
  toggling the trigger. The two "outside click" tests in ui.test.ts belong to Settings.
  Effect: on phones (390x844) tapping the canvas leaves the dropdown open; a keyboard user can
  Tab away and leave it open; click-opening it on a desktop and then moving the pointer elsewhere
  does the same, because mouseleave never fires.
  Fix: while the menu is open, close it on a document pointerdown outside viewModeMenu and on
  focusout when focus moves outside the menu. Add a scenario to the spec and two UI tests.

  Nit: topBar.ts onViewModeOptionClick always calls viewModeTrigger.blur(). A keyboard selection
  (event.detail === 0) drops focus to body. Return focus to the trigger in that case.

  Nit: topBar.ts render block rewrites focusInput.value from the store on every render while the
  pill is visible. During a drag, any other store commit between `input` and the next frame snaps
  the thumb back. Skip the write while a frame is pending.
  ```
- **Root Cause Analysis**: Menu open state is driven only by pointer enter/leave, trigger click, option click, and Escape; nothing observes presses or focus outside the menu, and the spec never required it. The blur after selection was written for pointer users and applied to keyboard users too. The slider value is treated as store-owned, but the store updates one animation frame after the DOM `input` event.

## 2. Strict Target Context Map
Line numbers are at `2ed11ba`; locate by symbol if they shift.

| File Path (relative to repo root) | Target Lines | Modification Summary |
|---|---|---|
| `src/ui/topBar.ts` | `setMenuOpen` / handlers `L253-L325`; listener registration `L553-L559`; cleanup `L585-L591` | Add `onDocumentPointerDown` (registered on `document` in the **capture** phase; closes when `menuOpen` and the event target is outside `viewModeMenu`; never `preventDefault`/`stopPropagation`) and `onViewModeMenuFocusOut` (on `viewModeMenu`; closes only when `event.relatedTarget` is a non-null element outside the menu; a `null` related target must NOT close it). Register both beside the existing view-menu listeners and remove them in the dispose block |
| `src/ui/topBar.ts` | `onViewModeOptionClick` `L317-L325` | Keep `viewModeTrigger.blur()` for pointer activation; when `event.detail === 0` (keyboard) call `viewModeTrigger.focus()` instead. Leave the rest unchanged |
| `src/ui/topBar.ts` | render block around `L462` | Wrap `focusInput.value = String(state.blurCells)` so it runs only when `pendingBlurFrame === null`. Keep the `aria-valuetext` update |
| `src/ui/__tests__/ui.test.ts` | `describe('View-mode dropdown')` `L493-L637`; `describe('Focus bar')` `L638-L703` | New tests only (see Section 5). Reuse `loadShell`, `installMatchMedia`, `makeStore`, `mountTopBar`, `pointerClick`, `byUi`, `viewOptions` helpers already in this file |
| `openspec/changes/out-of-focus-preview/specs/interactive-pixel-grid/spec.md` | MODIFIED requirement `L3-L20` | Insert the requirement sentence and three scenarios below |
| `openspec/specs/interactive-pixel-grid/spec.md` | requirement at `L54` and its scenarios `L57-L70` | Apply the **identical** text to the main spec (do not touch any other requirement, including PATCH-06's persistence requirement) |
| `openspec/changes/out-of-focus-preview/{tests.md,tasks.md,verification.md,patch.md}` | append / update | Add the new test lines to `tests.md`; tick `## Patch 01` tasks; add a PATCH-01 section to `verification.md`; set PATCH-01 `Status: APPLIED` with proof in `patch.md` |

**Spec text to add** (identical in both spec files). In the requirement paragraph, after "...and dismiss with `Escape` returning focus to the trigger.", insert:
```
While open, the menu SHALL also close on any pointer press outside it (without consuming that press, so the press still reaches its target) and when keyboard focus moves to an element outside it; keyboard activation of an option SHALL return focus to the trigger.
```
Add these scenarios after "Selecting a view updates the trigger label and blurs the trigger":
```
#### Scenario: Pressing outside the open dropdown closes it
- **WHEN** the dropdown is open and the user presses the pointer on any element outside `[data-ui="view-mode-menu"]`
- **THEN** the dropdown SHALL close with `aria-expanded="false"` and the press SHALL still reach its target

#### Scenario: Moving keyboard focus out of the menu closes it
- **WHEN** the dropdown is open and keyboard focus moves to an element outside the menu
- **THEN** the dropdown SHALL close; a focus change with no destination element SHALL NOT close it, so a press on an option is never lost

#### Scenario: Keyboard selection returns focus to the trigger
- **WHEN** the user activates an option with Enter or Space
- **THEN** `viewMode` SHALL update, the dropdown SHALL close, and focus SHALL return to `[data-ui="view-mode-trigger"]`
```

## 3. Blast Radius & Invariant Guardrails
- **STRICT BLAST RADIUS**: Modify ONLY the files and lines in the Target Context Map.
- **FORBIDDEN**:
  - Do NOT touch `src/engine/opticalBlur.ts` or any engine, store, canvas, inspector, CSS, or HTML file. In particular, do NOT attempt the optional vertical-pass performance optimisation.
  - Do NOT change the Space-peek code (`onSpaceKeyDown`, `onSpaceKeyUp`, `isNativeSpaceControl`, `onTopBarPointerClick`) or its tests.
  - Do NOT modify `.env`/credential files, other changes' artifacts, or `playgrounds/*`. Do NOT add dependencies.
  - Do NOT modify existing passing tests unless the assertion itself was demonstrably incorrect; if one must change, record exactly which and why in `patch.md`.
- **INVARIANTS TO PRESERVE** (baseline at `2ed11ba`: 19 test files / 257 tests, clean build, worker chunk separate):
  - Hover devices: opening by hover and the "click must not fight hover" behaviour; tap-toggle on non-hover devices (existing test "opens on tap when hover is unavailable and closes on a second tap").
  - A `pointerdown` on the trigger or inside the menu must not close it (otherwise the trigger toggle and option clicks break). The existing pointer helpers dispatch `pointerdown` before `click`; confirm they still pass.
  - Space peek activation safety, reduced-motion CSS, and Settings outside-click behaviour are unchanged.
  - The outside `pointerdown` handler must be inert while the menu is closed (no per-press work, no state change).

## 4. Visual & UI Impact
- Status: Non-visual patch. No styling, CSS variable, token, or layout modifications permitted. Behavioural only; the menu's existing open/closed visual states from `design.md` are reused as is.

## 5. Reproduction & Verification Protocol
1. **Reproduce First**: write the tests below, run the targeted command, and confirm they fail for the reasons in Section 1.
   ```bash
   npm test -- src/ui/__tests__/ui.test.ts -t "outside the menu|focus moves outside|no destination|keyboard selection|swallow|frame is pending"
   ```
   Required cases (name them so the `-t` pattern matches):
   - **View-mode dropdown**: "closes when a pointer press lands outside the menu" (tap-opened, hover unavailable) and the same when the menu was click-opened with hover available; "keeps the menu open for a press inside the menu" (`pointerdown` on an option and on the trigger do not close it before `click`); "closes when keyboard focus moves outside the menu" (open via ArrowDown, focus an outside button); "ignores a focus change with no destination element" (`focusout` with `relatedTarget: null` leaves it open); "returns focus to the trigger after keyboard selection and blurs it after pointer selection" (`click` with `detail: 0` vs `detail: 1`); "does not swallow the press that lands on another control" (the outside `pointerdown` is not `defaultPrevented`, and a following click on another control still fires).
   - **Focus bar**: "does not overwrite the slider value while a frame is pending" (dispatch `input` with a new value, cause an unrelated store commit such as `store.setHovered(...)`, assert the input value is unchanged before the frame flushes and equals the store value after).
2. **Apply Minimal Fix** in the mapped files only.
3. **Verify Fix**: re-run the targeted command; all new tests pass.
4. **Full Regression Suite** (documented host override for `safe-test`'s virtual-memory cap):
   ```bash
   SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm test -- --maxWorkers=1
   SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm run build
   openspec validate out-of-focus-preview --strict
   ```
   Also re-run the spec validation command recorded in `verification.md` (13 specs strict) because a main spec changed. Expect 19 files and 257 tests plus the new cases, a clean build, and valid specs.
5. **Browser check** (Chromium via Playwright, `localhost` only, no public tunnel): at `390×844` emulating touch with hover unavailable, tap the view trigger, then tap the canvas; the menu must close and the canvas tap must still inspect that cell. On a desktop viewport, click the trigger then move the pointer away and press elsewhere; the menu must close. Save screenshots and note them in `verification.md`.
6. **Documentation**: update `tests.md`, add a PATCH-01 section to `verification.md` with verbatim passing counts, and set PATCH-01 to `APPLIED` in `patch.md`.

## 6. Surgical Patch Checklist
- [ ] P01.1 Run reproducing tests (Section 5, step 1) and confirm they fail.
- [ ] P01.2 Implement the outside-`pointerdown` close, the `focusout` close (non-null outside `relatedTarget` only), and keyboard-selection focus return in `src/ui/topBar.ts` (L253-L325, L553-L559, L585-L591).
- [ ] P01.3 Guard the `focusInput.value` write while `pendingBlurFrame !== null` in `src/ui/topBar.ts` (around L462).
- [ ] P01.4 Add the spec sentence and three scenarios to both `interactive-pixel-grid` spec files, identical text.
- [ ] P01.5 Re-run reproducing tests (PASS), then the full suite, build, spec validation, and the Chromium check.
- [ ] P01.6 Update `tests.md`, `verification.md`, `tasks.md` (`- [x]`), and `patch.md` (PATCH-01 `APPLIED` with proof).
