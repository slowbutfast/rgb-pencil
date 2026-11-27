## 1. Test Scaffolding (TDD)

- [x] 1.1 Branch from the merged PR #1 tree (`master` `d3e2cc5`, identical to head `0374420`), run `npm test` and `npm run build` before any edit, and record the baseline (expected 18 files / 220 tests green) in `verification.md`
- [x] 1.2 Write failing unit tests in `src/engine/__tests__/opticalBlur.test.ts` covering isotropic `3×3` raster dimensions, coverage-folded dark-border mean agreement with `buildComboLUT` within `1e-5` (all 125 combos), linear-mean sRGB encoding (`0.5` → `188`), impulse-response variance matching `(blurCells * 3)²` within `1%`, isotropy, strictly monotonic response across slider steps, `blurCells = 0` identity, paper-colored edge blending within the grid footprint, width-solver monotonicity and caching, and encode-table agreement with `linearToSrgb`
- [x] 1.3 Add failing store tests in `src/store/__tests__/gridStore.test.ts` covering `viewMode: 'squint'`, `blurCells` clamping (`[0, 1.5]`, default `0.75`), transient `squintPeek` and `painting` independence from `viewMode`, `effectiveMode` resolution, read-only tabs, and zero dirty/autosave side effects
- [x] 1.4 Update and add failing UI tests in `src/ui/__tests__/ui.test.ts` replacing the legacy two-button view-mode assertions (keep the Stripes-render and settings outside-click coverage) with tests for the single-button fixed-order 3-item `menuitemradio` dropdown (`aria-expanded`, `aria-checked`, fake-`matchMedia` hover vs. tap and `change` re-evaluation, roving arrow focus, `Escape` return-to-trigger, post-select `.blur()`), `[data-ui="focus-bar"]` visibility, `aria-valuetext`, rAF coalescing, Spacebar `squintPeek` lifecycle (`e.repeat`, modifiers, text inputs, `painting`, `window.blur`, `visibilitychange`, no-op in explicit Squint), **activation safety** (pointer-click `Reset` then Space → one reset; keyboard-focused `Reset` + Space → native activation, no peek; Space events default-prevented; Settings close focus), and Squint canvas behaviour (no axes/lines/ring, `default` cursor, ignored clicks, live inspector hover, disabled `Mark Done / Undo`, `grid === null`, nearest-neighbor at `0`, no recompute on completion changes)

## 2. Domain Contracts & Linear-Light Optical Blur Engine

- [x] 2.1 Update `src/types/pipeline.ts` to extend `ViewMode` to `'grid' | 'stripes' | 'squint'` and export `VIEW_MODE_ORDER`, `VIEW_MODE_LABELS`, `MIN_BLUR_CELLS`, `MAX_BLUR_CELLS`, and `DEFAULT_BLUR_CELLS`
- [x] 2.2 Implement `buildLinearStripeRaster(grid)` in `src/engine/opticalBlur.ts` (`3×3` isotropic `Float32Array`, `DARK_BORDER_RATIO` folded into coverage)
- [x] 2.3 Implement the continuous-coverage box blur in `src/engine/opticalBlur.ts`: bisection width solver (variance `sigmaSubpx²/3` per pass, cached), interpolated prefix-sum window means, 3 horizontal + 3 vertical passes, linearized `#fafafa` padding, and `blurLinearRasterToSrgb(raster, blurCells, paperRgb)` with a 4096-entry encode table

## 3. Store State

- [x] 3.1 Update `src/store/gridStore.ts` to add `blurCells`, `squintPeek`, `painting`, `setBlurCells(cells)`, `setSquintPeek(active)`, `setPainting(active)`, and an `effectiveMode` selector, none of which mark projects dirty, trigger persistence writes, or are blocked by read-only

## 4. Single-Button Animated Dropdown, Focus Slider & Squint Canvas

- [x] 4.1 Update `index.html` replacing `#btnModeGrid` and `#btnModeStripes` with `.view-mode-menu` (`#btnViewMode` + 3 fixed-order `role="menuitemradio"` options) and adding the contextual `#focusBar` pill inside `#stage`
- [x] 4.2 Update `src/styles/main.css` with `.view-mode-menu`, JS-driven `.open` animated dropdown (`150ms cubic-bezier(0.2, 0, 0, 1)`, `180deg` chevron rotation, staggered option reveals `0/25/50ms`, `0ms` under `prefers-reduced-motion: reduce`), `>= 44px` mobile touch targets, and `.focus-bar` bottom-center pill styling
- [x] 4.3 Update `src/ui/topBar.ts` for JS-synchronized hover/tap/keyboard dropdown (`(hover: hover) and (pointer: fine)` with `change` listener), pointer-click blur (`event.detail > 0`), Settings-close focus to `body`, rAF-coalesced `#focusBar` slider with `aria-valuetext`, and the Spacebar peek (preventDefault on keydown/keyup, focused-activatable-control rule, `painting`/`blur`/`visibilitychange` guards)
- [x] 4.4 Update `src/ui/gridCanvas.ts` for single-entry two-stage caching (raster per `grid`, blur canvas per `(grid, blurCells)`), render `effectiveMode` without axes/grid lines/hover ring, `imageSmoothingEnabled = blurCells > 0`, ignore completion clicks and drags in Squint, keep inspector hover live, null-grid no-op, and set the store `painting` flag during drag-paint
- [x] 4.5 Update `src/ui/inspectorSidebar.ts` so `Mark Done / Undo` renders disabled and inert while `effectiveMode === 'squint'`

## 5. Verification & Empirical Audit

- [x] 5.1 Run full regression test suite (`npm test`) and production build (`npm run build`), verifying all unit and UI tests pass with zero TypeScript or bundle errors
- [x] 5.2 Populate `verification.md` with the Requirement Adherence Audit Matrix, resolved assumptions, manual visual verification (desktop `1280×800` animated dropdown + Squint preview + Spacebar peek after `Reset` click, and mobile `390×844` single-row pill), and verbatim execution logs
