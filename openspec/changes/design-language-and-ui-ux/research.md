## Source material

### 2026-11-26 — Original Product Concept (User)
> "Can you propose how we can design an app that can take in an image and then output some sort of like guide or visual guide to recreate the image with colored pencils with the effect as shown in this video?
>
> The video demonstrates optical color mixing (also known as partitive mixing), recreating how digital screens use RGB (red, green, blue) subpixels to form a glowing, full-color image out of individual colored stripes.
> * Subpixel Grid Structure: Using graph paper and a ruler, the artist draws repeating vertical triplets of red, green, and blue lines separated by dark borders, mimicking the physical subpixel array of an LCD or OLED display.
> * Selective Brightness and Shading: Rather than blending different pencils directly on top of one another, the artist controls the brightness of each individual stripe segment. Bright, unshaded segments of red and green combine visually to form yellow lights, bright white gaps act as highlights, and heavy black shading suppresses light to create the dark background.
> * Eye Resolution and Spatial Blending: Up close, the drawing looks like abstract vertical lines. When the camera zooms out—or when you view the drawing from a distance—the stripes become too narrow for the human eye's photoreceptors to distinguish separately, causing your brain to average the reflected light into smooth shapes (the green Christmas tree, brown trunk, and glowing ornaments).
> * Simulated Screen Glow: Mixing pigments directly on paper works subtractively and tends to look dull or muddy, whereas placing pure colors side-by-side allows them to mix optically in the viewer's visual system. Paired with the high-contrast black shading surrounding the tree, the bright RGB segments create the illusion of an illuminated screen."

### 2026-11-26 — Minimalist Blank-Canvas UI Feedback (User)
> "All right, so I have some feedback for this UI. Can we make the UI as minimalist as possible? And whatever that is, can we have a set where you upload an image? The website is basically blank canvas. Aside from this grid with grid lines and then marks on the X and Y axis. But then it's going to be the source contrast boosted. Pixel grid. But then when you hover over each one of the pixels on the grid, it'll have a floating pop-up where basically it shows you for the grid. It will be a pop-up that will show you the three values of the stripes. And then can we have it so that it's possible to, when you click on that pixel, you can mark it as completed within the grid itself. And then it'll get grayed out. And then the colors will get very desaturated or grayed out. But you have the option to undo that by re-clicking on it."

### 2026-11-26 — Cursor & Pop-Up Iteration (User)
> "this looks good. one change. can you make it so that the floating hover box goes to the top right of the cursor, and give the cursor when hovering over the grid, the `crosshair` value?"

### 2026-11-26 — Right Sidebar & 4× Grid Density Final Direction (User)
> "Okay, okay, on second thought, can you make it so that the info appears in a sidebar on the right side of the screen? So that none of the information is covering the rest of the grid, and then can you also make the existing grid more times as dense by doubling the width and height of the grid, but use the same image?"

### 2026-11-26 — Approval for OpenSpec Change (User)
> "/openspec-ff-change for the design language and ui/ux. the app looks great."

### 2026-11-26 — Refactor-instead-of-rewrite direction (User)
> "is it possible to just simply reuse the visual playground as the ui, then hook it up into the backend?"
>
> "what if we did a little code refactor for the playground so it isn't just one monolith file, then plugged in the backend to that. would that work?"

An assistant reply (quoted as context, not as a requirement) proposed splitting the playground into `index.html`, `styles/tokens.css`, `styles/main.css`, and JS modules (`apiClient`, `state`, `gridCanvas`, `inspectorSidebar`, `main`), with only `apiClient` talking to a backend via `POST /api/process`. It ended by asking whether the backend should be Python (FastAPI) or Node; the user has not answered. This change adopts the refactor and the single-seam idea, and defers the backend (see below).

### Raised but not acted on

- **Remote Python/Node backend for `/api/process`**: Raised in the refactor discussion. Deferred: the engine already runs in `< 20 ms` for `56 × 42` client-side, every other change (`worker-pipeline-and-pdf-export`, `project-persistence`) assumes zero backend, and the backend stack choice was never answered. Cost of revisiting is low because of the `EngineClient` seam. Triggers for revisiting: OpenCV-based calibration or server-side PDF becoming requirements.

