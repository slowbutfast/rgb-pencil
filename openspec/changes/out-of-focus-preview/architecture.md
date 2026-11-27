> [!NOTE]
> This document specifies **technical system architecture only** (data flow, storage, APIs, concurrency, state synchronization, and security).
> All visual, aesthetic, and UI design decisions (colors, typography, component styling, responsive layout) must be defined in `design.md`.

## Context

This change stacks on top of PR #1 (`design-language-and-ui-ux`, `worker-pipeline-and-pdf-export`, `project-persistence`), at its head `0374420` (PATCH-06 applied; baseline is 18 test files / 220 tests passing as reported by that PR's orchestrator). `MatchedGrid` already embeds `palette: PencilPalette`, `DARK_BORDER_RATIO = 0.15` is exported from `src/types/pipeline.ts`, and `setViewMode` is already permitted in read-only tabs.

Technical requirements driving this architecture:
- **Linear-light optical accuracy**: Averaging RGB stripes in gamma-encoded sRGB darkens optical mixtures (e.g., `0.5` linear encodes to sRGB `188`, not `127`/`128`). Blurring must execute in linear RGB `[0, 1]` before encoding back to sRGB.
- **Isotropic resolution-independent blur**: Blur radius must be expressed in logical cells (`0.0–1.5` cells) over a square-subpixel raster so horizontal and vertical blur profiles are identical.
- **60 Hz main-thread smoothness**: Scrubbing the Focus slider on dense grids (`56×42` up to `96×72`) must remain interactive without blocking pointer/keyboard responsiveness.
- **Zero persistence side effects**: `blurCells` and `squintPeek` are ephemeral visual view states that must never dirty the project or trigger IndexedDB writes.

## System Architecture Diagram

```mermaid
flowchart TD
    TopBar["src/ui/topBar.ts<br/>View Dropdown + Focus Slider (rAF) + Spacebar Peek"] -->|setViewMode / setBlurCells / setSquintPeek| Store["src/store/gridStore.ts<br/>viewMode, blurCells, squintPeek"]
    Store -->|effectiveMode = squintPeek ? 'squint' : viewMode| Canvas["src/ui/gridCanvas.ts"]
    Canvas -->|Cache 1: per MatchedGrid ref| R1["src/engine/opticalBlur.ts<br/>buildLinearStripeRaster(grid)<br/>3×3 isotropic Float32Array + coverage-folded border"]
    R1 -->|Cache 2: per (grid, blurCells)| R2["src/engine/opticalBlur.ts<br/>blurLinearRasterToSrgb(raster, blurCells, paperRgb)<br/>O(N) 3-pass box blur + paper edge padding"]
    R2 --> Draw["HiDPI Canvas Draw<br/>(nearest-neighbor at 0, smooth at > 0, no axes/grid lines)"]
```

## Goals / Non-Goals

**Goals:**
- Pure, deterministic, DOM-free TypeScript optical blur engine (`src/engine/opticalBlur.ts`) testable directly in Vitest.
- Exact linear mean agreement between `buildLinearStripeRaster(grid)` and `buildComboLUT` via coverage-folded `DARK_BORDER_RATIO`.
- O(N) blur performance independent of σ via 3-pass separable running-sum box filtering + two-stage single-entry caching + `requestAnimationFrame` slider coalescing.
- Race-free, side-effect-free Spacebar peek: transient `squintPeek`/`painting` state, deterministic release on `keyup`, `window.blur`, and `visibilitychange`, and no accidental activation of focused controls.
- Continuous, monotonic slider response with exact effective sigma.
- Accessible WAI-ARIA `menuitemradio` dropdown with zero desktop hover/click conflict.

**Non-Goals:**
- Persisting `blurCells` or `viewMode` to IndexedDB or `.rgbpencil` project files.
- Running the blur inside the Web Worker (O(N) 3-pass box blur over `21k–62k` subpixels takes ~1–3 ms on the main thread, faster than `postMessage` buffer transfer + canvas round-trip).
- "Progress Only" squint mode (deferred to a future follow-up change).

## Technical Decisions

