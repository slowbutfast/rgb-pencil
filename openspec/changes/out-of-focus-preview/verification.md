# Verification — out-of-focus-preview

## Executive Summary

- **Status**: Complete. All 15 tasks are ticked; implementation, TDD tests, spec sync, browser verification, and the pull request are done.
- **Date**: 2026-11-27
- **Branch**: `feat/out-of-focus-preview`, based on `master` (`d3e2cc5`, the merge of PR #1 whose head was `0374420`). PR #1 was already merged when implementation started, so the handoff's fallback applied: this change targets `master` directly. Implementation commit `991c963` is pushed and opened as **PR #2** (https://github.com/slowbutfast/rgb-pencil/pull/2).
- **Change artifacts**: `f51a6e7` (planning artifacts + handoff), `991c963` (implementation, artifacts, synced specs, this report).

### Environment

| Item | Value |
| :--- | :--- |
| OS | Linux (OpenCode container) |
| Runner | Vitest 5.1.2 (`npm test` → `vitest run`) |
| DOM | jsdom 31 (per `vitest.config.ts`; jsdom has no `matchMedia`) |
| TypeScript | 5.9.3 (`tsc --noEmit` via `npm run build`) |
| Node deps | `npm ci` already run by the orchestrator; no dependency changes in this run |

## Baseline (recorded before edits)

Baseline was run by the orchestrator on this worktree before any edit:

```bash
npm test -- --maxWorkers=1
npm run build
```

- **Tests**: `18 test files, 220 tests passed`.
- **Build**: `tsc --noEmit && vite build` succeeded, `355 modules transformed`, with the worker emitted as its own chunk:
  `dist/assets/pipeline.worker-C01QtuUB.js` (present on disk) alongside `index-UUKzI0-F.js` and `index-B6oMMM2q.css`.

The full suite was not re-run during this scaffolding run (no implementation files changed, and the new tests are supposed to be red).

## Engine API contract asserted by the new tests

`src/engine/opticalBlur.ts` does not exist yet (task 2.2/2.3). The tests pin the following DOM-free surface, so tasks 2.2–2.3 must match it:

| Symbol | Shape | Why the tests need it |
| :--- | :--- | :--- |
| `buildLinearStripeRaster(grid)` | `{ width: cols*3, height: rows*3, data: Float32Array }`, interleaved linear RGB at `(y*width + x)*3 + channel` | Spec "isotropic 3×3 raster"; `168×126` for `56×42`, per-cell means vs `buildComboLUT` |
| `blurLinearRaster(raster, blurCells, paperRgb)` | same `LinearRaster` shape | Impulse variance/isotropy/peak must be measured in linear light, not through the sRGB transfer |
| `blurLinearRasterToSrgb(raster, blurCells, paperRgb)` | `{ width, height, data: Uint8ClampedArray }`, RGBA bytes per subpixel | Directly consumable by `ImageData`; sRGB encoding and footprint checks |
| `solveBoxWidth(blurCells)` | `{ blurCells, sigmaSubpx, width }`, memoized per radius (same object returned) | Width-solver monotonicity plus the "cached per `blurCells`" requirement |
| `LINEAR_TO_SRGB_TABLE` | 4096-entry 8-bit table | Encode-table agreement with `linearToSrgb` within 1 level |

Store contract asserted: `viewMode: 'squint'`, `blurCells` (default `0.75`, clamped `[0, 1.5]`), `squintPeek`, `painting`, `setBlurCells`, `setSquintPeek`, `setPainting`, and a pure `selectEffectiveMode(state)` selector exported from `src/store/gridStore.ts`.

UI contract asserted: `[data-ui="view-mode-menu"]`, single `[data-ui="view-mode-trigger"]`, `[data-ui="view-mode-dropdown"]` (`role="menu"`), exactly three `[data-ui="view-mode-option"]` (`role="menuitemradio"`, fixed order `Pixel Grid`, `Stripes`, `Squint`), and `[data-ui="focus-bar"]` + `[data-ui="focus-input"]` whose `hidden` attribute tracks explicit `viewMode === 'squint'`.

## Red Run (verbatim)

All three targeted files were run separately with `--maxWorkers=1`. The logs were captured verbatim during the run and are reproduced below; the pre-existing tests in each file still pass, so failures are confined to the new scaffolding.

### 1. `npx vitest run src/engine/__tests__/opticalBlur.test.ts --maxWorkers=1`

```text
 Test Files  1 failed (1)
      Tests  no tests

 FAIL  src/engine/__tests__/opticalBlur.test.ts [ src/engine/__tests__/opticalBlur.test.ts ]
Error: Failed to resolve import "../opticalBlur" from "src/engine/__tests__/opticalBlur.test.ts". Does the file exist?
  Plugin: vite:import-analysis
```

Expected red: the engine module is deliberately not created in Phase 1.

### 2. `npx vitest run src/store/__tests__/gridStore.test.ts --maxWorkers=1`

```text
 Test Files  1 failed (1)
      Tests  4 failed | 16 passed (20)

 FAIL  src/store/__tests__/gridStore.test.ts > Squint view state > starts with a 0.75-cell Focus radius and a non-peeking grid mode
AssertionError: expected undefined to be 0.75 // Object.is equality

 FAIL  src/store/__tests__/gridStore.test.ts > Squint view state > accepts Squint, clamps blurCells into 0..1.5, and resolves effectiveMode
Error: selectEffectiveMode is not exported from gridStore

 FAIL  src/store/__tests__/gridStore.test.ts > Squint view state > keeps squintPeek and painting transient and independent of viewMode
TypeError: store.setSquintPeek is not a function

 FAIL  src/store/__tests__/gridStore.test.ts > Squint view state > never dirties or persists the project and still works in a read-only tab
TypeError: store.setBlurCells is not a function
```

The read-only setup itself succeeded before the missing-API failures: `store.toggleCell` created the project under a denied Web Lock, `getState().readOnly` became `true`, and the test reached the new setters.

### 3. `npx vitest run src/ui/__tests__/ui.test.ts --maxWorkers=1`

```text
 Test Files  1 failed (1)
      Tests  19 failed | 17 passed (36)

 FAIL  src/ui/__tests__/ui.test.ts > View-mode dropdown > renders one trigger and a fixed-order three-item menuitemradio list
  AssertionError: expected  to have a length of 1 but got +0

 FAIL  src/ui/__tests__/ui.test.ts > View-mode dropdown > opens on tap when hover is unavailable and closes on a second tap
  TypeError: Cannot read properties of null (reading 'dispatchEvent')

 FAIL  src/ui/__tests__/ui.test.ts > View-mode dropdown > opens on hover without click-toggle and re-evaluates on a media change
  AssertionError: expected false to be true // Object.is equality

 FAIL  src/ui/__tests__/ui.test.ts > View-mode dropdown > roves focus with arrow keys and returns focus to the trigger on Escape
  TypeError: Cannot read properties of null (reading 'focus')

 FAIL  src/ui/__tests__/ui.test.ts > View-mode dropdown > selects Squint with a pointer, updates the label, checks it, and blurs the trigger
  TypeError: Cannot read properties of null (reading 'focus')

 FAIL  src/ui/__tests__/ui.test.ts > Focus bar > shows only in explicit Squint mode and exposes the cell value text
  AssertionError: expected null not to be null

 FAIL  src/ui/__tests__/ui.test.ts > Focus bar > coalesces ten input events into one blur update per frame
  Error: The property "setBlurCells" is not defined on the object.

 FAIL  src/ui/__tests__/ui.test.ts > Spacebar squint peek > peeks on Space without mutating viewMode and releases on keyup
  AssertionError: expected undefined to be true // Object.is equality

 FAIL  src/ui/__tests__/ui.test.ts > Spacebar squint peek > ignores repeats, modifiers, text-entry controls, and an active drag-paint
  AssertionError: expected undefined to be false // Object.is equality

 FAIL  src/ui/__tests__/ui.test.ts > Spacebar squint peek > releases the peek when the window blurs or the tab is hidden
  AssertionError: expected undefined to be true // Object.is equality

 FAIL  src/ui/__tests__/ui.test.ts > Spacebar squint peek > is a no-op while Squint is the explicit mode
  AssertionError: expected undefined to be false // Object.is equality

 FAIL  src/ui/__tests__/ui.test.ts > Spacebar activation safety > runs Reset once when a pointer click is followed by a Space peek
  AssertionError: expected <button class="btn" …(3)></button> not to be <button class="btn" …(3)></button> // Object.is equality

 FAIL  src/ui/__tests__/ui.test.ts > Spacebar activation safety > keeps native Space activation when a button was focused by keyboard
  AssertionError: expected undefined to be false // Object.is equality

 FAIL  src/ui/__tests__/ui.test.ts > Spacebar activation safety > moves focus to the body when an outside click closes Settings
  AssertionError: expected <button class="btn" …(4)></button> to be <body>…(1)</body> // Object.is equality

 FAIL  src/ui/__tests__/ui.test.ts > Stripes rendering through the view-mode dropdown > draws three vertical RGB stripes per cell and desaturates completed cells
  AssertionError: expected null not to be null

 FAIL  src/ui/__tests__/ui.test.ts > Squint canvas > hides axes, grid lines, and the hover ring and uses the default cursor
  AssertionError: expected "vi.fn()" to not be called at all, but actually been called 53 times

 FAIL  src/ui/__tests__/ui.test.ts > Squint canvas > ignores clicks and drags for completion but keeps inspector hover live
  AssertionError: expected 2 to be +0 // Object.is equality

 FAIL  src/ui/__tests__/ui.test.ts > Squint canvas > renders Mark Done / Undo disabled and inert
  AssertionError: expected false to be true // Object.is equality

 FAIL  src/ui/__tests__/ui.test.ts > Squint canvas > uses nearest-neighbor at blurCells 0 and smooth scaling above 0
  TypeError: store.setBlurCells is not a function
```

### Activation-safety test written first

The `Spacebar activation safety > runs Reset once when a pointer click is followed by a Space peek` test was written and run alone before the rest of the UI scaffolding, with:

```bash
npx vitest run src/ui/__tests__/ui.test.ts --maxWorkers=1 -t "runs Reset once"
```

It failed on the intended hazard (the pointer click left `Reset` focused, so the later Space release could re-activate it):

```text
AssertionError: expected <button class="btn" …(3)></button> not to be <button class="btn" …(3)></button> // Object.is equality
 ❯ src/ui/__tests__/ui.test.ts:532:40
```

## Test Coverage Map (new tests → spec scenarios)

| Spec scenario | Verifying test(s) |
| :--- | :--- |
| Uniform cell linear mean matches `buildComboLUT` (all 125 combos, 3 palettes) | `opticalBlur.test.ts` → `matches buildComboLUT linear means …` |
| Raster dimensions are isotropic | `opticalBlur.test.ts` → `rasterizes a 56 x 42 grid …` |
| Blur radius 0.0 is an exact sharp identity | `opticalBlur.test.ts` → `is an exact identity at blurCells = 0`; `encodes every subpixel directly at blurCells = 0` |
| Impulse variance matches requested sigma, isotropic | `opticalBlur.test.ts` → `matches the requested Gaussian variance and stays isotropic` |
| Slider steps never collapse | `opticalBlur.test.ts` → `strictly decreases the impulse peak …` |
| Linear-light averaging beats naive sRGB averaging | `opticalBlur.test.ts` → `encodes a linear 0.5 optical mean as sRGB 188 …` |
| Dark edges blend toward paper inside the footprint | `opticalBlur.test.ts` → `brightens dark edges toward paper …`; `keeps the output exactly the size …` |
| Width solver monotonic + cached; encode table agreement | `opticalBlur.test.ts` → `solveBoxWidth` and `LINEAR_TO_SRGB_TABLE` suites |
| Store view state, clamping, read-only, no persistence | `gridStore.test.ts` → `Squint view state` suite (4 tests) |
| Dropdown fixed order / `aria-expanded` / `aria-checked` | `ui.test.ts` → `View-mode dropdown` suite |
| Stripes render through the new control | `ui.test.ts` → `Stripes rendering through the view-mode dropdown` |
| Focus bar visibility / `aria-valuetext` / rAF coalescing | `ui.test.ts` → `Focus bar` suite |
| Spacebar peek lifecycle and guards | `ui.test.ts` → `Spacebar squint peek` suite |
| Activation safety (pointer Reset, keyboard Reset, Settings focus) | `ui.test.ts` → `Spacebar activation safety` suite |
| Squint canvas (axes/ring/cursor/clicks/Mark Done/null grid/smoothing/caching) | `ui.test.ts` → `Squint canvas` suite |
| Settings outside-click still closes | `ui.test.ts` → existing `Settings popover > closes on an outside click` (unchanged) |

## Phase 2 Green Run

Tasks 2.1, 2.2, 2.3, and 3.1 were implemented; no UI file, `index.html`, CSS, or UI test was touched in this phase.

```bash
npx vitest run src/engine/__tests__/opticalBlur.test.ts --maxWorkers=1
```

```text
 Test Files  1 passed (1)
      Tests  13 passed (13)
   Start at  11:03:33
   Duration  1.05s (environment 76%, tests 12%, import 10%, transform 2%, worker 1%)
```

```bash
npx vitest run src/store/__tests__/gridStore.test.ts --maxWorkers=1
```

```text
 Test Files  1 passed (1)
      Tests  20 passed (20)
   Start at  11:03:35
   Duration  1.22s (environment 64%, tests 20%, import 12%, transform 4%)
```

`npx tsc --noEmit` also completes with no output (the changed engine/store/test typings are clean). The UI suite was intentionally not run; it remains red until tasks 4.1–4.5.

### Measured impulse-variance accuracy (64×64 raster, interior impulse)

| `blurCells` | Expected `(cells*3)²` | Measured horizontal | Measured vertical | Relative error |
| :--- | :--- | :--- | :--- | :--- |
| 0.5 | 2.25 | 2.2500000062 | 2.2500000306 | 2.8e-7 % |
| 0.75 | 5.0625 | 5.0624999931 | 5.0624999549 | 1.4e-7 % |
| 1.0 | 9 | 9.0000002745 | 9.0000000309 | 3.1e-6 % |
| 1.25 | 14.0625 | 14.0624996398 | 14.0624996989 | 2.6e-6 % |
| 1.5 | 20.25 | 20.2499995041 | 20.2500003902 | 2.4e-6 % |

Horizontal/vertical relative difference stayed below `5e-8` at every step, far inside the `1e-4` isotropy bound.

### Test fixture adjustment (justified)

One Phase-1 test needed a fixture fix, not an assertion loosening: `encodes a linear 0.5 optical mean as sRGB 188` built a `96 × 3` raster, but a 1.5-cell radius is `σ = 4.5` subpixels, so the paper padding correctly dominated the three-row height (measured linear mean `0.439`, not `0.5`). The raster is now `96 × 32` and the sample moved to row `16`, isolating the interior from paper. Every assertion (≈0.5 mean, encoded `188`, not `127`/`128`, within `[186, 190]`) is unchanged.

## Ambiguities (resolved in Phase 2)

1. **`effectiveMode`**: resolved — `selectEffectiveMode(state: Pick<GridStoreState, 'viewMode' | 'squintPeek'>): ViewMode` is exported from `gridStore.ts`; no duplicated state field.
2. **Blur output layout**: resolved — `blurLinearRasterToSrgb` returns RGBA `Uint8ClampedArray` with alpha 255.
3. **Extra linear stage export**: resolved — `blurLinearRaster` returns a `LinearRaster` and `blurLinearRasterToSrgb` calls it before encoding.
4. **`blurCells` clamping**: resolved — the store clamps to `[MIN_BLUR_CELLS, MAX_BLUR_CELLS]` with no step rounding.
5. **Hover target for the dropdown** (pending UI): tests dispatch `mouseenter`/`mouseleave` on `[data-ui="view-mode-menu"]`; `topBar.ts` must attach hover handling there (not only on the trigger).
6. **Focus bar hidden mechanism** (pending UI): tests assert the `hidden` property, matching the handoff's "`hidden` by default" markup. CSS must not defeat it.
7. **"No recompute on completion changes"** is asserted through observable proxies (no new `getContext` canvas and no `putImageData` on completion toggles). The UI phase should additionally add a direct engine spy once the canvas imports `opticalBlur.ts`.

## Phase 3 Green Run

Tasks 4.1–4.5 implemented in `index.html`, `src/styles/main.css`, `src/ui/topBar.ts`, `src/ui/gridCanvas.ts`, `src/ui/inspectorSidebar.ts`, and the Settings-close focus change in `src/ui/settingsPopover.ts`. No test file was edited in this phase.

```bash
npx vitest run src/ui/__tests__/ui.test.ts --maxWorkers=1
```

```text
 Test Files  1 passed (1)
      Tests  36 passed (36)
   Start at  11:10:38
   Duration  2.04s (tests 48%, environment 35%, import 14%, transform 3%)
```

```bash
npx vitest run src/ui/__tests__/persistenceUi.test.ts src/ui/__tests__/touchAndExport.test.ts --maxWorkers=1
```

```text
 Test Files  2 passed (2)
      Tests  24 passed (24)
   Duration  3.58s (tests 41%, environment 41%, import 16%, transform 2%)
```

```bash
npx tsc --noEmit
```

```text
tsc: clean (exit 0)
```

The full suite and production build were intentionally not run here; task 5.1 owns them.

### jsdom-specific workarounds

- `drawSquint` builds its `ImageData` through `offscreenContext.createImageData(w, h)` instead of the global `ImageData` constructor, so the jsdom fake context records `putImageData` deterministically.
- `topBar` reads `window.matchMedia` defensively (`typeof … === 'function'`), so pre-existing tests that never install the fake media query fall back to tap behaviour instead of throwing.
- Focus-slider coalescing and canvas redraws both use `requestAnimationFrame`, which the tests replace with a manually flushed queue.
- Range/checkbox/radio inputs are explicitly excluded from the "text entry" Space guard; `BUTTON`/`SUMMARY`/`role="button"`/`role="menuitemradio"` keep native Space activation.

### Ambiguity status after Phase 3

5. **Hover target**: resolved — `mouseenter`/`mouseleave` are bound to `[data-ui="view-mode-menu"]`.
6. **Focus bar hidden mechanism**: resolved — the `hidden` property is toggled and `.focus-bar[hidden]` enforces `display: none`.
7. **No-recompute assertion**: still verified through canvas/context proxies. A direct engine spy remains a recommended strengthening once the final verification phase revisits the suite.

## Phase 4 — Full Verification & Empirical Audit (Task 5.1–5.2)

### 5.1 Full regression and production build

```bash
SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm test -- --maxWorkers=1
SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm run build
```

```text
 Test Files  19 passed (19)
      Tests  257 passed (257)
   Duration  37.23s (tests 67%, environment 25%, import 7%)
```

```text
✓ 356 modules transformed.
dist/assets/pipeline.worker-C01QtuUB.js   46.50 kB
dist/assets/index-BB_rKF_-.css            14.79 kB │ gzip:   3.66 kB
dist/assets/index-pSEncvGS.js            547.53 kB │ gzip: 218.62 kB
✓ built in 375ms
```

Baseline was `18 files / 220 tests`; the result is `19 files / 257 tests` (+37). Exactly **one** legacy assertion test was replaced on purpose: `describe('Pixel Grid / Stripes view toggle') > switches view mode and active styling cleanly`. The sibling `resets every completed cell from the top bar` coverage was preserved and relocated to `Top bar Reset`. No other pre-existing test was removed or changed.

### Requirement Adherence Audit Matrix — `squint-preview`

| # | Scenario | Verifying evidence |
| :-- | :--- | :--- |
| 1 | Uniform cell linear mean matches `buildComboLUT` | `opticalBlur.test.ts` → `matches buildComboLUT linear means …` (all 125 combos × 3 palettes, ≤1e-5) |
| 2 | Raster dimensions are isotropic | `opticalBlur.test.ts` → `rasterizes a 56 x 42 grid as an isotropic 168 x 126 x 3 buffer` |
| 3 | Blur radius 0.0 is an exact sharp identity | `opticalBlur.test.ts` → `is an exact identity at blurCells = 0`; `encodes every subpixel directly at blurCells = 0`; browser `0.0` screenshot |
| 4 | Impulse-response variance matches σ | `opticalBlur.test.ts` → `matches the requested Gaussian variance and stays isotropic` (≤1%, H/V ≤1e-4); measured errors in the Phase 2 table |
| 5 | Slider steps never collapse | `opticalBlur.test.ts` → `strictly decreases the impulse peak at every 0.05 slider step` (30 steps) |
| 6 | Linear-light averaging beats naive sRGB | `opticalBlur.test.ts` → `encodes a linear 0.5 optical mean as sRGB 188, not 127/128` |
| 7 | Dark edges blend toward paper inside the footprint | `opticalBlur.test.ts` → `brightens dark edges toward paper without leaving the grid footprint`; browser dark-edge capture at `1.0` (rim stays inside the grid; pixels outside are transparent) |
| 8 | Focus slider appears only in explicit Squint | `ui.test.ts` → `Focus bar > shows only in explicit Squint mode …`; browser: hidden initially/Grid/peek, visible on explicit Squint at 1280×800 and 390×844 |
| 9 | Slider events within one frame produce one render | `ui.test.ts` → `Focus bar > coalesces ten input events into one blur update per frame` (one `setBlurCells(0.5)`) |
| 10 | Hover still inspects in Squint | `ui.test.ts` → `Squint canvas > ignores clicks and drags … keeps inspector hover live`; browser peek shows `X21, Y16` with no ring |
| 11 | Mark Done is disabled in Squint | `ui.test.ts` → `Squint canvas > renders Mark Done / Undo disabled and inert` |
| 12 | Completion changes do not re-run the blur | `ui.test.ts` → `Squint canvas > does not recompute the raster or blur …` (no new context, no `putImageData`) |
| 13 | No grid yet renders nothing | `ui.test.ts` → `Squint canvas > draws nothing and does not throw when there is no grid` |
| 14 | Holding/releasing Space peeks without mutating `viewMode` | `ui.test.ts` → `Spacebar squint peek > peeks on Space …`; browser: label stayed `Pixel Grid` during the peek and the canvas rendered the blur |
| 15 | Peek after a pointer click never re-activates the clicked button | `ui.test.ts` → `Spacebar activation safety > runs Reset once …`; browser: after Reset click + completed cell + Space down/up, progress stayed `1 / 2352` |
| 16 | Keyboard focus on a button keeps native Space activation | `ui.test.ts` → `Spacebar activation safety > keeps native Space activation …`; browser: keydown/keyup `defaultPrevented === false` with `Reset` focused |
| 17 | Spacebar is ignored while typing or mid-drag-paint | `ui.test.ts` → `Spacebar squint peek > ignores repeats, modifiers, text-entry controls, and an active drag-paint` |
| 18 | Space is a no-op in explicit Squint | `ui.test.ts` → `Spacebar squint peek > is a no-op while Squint is the explicit mode` |

### Requirement Adherence Audit Matrix — `interactive-pixel-grid`

| # | Scenario | Verifying evidence |
| :-- | :--- | :--- |
| 1 | Dropdown shows all three views in fixed order with active checkmark | `ui.test.ts` → `View-mode dropdown > renders one trigger and a fixed-order three-item menuitemradio list`; browser read `aria-expanded="true"`, `role="menu"`, order `grid/stripes/squint`, checked `true/false/false` |
| 2 | Switching to Stripes renders RGB subpixels | `ui.test.ts` → `Stripes rendering through the view-mode dropdown > draws three vertical RGB stripes …` |
| 3 | Selecting a view updates the trigger label and blurs the trigger | `ui.test.ts` → `View-mode dropdown > selects Squint with a pointer …`; browser label changed to `Squint` |
| 4 | Squint hides graph-paper cues and ignores cell completion | `ui.test.ts` → `Squint canvas > hides axes, grid lines, and the hover ring …`; `ignores clicks and drags …`; browser 0.0/0.75/1.5 captures (no axes, rings, or grid lines) |

### Requirement Adherence Audit Matrix — `design-language`

| # | Scenario | Verifying evidence |
| :-- | :--- | :--- |
| 1 | Initial load presents an uncluttered canvas with single view button | `ui.test.ts` → `View-mode dropdown > renders one trigger …`; browser 1280×800 initial capture (single `Pixel Grid ▾`, Settings closed, Focus pill hidden) |
| 2 | Outside click closes settings popover | `ui.test.ts` → existing `Settings popover > closes on an outside click` (unchanged); browser: close moved focus to `BODY` |
| 3 | View-mode dropdown animates smoothly and respects reduced motion | Browser computed styles (Chromium): normal dropdown/chevron `0.15s`, option delays `0s/0.025s/0.05s`; under `prefers-reduced-motion: reduce` all durations **and delays** compute to `0s`. A browser-caught specificity bug (nth-child delays outranked the reduced-motion rule) was fixed and re-verified |

### Manual / browser visual verification (Chromium 151, Playwright 1.65)

Captured locally under `.scratch/shots/` (tool output, not committed) and inspected directly:

- **Desktop 1280×800**: `desktop-01-initial`, `desktop-02-dropdown-open`, `desktop-03-squint-tree-0`, `desktop-04-squint-tree-075`, `desktop-05-squint-tree-15`, `desktop-06/07/08` Sunset dithering on/off at 0.75 and 1.5, `desktop-09-squint-tree-dark-edge-10`, `desktop-10-space-peek-after-reset`, `desktop-11-after-space-release`.
- **Mobile 390×844**: `mobile-01-initial`, `mobile-02-dropdown-open`, `mobile-03-squint-075`. The top-right pill stays on one row (trigger 88×44, options 126×44 ≥ 44px); the top-bar's two pill groups stack, which is the existing responsive layout.
- **Keyboard peek**: `keyboard-peek-body.png` shows the blurred preview while the trigger still reads `Pixel Grid`.
- **Layout stability**: canvas bounding box was `876×660` before, during, and after Squint and the Space peek; entering/leaving the preview causes no layout shift.
- **Footprint**: pixels outside the grid footprint are transparent; the paper-colored rim is inside the footprint, so there is no outward halo and no canvas resize.
- **Console**: no errors or warnings on either viewport.
- **Desktop feel**: the dropdown opens on hover without a hover/click conflict, the chevron rotates, the three options reveal in order, and the Focus pill stays bottom-center. Eye-ball judgments of fusion quality remain for maintainer review.

### Resolved assumptions & empirical proof

- **Space keyup in a real browser**: with `document.activeElement === BODY`, both Space `keydown` and `keyup` were `defaultPrevented === true`; with `Reset` focused by keyboard, both were `false` (native activation won).
- **Reset-then-Space with completed cells**: mouse-clicked `Reset`, clicked a cell (`1 / 2352 done`), held Space (preview rendered, Focus pill stayed hidden), released Space — progress remained `1 / 2352` and `viewMode` stayed `Pixel Grid`. The destructive re-trigger did not occur.
- **Focus after pointer activation**: after the mouse `Reset` click, `document.activeElement` had no `data-ui` (it was `BODY`), confirming the pointer-click blur.
- **Settings close**: an outside click moved focus to `BODY`.
- **Firefox**: binaries are installed, but the container cannot launch Firefox (missing `libgtk-3.so.0` / `libgdk-3.so.0`), so the real-browser checks are Chromium-only. jsdom covers the same assertions cross-engine at the DOM level.
- **Performance** (`npx vite-node` on the engine, 40 runs after warm-up; Node/V8, same code as the browser):

| Grid | Subpixels | Raster build (median) | Blur + encode @0.75 (median) | Blur + encode @1.5 (median) |
| :--- | ---: | ---: | ---: | ---: |
| 56×42 | 21,168 | 0.319 ms | 7.531 ms | 7.308 ms |
| 96×72 | 62,208 | 0.579 ms | 21.732 ms | 21.641 ms |

  The handoff's `1–3 ms` soft budget is exceeded on the densest grid (report-only); the default 56×42 grid stays under 8 ms per recompute, and `requestAnimationFrame` coalescing guarantees one recompute per frame. The blur cost is independent of `blurCells`, matching the O(N) requirement.
- **Reduced motion**: verified via Chromium media emulation (values above), after the CSS fix.
- **Mobile touch targets**: trigger `88×44`, each option `126×44` at 390×844.

### Nomenclature & code symbol audit

- UI copy and code use **Squint** (`'squint'`), not “Out of Focus”; `rg -i "out of focus|out-of-focus" src index.html` returns nothing. The change id remains `out-of-focus-preview`.
- Domain symbols: `ViewMode` includes `'squint'`; `VIEW_MODE_ORDER`, `VIEW_MODE_LABELS`, `MIN_BLUR_CELLS`, `MAX_BLUR_CELLS`, `DEFAULT_BLUR_CELLS`.
- View state: `blurCells`, `squintPeek`, `painting`, and the pure `selectEffectiveMode(state)` (`squintPeek ? 'squint' : viewMode`); no duplicated `effectiveMode` field.
- Engine: `buildLinearStripeRaster`, `solveBoxWidth`, `blurLinearRaster`, `blurLinearRasterToSrgb`, `LINEAR_TO_SRGB_TABLE`, `LinearRaster`/`SrgbRaster`/`BoxWidthSolution`.

### Spec sync retention and validation

- Main specs synced in place (repo convention: change directories stay; no archive): new `openspec/specs/squint-preview/spec.md`, plus the two MODIFIED requirements replaced in `design-language` and `interactive-pixel-grid`.
- Retention check: `design-language` still contains `Scenario: Outside click closes settings popover`; `interactive-pixel-grid` still contains `Scenario: Switching to Stripes view renders RGB subpixels`. PATCH-06's `Requirement: Local persistence of completed cell progress` is untouched.
- `openspec validate out-of-focus-preview --strict` → valid.
- `openspec validate --specs --strict` → `13 passed, 0 failed`.

### Final polish during verification

- Fixed reduced-motion option delays (specificity) caught by the Chromium computed-style check.
- Made the inspector hint truthful in Squint (`Squint preview — clicks inspect only`) and added an assertion to the Squint hover test.
- Updated `proposal.md`, `architecture.md`, and task 1.1 to record that PR #1 merged at `0374420` (`master` `d3e2cc5`, identical tree), so this change and its PR target `master` directly.
- Kept the no-recompute assertion as observable-proxy based (no new context, no `putImageData`) rather than adding a fragile ESM module spy.

## PATCH-01 — PR #2 review follow-up (applied)

Feedback: the view menu never closed on an outside tap or when keyboard focus left it; keyboard selection dropped focus to `body`; and an unrelated render could snap the Focus slider back mid-drag. The optional `opticalBlur.ts` vertical-pass optimisation was explicitly excluded.

### Reproduce (red) then fix

```bash
npx vitest run src/ui/__tests__/ui.test.ts --maxWorkers=1 -t "outside the menu|focus moves outside|no destination|keyboard selection|swallow|frame is pending"
```

```text
 Red:  Tests  6 failed | 1 passed | 37 skipped (44)
Green: Tests  7 passed | 37 skipped (44)
```

The red failures were: outside press did not close (tap and click-opened), focus-out did not close, keyboard selection left focus off the trigger, the outside press closed but was not consumed (swallow guard), and the slider value was overwritten (`'0.75'` instead of `'1.05'`) before the frame ran. The inside-press and null-`relatedTarget` guards passed before and after, as intended.

Implementation (in `src/ui/topBar.ts` only, besides tests/spec/docs):

- Capture-phase `document` `pointerdown`: while open, close when the target is outside `[data-ui="view-mode-menu"]`; never `preventDefault`/`stopPropagation`.
- `focusout` on `viewModeMenu`: close only when `relatedTarget` is a non-null node outside the menu. A `null` destination leaves it open (Safari does not focus buttons on click, so closing would swallow the option press).
- `onViewModeOptionClick`: `event.detail === 0` focuses the trigger; pointer activation still blurs it.
- Render: skip the `focusInput.value` write while `pendingBlurFrame !== null`; `aria-valuetext` still updates.
- Listeners removed in dispose.

### Verification

```text
Full suite: 19 files / 265 tests passed   (257 baseline + 8 new)
Build:      ✓ 356 modules transformed; pipeline.worker-C01QtuUB.js separate; ✓ built in 425ms
Specs:      out-of-focus-preview valid; --specs --strict 13 passed, 0 failed
```

- Delta and main `interactive-pixel-grid` requirement text was diff-verified identical after adding the sentence and three scenarios; PATCH-06's persistence requirement is untouched.
- Chromium 390×844 with `(hover: hover) and (pointer: fine)` false: tap trigger → open; tap canvas cell `(10,5)` → menu closed with `aria-expanded="false"` **and** the same tap inspected `X11, Y6` (inspector visible). Desktop 1280×800: outside press closed a click-opened menu. No console errors.
- Screenshots (`desktop-patch-outside-press.png`, `mobile-patch-outside-tap.png`) were captured under `.scratch/shots/` and inspected; not committed.
- Guardrails: no engine, store, canvas, inspector, CSS, HTML, dependency, or Space-peek changes.