- **Camera-based Pencil Swatch Calibration**: Mentioned in the initial pipeline description as Phase 2 (photographing a physical 15-patch swatch card). Deliberately excluded from this change so this change focuses strictly on the design language, minimalist UI/UX, interactive grid workspace, and core real-time optical-mixing engine with preset reflective palettes.
- **Printable PDF Export (`pdf-lib` tiled charts & faint templates)**: Mentioned in the initial pipeline description. Deliberately deferred to a dedicated follow-up export change so the core interactive UI/UX and design system can be implemented, tested, and verified cleanly first.
- **Column-by-Column Run-Length Encoded (RLE) Checklist View**: Explored in the initial playground (`rgb_pencil_playground.html`) and intentionally excluded from the primary minimalist blank-canvas UI to preserve zero visual clutter; can be added later as an optional export or secondary drawer if requested.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| Optical (partitive) mixing | Side-by-side placement of pure R, G, B colored pencil stripes that average linearly in reflected light intensity at viewing distance | Subtractive pigment blending by layering colored pencils on top of each other |
| Logical pixel cell | One `(X, Y)` square on the interactive grid representing 3 vertical stripe segments (`R`, `G`, `B`) | A single individual R, G, or B stripe column |
| Stripe segment | One of the three vertical sub-columns (`R`, `G`, or `B`) inside a logical pixel cell, assigned one of 5 discrete shading states | The full RGB pixel square |
| Shading state | One of 5 discrete pencil treatments per stripe: `□ White Paper` (0), `● Full Color` (1), `◐ Light Black` (2), `◑ Heavy Black` (3), `■ Solid Black` (4) | Continuous 0–255 opacity or arbitrary color picking |
| Contrast-boosted grid | The default grid rendering mode displaying each logical pixel in its S-curve contrast-enhanced source color (before RGB stripe decomposition) so the user recognizes the subject clearly while drawing | The raw unboosted photo or the blurred distance simulation |
| Completed cell | A logical pixel cell clicked (or drag-painted) by the user, rendered in heavily desaturated muted gray with a subtle diagonal hatch to recede visually; re-clicking undoes completion | Permanently deleted or locked pixel |
| Right inspector sidebar | The fixed-width (`256px`) minimalist right column displaying hovered pixel coordinates, 3 vertical RGB stripe bars, target vs. optical mix swatches, 3 state labels, and 5-state legend without ever overlapping the grid | A collapsible multi-panel control dashboard or floating tooltip |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| IEC 61966-2-1 (sRGB Transfer Function) | Exact piecewise linearization (`<= 0.04045 ? c/12.92 : ((c+0.055)/1.055)^2.4`) required before linear light averaging of adjacent RGB stripes | Public standard | 2026-11-26 |
| CIE 1976 (L\*a\*b\* / ΔE76) | Perceptual color space conversion from D65 XYZ for matching each pixel against the 125-combo LUT | Public standard | 2026-11-26 |
| Floyd & Steinberg (1976), *An Adaptive Algorithm for Spatial Greyscale* | Error diffusion kernel weights (`7/16` right, `3/16` bottom-left, `5/16` bottom, `1/16` bottom-right) for smooth gradients with 5 discrete states | Academic / public algorithm | 2026-11-26 |
| `playgrounds/minimal_grid_playground.html` (local prototype) | Validated minimalist design language, `#fafafa` blank canvas, hairline borders, floating top pills, `56×42` grid density, `crosshair` cursor, and unobstructed `256px` right inspector sidebar | Repo-local | 2026-11-26 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| Vite + React + TypeScript | Superseded 2026-11-26 (was Adopted) | Replaced by the refactor-the-prototype direction; see "Superseded claims" | 2026-11-26 |
| Vite + vanilla TypeScript ES modules (no framework) | Adopted | Reuses approved prototype markup and CSS verbatim; strict typing for color math and store; Vite gives bundling and the module-worker form needed later | 2026-11-26 |
| Remote Python (FastAPI) or Node processing backend | Deferred | See "Raised but not acted on"; `EngineClient` seam keeps it open | 2026-11-26 |
| HTML5 `<canvas>` 2D for the interactive pixel grid | Adopted | Smooth 60fps rendering and crisp `devicePixelRatio` grid lines for 2,352+ cells (`56×42` up to `96×72`), zero DOM node bloat, instant click/drag hit-testing | 2026-11-26 |
| DOM `<table>` / CSS Grid of `<div>` cells | Rejected | Creating 2,352–6,912 interactive DOM elements causes layout thrash on resize and sluggish drag-painting on mobile devices | 2026-11-26 |
| Vanilla CSS Custom Properties (Design Tokens) | Adopted | Matches the ultra-minimalist editorial aesthetic (`#fafafa` canvas, `#171717` ink, `#e5e5e5` hairlines, `Inter` + `JetBrains Mono`) with zero framework bloat | 2026-11-26 |
| Heavy UI Component Library (MUI / Chakra / AntD) | Rejected | Introduces opinionated chrome and bundle weight antithetical to the whisper-quiet blank-canvas aesthetic | 2026-11-26 |
| Vitest + jsdom (DOM tests via plain DOM APIs) | Adopted | Fast unit testing for color math, 125-combo LUT, dithering, grid geometry, and completion/undo state logic | 2026-11-26 |

## Patterns adopted

