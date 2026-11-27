## Why

In sharp focus, the `Stripes` view shows individual red, green, and blue columns and grid lines rather than the glowing, continuous optical mixture an artist sees when squinting or stepping across the room. Adding a **Squint** preview—and collapsing the view switcher into a single animated dropdown button—lets users verify whether their grid width, contrast boost, and Floyd–Steinberg dithering optically fuse into a convincing image before committing to hours of shading, while making the top-right pill even more minimalist.

## What Changes

- **New `Squint` View Mode (`'squint'`)**: Adds a pure TypeScript linear-light Gaussian approximation (`src/engine/opticalBlur.ts`) using an isotropic `3×3` subpixel-per-cell Linear RGB raster with `DARK_BORDER_RATIO` folded into stripe coverage, an O(N) 3-pass separable *continuous-coverage* box blur (real-valued, moment-matched widths so the slider is continuous and the effective sigma exact) with paper-colored (`#fafafa`) edge padding inside the grid footprint, and two-stage single-entry caching (`buildLinearStripeRaster` per `grid`, blurred output per `(grid, blurCells)`).
- **Contextual Focus Slider**: Displays a whisper-quiet floating pill (`Sharp` `0.0` to `Squint` `1.5` logical cells, default `0.75` cells) at the bottom-center of `#stage` only while in explicit `Squint` mode, with nearest-neighbor rendering at `0.0` and `requestAnimationFrame`-coalesced slider updates.
- **Transient Hold `Space` to Squint**: Adds a transient `squintPeek` boolean flag in `gridStore` (`effectiveMode = squintPeek ? 'squint' : viewMode`) that lets users hold Spacebar to squint from `Pixel Grid` or `Stripes` without mutating `viewMode`, with guards for `e.repeat`, modifiers, text-entry controls, a store `painting` flag, and `window.blur`/`visibilitychange` release. The peek `preventDefault()`s Space and defers to native activation when a button has keyboard focus, so a peek can never re-trigger `Reset` or `Export PDF`.
- **Single-Button Animated View Switcher (`BREAKING` for old `#btnModeGrid` / `#btnModeStripes` selectors)**: Replaces the two separate view buttons in the top-right pill with one compact dropdown trigger (`Pixel Grid ▾` / `Stripes ▾` / `Squint ▾`) opening an animated fixed-order 3-item `role="menuitemradio"` menu (`aria-checked`, JS-synchronized `aria-expanded`, hover-open on `(hover: hover)` devices without click conflict, tap-toggle on touch, roving arrow focus, and `Escape` return-to-trigger).

## Capabilities

### New Capabilities
- `squint-preview`: Linear-light Gaussian approximation of optical stripe mixing (`3×3` isotropic raster, coverage-folded dark border, O(N) 3-pass box blur, paper-colored edge padding), resolution-independent `0.0–1.5` cell Focus slider, and transient Spacebar `squintPeek`.

### Modified Capabilities
- `interactive-pixel-grid`: Replaces the two-button `Pixel Grid` / `Stripes` toggle with a single animated fixed-order 3-item view-mode dropdown (`Pixel Grid`, `Stripes`, `Squint`) and, while `effectiveMode === 'squint'`, suppresses axes, grid lines, the hover ring, and every completion path (click, drag, and the touch `Mark Done / Undo` button) while keeping inspector hover live.
- `design-language`: Updates the floating pill controls specification to reflect the single-button animated view-mode dropdown and contextual bottom-center Focus slider pill.

## Impact

- **Base Order**: PR #1 (`feat/multi-20261126-2351`) was merged at `0374420` before implementation, so this change builds directly on `master` (merge commit `d3e2cc5`, whose tree is identical to `0374420`) and its PR targets `master`.
- **Modified Files**: `src/types/pipeline.ts`, `src/store/gridStore.ts`, `index.html`, `src/styles/main.css`, `src/ui/topBar.ts`, `src/ui/gridCanvas.ts`, and `src/ui/__tests__/ui.test.ts` (replacing assertions against the removed two-button selectors).
- **New Files**: `src/engine/opticalBlur.ts` and `src/engine/__tests__/opticalBlur.test.ts`.
- **Zero Persistence / Worker Impact**: `blurCells` and `squintPeek` are purely visual view state and never mark a project dirty, trigger IndexedDB autosave, or alter `MatchedGrid` / PDF output.