### 1. Isotropic `3×3` Linear RGB Raster with Coverage-Folded Dark Border
- **Decision**: Rasterize each logical pixel `(x, y)` into `3 × 3` square subpixels (`width = cols * 3`, `height = rows * 3`) in `Float32Array`, where each stripe subpixel stores `(1 - DARK_BORDER_RATIO) * stripeLin + DARK_BORDER_RATIO * borderLin`.
- **Rationale**: Eliminates the 3× vertical anisotropy of a `6×2` raster, uses 4× fewer pixels than `6×6` (`21,168` subpixels at `56×42`; `62,208` at `96×72`), and guarantees the exact mathematical invariant that every cell's linear mean equals `buildComboLUT`'s `lin` entry.
- **Alternatives considered**: `6×2` raster (rejected — 3× vertical smear); `6×6` raster with explicit dark border column (rejected — 4× more memory/CPU and 15% of 6 = 0.9 subpixel cannot be represented without coverage blending anyway).

### 2. O(N) 3-Pass Continuous-Coverage Box Blur With Moment-Matched Widths
- **Decision**: Run 3 horizontal then 3 vertical box passes in `Float32Array`. Each box is a *continuous-coverage* box of real width `w`: the value at pixel `i` is the mean of the piecewise-constant signal over `[i+0.5-w/2, i+0.5+w/2]`, computed in O(1) from interpolated prefix sums. `w` is solved by bisection so one pass has exactly variance `v(w) = (2/w) * Σ_{j>=1} j² * clamp(w/2 - (j - 0.5), 0, 1) = sigmaSubpx²/3` (`sigmaSubpx = blurCells * 3`). Variances of convolved passes add, so the three passes give total variance `sigmaSubpx²` exactly. Out-of-bounds samples are linearized paper (`#fafafa`).
- **Rationale**: Kovesi's `boxesForGauss` uses odd *integer* widths. At `3` subpixels per cell that quantizes the slider hard: below `blurCells ≈ 0.3` every box width is `1` (no blur at all), then it jumps, and many of the 31 slider steps map to identical output. Real-valued widths make the response continuous and strictly monotonic, and moment matching makes the effective sigma exact (and testable via the impulse response second moment). Cost stays O(N) independent of sigma, and the width solve is cached per `blurCells`.
- **Alternatives considered**: Kovesi integer boxes (rejected, dead zone and stepping at the low end where stripes dissolve); direct separable Gaussian convolution (rejected, O(N·σ), ~15M MACs at large σ on dense grids); `w = sqrt(4σ²+1)` closed form (rejected, only exact for integer odd `w`; ~40% effective-sigma error near `w = 2`); CSS `filter: blur()` (rejected, blurs in gamma sRGB); oversampling the raster to hide quantization (rejected, 4×+ cost).
- **Footprint**: Output is exactly the grid footprint. The canvas is sized to `AXIS_PAD + grid` (`gridCanvas.ts` fit logic), so dark edges brighten toward paper inside the footprint but cannot bleed outward. Outward bleed is deferred (see `research.md`).

### 3. Two-Stage Memoization + `rAF` Slider Coalescing
- **Decision**: Cache `LinearRaster` keyed by `MatchedGrid` object reference, and cache the sRGB offscreen canvas keyed by `(MatchedGrid, blurCells)`. Coalesce `#focusBar` `input` events via `requestAnimationFrame`.
- **Rationale**: Scrubbing the Focus slider never re-rasterizes stripes or queues redundant redraws, and hovering/resizing in Squint mode never re-runs the blur.

### 4. Transient `squintPeek` and `painting` Flags in the Store
- **Decision**: Store `squintPeek: boolean` separately from `viewMode` and `painting: boolean` (set by `gridCanvas.ts` on drag-paint start/end). `effectiveMode = state.squintPeek ? 'squint' : state.viewMode` is computed in one selector used by `gridCanvas.ts`, `topBar.ts`, and `inspectorSidebar.ts`. Both flags are transient: never persisted, never dirty the project, never gate on read-only (view-only).
- **Rationale**: Prevents stale mode restoration if `viewMode` changes while holding Space, and replaces a DOM `dataset.dragging` side channel between two UI modules with explicit, testable store state.
- **Alternatives considered**: `stage.dataset.dragging` (rejected, hidden coupling between `gridCanvas` and `topBar`); caching the previous mode and restoring on `keyup` (rejected, stale restore).

