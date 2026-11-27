## Why

Artists recreating photographs through optical (partitive) RGB colored pencil mixing need a distraction-free workspace where they can read exact shading states for thousands of dense pixel cells without UI clutter obscuring neighboring cells. Now that the minimalist blank-canvas layout, `crosshair` interaction, 4× denser default grid (`56×42`), and unobstructed right-hand inspector sidebar have been validated in `playgrounds/minimal_grid_playground.html`, we need to formalize this design language and UI/UX into production specifications and build the core web application.

## What Changes

- Establish the **Minimalist Editorial Design Language** (`#fafafa` blank canvas, `#ffffff` pure-white surfaces, `1px solid #e5e5e5` hairlines, `#171717` ink, `Inter` + `JetBrains Mono` typography, and whisper-quiet translucent floating pills).
- Build the **Interactive Pixel Grid Workspace**: a centered HTML5 `<canvas>` rendering the downsampled, contrast-boosted logical pixel grid (default `56×42` for 4:3 images, adjustable `16–96 px`) with crisp grid lines, 5-cell major reference lines, adaptive X/Y axis numbering with bolded active-cell ticks, `crosshair` cursor on cells, optional `Stripes` peek toggle, and click/drag-to-complete (desaturate + subtle diagonal hatch) with re-click undo and `localStorage` persistence.
- Build the **Unobstructed Right Inspector Sidebar**: a fixed `256px` right-hand column (never covering the grid) showing the hovered cell's `(X, Y)` coordinate, `To Do / Completed` status, large visual 3-stripe preview (`R`, `G`, `B`), Target vs. Optical Mix swatches, 3 stripe shading state labels (`□ White Paper`, `● Full Color`, `◐ Light Black`, `◑ Heavy Black`, `■ Solid Black`), CIELAB ΔE score, and a quiet 5-state legend.
- **Refactor the approved prototype into a modular app** instead of rewriting it: split `playgrounds/minimal_grid_playground.html` (a 1,210-line single file) into a static `index.html` shell, `src/styles/tokens.css` + `src/styles/main.css`, and plain TypeScript ES modules (`src/engine/`, `src/store/`, `src/ui/`), with no UI framework. Markup and CSS are carried over verbatim so there is zero visual drift from what was approved.
- Introduce a single **`EngineClient` seam** (`src/engine/engineClient.ts`): the UI only ever calls `process(request) → MatchedGrid`. The only implementation in this change runs locally; a remote or worker implementation can be swapped in later without touching UI code.
- Implement the **Client-Side Optical Mixing Pipeline**: image upload (button + full-canvas drag-and-drop) + 3 built-in sample scenes, sigmoidal S-curve contrast boost, 125-combo linear-RGB optical averaging LUT with CIELAB ΔE76 matching across 3 pencil presets, and Floyd–Steinberg linear-RGB error diffusion—controlled via a collapsed-by-default floating **Settings** popover.

## Capabilities

### New Capabilities
- `design-language`: Visual design tokens, typography, color hierarchy, hairline geometry, translucent pill chrome, and responsive layout rules for the minimalist blank-canvas studio aesthetic.
- `interactive-pixel-grid`: Centered HTML5 Canvas pixel grid with adaptive X/Y axis markings, `crosshair` hover targeting, contrast-boosted & Stripes view modes, and click/drag cell completion (desaturated gray + hatch) with undo and persistence.
- `pixel-inspector-sidebar`: Dedicated unobstructed right-hand inspector column displaying live hovered pixel coordinates, 3-stripe visual preview, target vs. optical mix swatches, 3 shading state values, ΔE metric, and 5-state reference legend.
- `optical-mixing-pipeline`: Client-side image ingestion, S-curve contrast boost, 5-state × 3-channel (125-combo) linear-RGB optical averaging LUT, CIELAB perceptual matching, Floyd–Steinberg dithering, and collapsible settings controls.

### Modified Capabilities
<!-- None — greenfield repository with no pre-existing specs in openspec/specs/. -->

## Impact

- **New Project Scaffold**: Introduces `package.json`, Vite + vanilla TypeScript (strict, no React) configuration, Vitest + jsdom test runner, a static `index.html` shell, and `src/` modules (`styles/`, `types/`, `engine/`, `store/`, `ui/`, `main.ts`).
- **Zero Backend Dependencies**: All image processing, color matching, and progress persistence run 100% client-side in the browser. A remote Python/Node engine was considered and deferred (see `research.md`); the `EngineClient` seam keeps that option open at the cost of one new implementation file.
- **Deferred Follow-ups**: Camera-based pencil swatch calibration (Phase 2) and printable `pdf-lib` export will build cleanly on top of the `src/engine/` and `src/types/` contracts established here without altering the core UI/UX.