- **Minimalist Editorial Blank-Canvas Shell**: Adopted from our validated prototype (`playgrounds/minimal_grid_playground.html`) — `#fafafa` canvas background, `#ffffff` pure-white `256px` right sidebar separated by a `1px solid #e5e5e5` hairline, translucent `backdrop-filter: blur(10px)` floating pill bar at the top of the canvas stage, and `Inter` + `JetBrains Mono` typography. Lands in `src/styles/tokens.css` and `src/App.tsx`.
- **Verbatim markup/CSS carry-over with `data-ui` hooks**: Adopted from the refactor discussion. The prototype's HTML and CSS move into `index.html` and `src/styles/`; modules bind via `data-ui` attributes rather than regenerating markup. Lands in `index.html`, `src/ui/*.ts`.
- **Adaptive Axis Numbering with Active-Cell Bold Highlight**: Adopted from `playgrounds/minimal_grid_playground.html` — adapts label interval (`1`, `2`, or `5` cells) based on computed cell pixel size while always highlighting and bolding the exact hovered `X` and `Y` coordinate and tick mark without label collision. Lands in `src/components/InteractiveGridCanvas.tsx`.
- **Click-and-Drag Stateful Toggle Painting**: Adopted from `playgrounds/minimal_grid_playground.html` — `pointerdown` inspects whether the target cell is currently done or undone, sets `dragPaintMode` accordingly, and dragging across adjacent cells paints that same state smoothly. Lands in `src/components/InteractiveGridCanvas.tsx` and `src/store/useGridStore.ts`.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| Node.js and npm available in workspace | `/usr/local/bin/node`, `/usr/local/bin/npm` | `which node npm` exited 0 | 2026-11-26 | stable |
| OpenSpec CLI version and local schema | `1.7.0`, schema `tdd-rnd` in `openspec/config.yaml` | `openspec --version` and reading `openspec/config.yaml` | 2026-11-26 | stable |
| Workspace is greenfield (no `package.json` yet) | Only `playgrounds/` and `openspec/` exist | `ls -la` at project root | 2026-11-26 | decays once scaffolded |
| Minimalist prototype JS syntax and HTTP delivery | `JS syntax OK`, `HTTP 200` | `node -e "new Function(...)"` + `curl` against local server | 2026-11-26 | stable |
| Prototype is a single monolithic file | `playgrounds/minimal_grid_playground.html` is `1,210` lines containing markup, CSS, and JS | `wc -l playgrounds/*.html` | 2026-11-26 | decays once refactored |
| Default 4× dense grid pixel & stripe counts | `56 × 42 = 2,352` logical pixels (`7,056` stripe segments) for 4:3 images | Arithmetic + verified in `playgrounds/minimal_grid_playground.html` | 2026-11-26 | stable |

## Unverified assumptions

- **Touchscreen / Narrow Mobile Layout (`< 768px`)**: On narrow viewports, a fixed `256px` right sidebar would squeeze the grid canvas; collapsing the right sidebar into a compact fixed bottom inspector sheet below `768px` is assumed to preserve the zero-overlap principle on phones. Checking cost: visual inspection in a `390×844` responsive browser viewport during verification.
- **Persistent `localStorage` Keying for Uploaded Images**: Computing a lightweight deterministic hash of downsampled pixel data + grid width is assumed sufficient to persist and restore completed cells across reloads without storing large base64 images. Checking cost: unit test in Vitest.

## Superseded claims

- **Multi-card left sidebar + 3-viewport preview layout** (2026-11-26): Originally proposed in `playgrounds/rgb_pencil_playground.html`. Superseded by user feedback requesting an ultra-minimalist blank canvas centered solely on the contrast-boosted pixel grid.
- **Floating cursor pop-up (bottom-right, then top-right)** (2026-11-26): Prototyped in early versions of `playgrounds/minimal_grid_playground.html`. Superseded by user feedback requesting a dedicated right-hand sidebar so zero information ever covers neighboring grid cells.
- **Coarse `28 × 21` default grid** (2026-11-26): Used in the first minimalist prototype. Superseded by user request to double both width and height (`56 × 42`, 4× denser) on the same image.

- **React component architecture** (2026-11-26): Earlier artifacts specified React 19 components (`InteractiveGridCanvas.tsx`, `PixelInspectorSidebar.tsx`, `MinimalTopBar.tsx`, `SettingsPopover.tsx`, `App.tsx`) and `useGridStore`. Superseded by the user's request to refactor the existing playground instead of rewriting it. Replaced by `src/ui/gridCanvas.ts`, `inspectorSidebar.ts`, `topBar.ts`, `settingsPopover.ts`, `src/main.ts`, and `src/store/gridStore.ts`. Behaviour and visuals are unchanged; only the implementation vehicle changed.

## Links out

- [Minimalist Grid Prototype](../../../playgrounds/minimal_grid_playground.html) — Approved interactive HTML/CSS/JS reference for the design language and UI/UX.
- [Original Pipeline Explorer Prototype](../../../playgrounds/rgb_pencil_playground.html) — Earlier prototype demonstrating multi-view distance blur and RLE concepts.