### 5. JS-Synchronized Dropdown State with `(hover: hover)` Detection
- **Decision**: Manage `.open` and `aria-expanded` exclusively in `src/ui/topBar.ts` using `matchMedia('(hover: hover)')` (`mouseenter`/`mouseleave` on hover devices, click-toggle on non-hover devices, keyboard roving focus on both).
- **Rationale**: Eliminates stale `aria-expanded` and desktop hover-vs-click conflicts while preserving smooth CSS transitions on `.open`.

### 6. Space-Key Safety: preventDefault, Focus Rules, Pointer Blur
- **Decision**: One `document`-level `keydown`/`keyup` pair handles the peek. It ignores `e.repeat`, modifiers, text-entry targets, and `painting`. It also ignores the key when `document.activeElement` is a natively Space-activated control (`BUTTON`, checkbox, radio, `SUMMARY`, `role="button"`, `role="menuitemradio"`), so keyboard users keep native activation. When it engages it calls `preventDefault()` on both the `Space` `keydown` and `keyup`. To keep the peek reliable for mouse users, top-bar `click` handlers blur the target when `event.detail > 0` (pointer-originated; keyboard-synthesized clicks have `detail === 0`), and closing the Settings popover moves focus to `document.body`.
- **Rationale**: The browser fires `click` on a focused button at `Space` *keyup*. `Reset` calls `store.resetCompleted()` immediately with no confirmation (`topBar.ts`), so a peek after clicking `Reset` or `Export PDF` would re-run them. Default-prevention plus the focus rule removes the hazard without breaking keyboard activation.
- **Alternatives considered**: Excluding `BUTTON` targets outright (rejected, peek then fails silently after any toolbar click); a different shortcut key (rejected, `Space` was approved by the user); globally blocking Space activation of buttons (rejected, breaks keyboard accessibility).

## Risks / Trade-offs

- **[Risk] Old UI tests query removed `[data-ui="mode-grid"]` / `[data-ui="mode-stripes"]` buttons** → **Mitigation**: Deliberately update `src/ui/__tests__/ui.test.ts` in Task Group 1 (TDD) to test `[data-ui="view-mode-trigger"]`, `[data-ui="view-mode-dropdown"]`, and `[data-ui="view-mode-option"]` `menuitemradio` items.
- **[Risk] Window loses focus while Spacebar is held (Alt-Tab)** → **Mitigation**: Release `squintPeek` on both `window` `blur` and `document` `visibilitychange`.
- **[Risk] Hover-capable detection is wrong on hybrid devices** → **Mitigation**: use `(hover: hover) and (pointer: fine)` and re-evaluate on the `matchMedia` `change` event; tests inject a fake `matchMedia` (jsdom has none).
- **[Risk] 62k-subpixel encode uses `Math.pow` per channel (~190k calls at `96×72`)** → **Mitigation**: encode through a precomputed 4096-entry linear→sRGB table inside `opticalBlur.ts`; the blur itself is ~0.4M ops.
- **[Risk] Hard grid edge with brightened rim** → **Mitigation**: accepted and documented (canvas is sized to the grid footprint); outward bleed deferred.
- **[Risk] `blurCells = 0` upscaled with bilinear filtering looks soft** → **Mitigation**: Explicitly set `ctx.imageSmoothingEnabled = state.blurCells > 0` before drawing the squint offscreen canvas.

## Migration & Rollback Plan

- Pure additive/UI refactor. Implement on a branch created from `feat/multi-20261126-2351` (`0374420`); open the PR with that branch as its base, then retarget to `master` when PR #1 merges. If PR #1 merges first, rebase onto `master`.
- Zero database schema or `.rgbpencil` file format changes; rollback is a single git revert.
