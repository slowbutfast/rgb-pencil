## Automated Tests

- `npm test` (Vitest unit & component suite):
  - **Color Math & 125-Combo LUT (`src/engine/__tests__/colorMath.test.ts`)**: Verifies IEC 61966-2-1 sRGB ↔ Linear RGB round-trip accuracy, verifies `buildComboLUT` produces exactly `125` unique `(ri, gi, bi)` combinations for all 3 preset palettes, verifies dark-border linear weighting, and verifies optical averaging of `(R: Full, G: Full, B: Solid Black)` produces a yellow CIELAB hue (`b* > 0`).
  - **Contrast S-Curve (`src/engine/__tests__/contrast.test.ts`)**: Verifies `boost = 1.0` is an exact identity transform across `0..255`, verifies `boost > 1.0` crushes values below `0.46` and lifts values above `0.46`, and verifies output stays clamped within `[0, 255]`.
  - **Matcher & Floyd–Steinberg Dithering (`src/engine/__tests__/matcher.test.ts`)**: Verifies aspect-preserving row calculation for default `56` width and `16–96` range, verifies deterministic matching when dithering is disabled, verifies linear-RGB error propagation reduces mean luminance error on uniform mid-gray patches when dithering is enabled, and verifies out-of-bounds completed keys are pruned when grid width shrinks.
  - **Progress Persistence & Store Logic (`src/store/__tests__/gridStore.test.ts`)**: Verifies toggle completion (`add` / `remove` undo), drag-paint state consistency, `Reset` clearing all completed cells, deterministic image+grid fingerprint hashing, and `localStorage` save/restore (including graceful fallback when `localStorage` throws).
  - **UI Module Behavior (`src/ui/__tests__/ui.test.ts`, Vitest + jsdom)**: Verifies each `mountX` binds to the `index.html` shell via `data-ui` hooks and its dispose function unsubscribes cleanly, verifies the local `EngineClient` resolves a `MatchedGrid` identical to calling the engine directly, verifies Settings popover is closed by default and closes on outside click, verifies `PixelInspectorSidebar` displays empty state before hover and renders exact `(X, Y)`, `To Do`/`Completed`, 3 stripe state labels, and `ΔE` when a cell is active, and verifies `Pixel Grid` / `Stripes` mode toggle updates state cleanly.
- `npm run build` (TypeScript + Vite production build):
  - Verifies zero TypeScript strict-mode errors and clean production bundle output.

## Manual Verification

- **Visual Parity With the Approved Prototype**:
  - **WHEN** opening `playgrounds/minimal_grid_playground.html` and the built app side by side at the same viewport (`1280×800`) with the same sample scene and settings
  - **THEN** layout, tokens, pill chrome, grid, axis labels, sidebar, and legend are visually indistinguishable, and any difference is treated as a defect.

- **Minimalist Blank-Canvas Initial Load**:
  - **WHEN** opening the app at desktop width (`>= 1280px`)
  - **THEN** the page shows a calm `#fafafa` blank canvas with the centered `56 × 42` contrast-boosted pixel grid, crisp grid lines + 5-cell reference lines, X/Y axis ticks, whisper-quiet floating top pills, collapsed Settings popover, and the unobstructed `256px` right-hand inspector sidebar with empty state and 5-state legend.
- **Crosshair Hover & Unobstructed Right Sidebar Inspection**:
  - **WHEN** moving the pointer across cells on the `56 × 42` grid and out onto the axis margins
  - **THEN** the cursor switches to `crosshair` over cells and `default` over margins, the hovered cell displays a double-stroke highlight ring, the exact X and Y axis coordinates bold without colliding with adjacent numbers, and the right sidebar updates live with zero overlap over the grid.
- **Click-to-Complete, Drag-Painting, Undo & Persistence**:
  - **WHEN** clicking a pixel cell, dragging across several neighboring cells, re-clicking one completed cell, and reloading the page
  - **THEN** clicked/dragged cells immediately desaturate to muted gray with a subtle diagonal hatch, re-clicking restores vivid color, the `done / total` readout and sidebar `Completed` pill stay in sync, and completed cells remain grayed out after reload.
- **Image Upload, Drag-and-Drop & Settings Controls**:
  - **WHEN** dragging a custom PNG/JPG onto the canvas (or clicking `Upload Image`), opening Settings, adjusting `Grid Width` (`16–96`), `Contrast Boost`, `Palette`, and toggling `Stripes` mode
  - **THEN** the grid recomputes cleanly preserving aspect ratio, non-image drops are ignored safely, and `Stripes` mode renders 3 vertical RGB stripes per cell while keeping completed cells desaturated.
- **Responsive Mobile Layout (`390×844`)**:
  - **WHEN** resizing the browser viewport to `390×844`
  - **THEN** the right inspector docks cleanly below the grid without covering any cells, and pill buttons meet minimum `44×44px` touch target guidelines.
