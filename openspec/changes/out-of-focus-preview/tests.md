## Automated Tests

- `npm test` (Vitest unit & UI suite). **Baseline**: PR #1 head `0374420` reports 18 files / 220 tests passing; before any edit, re-run and record this. After this change every pre-existing test must still pass except the legacy two-button view-mode assertions in `src/ui/__tests__/ui.test.ts` (`describe('Pixel Grid / Stripes view toggle')`, around L296-L312), which are replaced deliberately:
  - **Optical Blur Math (`src/engine/__tests__/opticalBlur.test.ts`)**:
    - Verifies `buildLinearStripeRaster` produces an isotropic `3×3` buffer (`168×126` for `56×42`).
    - Verifies the coverage-folded dark-border invariant: for any `(ri, gi, bi)` cell on a uniform grid, the mean linear `(r, g, b)` across its 9 subpixels equals `buildComboLUT`'s `lin` entry within `1e-5` (all 125 combos, all 3 palettes).
    - Verifies a raster of alternating linear `1.0`/`0.0` columns blurred at an interior sample encodes to `linearToSrgb(mean)` (`188` at mean `0.5`), not `127`/`128`.
    - Verifies the impulse response second moment equals `(blurCells * 3)²` within `1%` for several `blurCells`, with horizontal and vertical moments matching within `1e-4` relative (isotropy and moment matching).
    - Verifies slider steps `0.05 … 1.5` produce a strictly decreasing impulse-response peak (no dead zone, no identical outputs).
    - Verifies `blurCells = 0` is an exact identity, and a solid black grid at `blurCells = 1.0` brightens boundary subpixels toward `#fafafa` while output dimensions stay equal to the grid footprint.
    - Verifies the width solver is monotonic and cached per `blurCells`, and that the encode table agrees with `linearToSrgb` for all 4096 table entries within 1 level.
  - **Store View State (`src/store/__tests__/gridStore.test.ts`)**:
    - Verifies `viewMode` accepts `'squint'`, `blurCells` clamps to `[0, 1.5]` (default `0.75`), `squintPeek` and `painting` toggle independently of `viewMode`, `effectiveMode` resolves correctly, none of them mark the project dirty or trigger persistence writes, and all of them still work when `readOnly` is `true`.
  - **Dropdown, Focus Slider & Spacebar Peek UI (`src/ui/__tests__/ui.test.ts`, fake `matchMedia`)**:
    - Verifies the top-right pill renders a single `[data-ui="view-mode-trigger"]` button and a fixed-order 3-item `role="menuitemradio"` dropdown with synchronized `aria-expanded` and `aria-checked`, and that the existing Stripes-render and Settings outside-click assertions still pass through the new controls.
    - Verifies hover opens/closes without click-toggle conflict only when `(hover: hover) and (pointer: fine)` matches, a `matchMedia` `change` event re-evaluates it, tap toggles otherwise, ArrowUp/ArrowDown roves focus, `Escape` closes and returns focus to the trigger, and pointer selection blurs the trigger.
    - Verifies `[data-ui="focus-bar"]` is visible only when `viewMode === 'squint'`, exposes `aria-valuetext` like `0.75 cells`, and 10 `input` events inside one frame yield one render with the last value.
    - Verifies Spacebar peek ignores `e.repeat`, modifier keys, text inputs, selects, and `painting`; never mutates `viewMode`; releases on `keyup`, `window.blur`, and `visibilitychange`; is a no-op in explicit Squint mode.
    - **Activation safety**: after a pointer click on `Reset` (`detail > 0`) the button is blurred, Space engages the peek, both Space events are default-prevented, and `resetCompleted` was called exactly once; with `Reset` focused by keyboard (`detail === 0` click path) Space does not peek and activates the button exactly once; closing Settings moves focus to `document.body`.
    - Verifies `gridCanvas.ts` in Squint: no axes/grid lines/hover ring, `default` cursor, click and drag leave completed cells unchanged, inspector still updates on hover, `Mark Done / Undo` renders disabled and inert, nothing is drawn (and nothing throws) when `grid` is `null`, `imageSmoothingEnabled = false` at `blurCells === 0`, and completed-cell changes do not re-run raster or blur (spy on the engine).
- `npm run build`:
  - Verifies zero TypeScript strict-mode errors and clean Vite production build.

## Manual Verification

- **Animated Single-Button View Dropdown (Desktop `1280×800`)**:
  - **WHEN** hovering over `Pixel Grid ▾` in the top-right pill and moving the cursor down into the menu
  - **THEN** the chevron rotates `180deg`, the frosted dropdown glides smoothly into view (`150ms`) with staggered option reveals (`Pixel Grid`, `Stripes`, `Squint` in fixed order with `✓` on active), no dead hover gap closes it, and clicking the trigger while hovered does not fight the hover state.
- **Linear-Light Squint Preview & Focus Slider**:
  - **WHEN** selecting `Squint` on the Christmas Tree and Sunset scenes and scrubbing the bottom-center Focus slider from `0.0` (`Sharp`) to `1.5` (`Squint`)
  - **THEN** UI grid lines and X/Y axes disappear, `0.0` shows crisp nearest-neighbor stripes, scrubbing changes the picture at every slider step (no dead zone near `0.05–0.3`) and smoothly dissolves stripes into glowing yellow/cyan/orange optical mixtures (especially contrasting dithering on vs. off), and edges soften naturally into the `#fafafa` canvas.
- **Hold Spacebar to Squint & Release Safety**:
  - **WHEN** clicking `Reset` with the mouse (on a project with completed cells) and then holding and releasing `Space`, and again holding `Space` while Alt-Tabbing away from the browser
  - **THEN** holding `Space` peeks `Squint` without flashing the Focus slider or overwriting `viewMode`, releasing or Alt-Tabbing snaps cleanly back to the prior mode, completed cells are NOT cleared by the release, and pressing `Space` while dragging cells or typing in a rename input does not trigger peek.
- **Mobile Viewport (`390×844`)**:
  - **WHEN** opening the app at `390×844` and tapping `Pixel Grid ▾`
  - **THEN** the single view trigger keeps the top-right pill on a single row without wrapping `Saved`, and the dropdown opens cleanly with `>= 44px` tap targets.
- **Squint Edge Look**:
  - **WHEN** viewing a scene with a dark border at `1.0` cells
  - **THEN** the edge softens toward paper inside the grid footprint with a clean outer edge (no halo outside), and entering or leaving Squint or peeking never shifts the canvas layout.
