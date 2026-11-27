> [!NOTE]
> This document specifies **technical system architecture only** (data flow, storage, APIs, concurrency, state synchronization, and security).
> All visual, aesthetic, and UI design decisions (colors, typography, component styling, responsive layout) must be defined in `design.md`.

## Context

`pencil-rbg-tool` is a greenfield, 100% client-side web application that transforms raster photographs into interactive RGB optical-mixing colored pencil grids. All image decoding, downsampling, color-space math, 125-combo matching, and drawing progress persistence execute locally in the browser with no backend server.

Primary technical constraints:
- **Dense grid throughput**: Default grids are `56 × 42 = 2,352` logical pixels (and up to `96 × 72 = 6,912` pixels). Each pixel evaluates `125` CIELAB candidates (`~294,000` to `~864,000` distance checks per pipeline run) plus Floyd–Steinberg error propagation.
- **60fps canvas interaction**: Hover hit-testing, active axis highlighting, and click-and-drag completion painting must remain instantaneous without triggering React reconciliation of thousands of DOM nodes.
- **Zero-server persistence**: User progress (completed pixel coordinates) must survive page reloads via `localStorage` without storing megabyte-scale image data URLs.

## System Architecture Diagram

```mermaid
flowchart TD
    UI_Upload["Image Upload / Drop / Sample Generator (ui/dropZone.ts)"] --> Store["gridStore (observable store + localStorage)"]
    UI_Settings["Settings Controls (cols, contrast, palette, dither)"] --> Store

    Store -->|ImageData + PipelineParams| Client["EngineClient (engineClient.ts)"]
    Client -->|local implementation| Engine["Pure TS Engine (src/engine/)"]
    subgraph Engine["Pure Functional Pipeline"]
        E1["contrast.ts: S-curve LUT"]
        E2["colorMath.ts: sRGB ↔ Linear ↔ CIELAB + 125-Combo LUT"]
        E3["matcher.ts: Area downsample + ΔE76 match + Floyd–Steinberg"]
        E1 --> E3
        E2 --> E3
    end

    Engine -->|MatchedGrid| Client
    Client -->|MatchedGrid| Store
    Store -->|subscribe: MatchedGrid + completed Set + viewMode| Canvas["ui/gridCanvas.ts (HTML5 2D Canvas, rAF-coalesced redraw)"]
    Canvas -->|hover(col, row)| Store
    Canvas -->|toggleCell / paintCell(col, row)| Store
    Store -->|subscribe: hoveredCell + completed| Sidebar["ui/inspectorSidebar.ts (direct DOM updates)"]
    Store -->|persist(imageHash, completed)| LS["localStorage"]
```

## Goals / Non-Goals

**Goals:**
- Pure, deterministic, framework-agnostic TypeScript engine (`src/engine/`) that can be unit-tested in Node/Vitest without a browser DOM.
- Single source of truth for grid state, hovered cell, and completed cell set (`src/store/gridStore.ts`), a framework-free observable store: `getState()`, `subscribe(listener)`, and named actions.
- One narrow seam between UI and computation (`EngineClient`), so the engine can run locally, in a worker, or remotely without UI changes.
- High-DPI HTML5 `<canvas>` rendering and O(1) coordinate hit-testing (`(pointerX - padLeft) / cellSize`) for smooth interaction up to `96 × 72` grids.
- Deterministic `localStorage` persistence of completed cells keyed by a compact image + grid-width fingerprint.

**Non-Goals:**
- No backend API, authentication, or cloud database. A remote engine is deferred; only the `EngineClient` interface and its local implementation exist here.
- No UI framework (React, Vue, etc.). The UI is the approved prototype's markup and CSS, split into modules.
- No camera-based swatch calibration (deferred to Phase 2 change).
- No PDF generation (`pdf-lib`) in this change (deferred to dedicated export change; `MatchedGrid` data contract is designed so PDF export plugs in cleanly later).

## Technical Decisions

### 1. Vite + Vanilla TypeScript ES Modules (Strict Mode), Refactored from the Prototype
- **Decision**: Scaffold with Vite, TypeScript (strict), and Vitest + jsdom. Split `playgrounds/minimal_grid_playground.html` into: `index.html` (static shell markup), `src/styles/tokens.css` and `src/styles/main.css`, and modules `src/engine/*`, `src/store/gridStore.ts`, `src/ui/{gridCanvas,inspectorSidebar,topBar,settingsPopover,dropZone}.ts`, wired together in `src/main.ts`.
- **Rationale**: The prototype's UI is already approved. Reusing its markup and CSS verbatim removes visual-drift risk and avoids a component rewrite. Splitting out the monolith gives testable engine/store modules and a clean seam for later changes. Vite still provides TypeScript, module bundling, and the worker-import form the follow-up change needs.
- **Alternatives considered**: React 19 rewrite (rejected, re-implements approved UI for no user-visible gain and adds reconciliation concerns to a canvas-heavy app); keeping the single HTML file (rejected, untestable and unmaintainable); Next.js (rejected, no SSR need).

### 2. Pure-Math Linear-RGB + CIELAB Engine (Zero Heavy Runtime Dependencies)
- **Decision**: Implement exact IEC 61966-2-1 sRGB ↔ Linear RGB and D65 XYZ → CIELAB transforms directly in `src/engine/colorMath.ts` with typed arrays (`Float32Array`) and precomputed 125-entry combo LUTs.
- **Rationale**: Evaluating 125 entries across `56 × 42` pixels completes in `< 20ms` synchronously in V8 with zero object-allocation churn, avoiding serialization overhead and keeping slider updates instantaneous.
- **Alternatives considered**: `culori` per-pixel inside inner loop (rejected for inner loop due to per-call object allocation overhead; pure numeric loops over flat/typed structs are ~10× faster and trivially verifiable with unit tests).

### 3. HTML5 `<canvas>` 2D with Imperative Redraws Driven by State
- **Decision**: Render the pixel grid, grid lines, axis ticks, and hover ring on a single `devicePixelRatio`-scaled `<canvas>` element inside `InteractiveGridCanvas.tsx`.
- **Rationale**: O(1) hit-testing, crisp subpixel-aligned `0.5px` strokes, and no framework reconciliation per cell.
- **Alternatives considered**: SVG or CSS Grid of `<div>` cells (rejected — 2,352+ DOM nodes degrade resize and drag-paint latency).

### 4. Lightweight Fingerprint Keying for `localStorage` Progress
- **Decision**: Derive a deterministic 32-bit FNV-1a hash from the downsampled RGB bytes + `cols` + `rows` (`rgb-pencil:v1:<hash>`) to store the serialized array of completed `"col,row"` keys in `localStorage`.
- **Rationale**: Survives page reloads for both sample scenes and re-uploaded images without storing large base64 payloads or hitting the 5MB `localStorage` quota.
- **Alternatives considered**: Storing full image data URL in `localStorage` (rejected — easily exceeds quota on phone camera photos).

### 5. `EngineClient` Seam Between UI and Computation
- **Decision**: Define `interface EngineClient { process(req: PipelineRequest): Promise<PipelineResult> }` in `src/engine/engineClient.ts`. The only implementation here, `createLocalEngineClient()`, calls the pure engine synchronously and resolves. `main.ts` constructs it and injects it into `gridStore`; UI modules never import engine internals.
- **Rationale**: Mirrors the clean seam from the refactor proposal. Follow-up changes plug in a worker client (`worker-pipeline-and-pdf-export`) or a remote client behind the same interface with no UI edits. Hover, click, drag-paint, and sidebar updates never touch the client, so they stay instant.
- **Alternatives considered**: UI calling `matcher.ts` directly (rejected, hard-wires execution location); building the backend now (rejected, see `research.md`).

### 6. Imperative UI Modules With Store Subscriptions
- **Decision**: Each `src/ui/*.ts` module exports `mountX(root: HTMLElement, store: GridStore): () => void`, binds to elements in `index.html` by `data-ui` attributes, subscribes to the store, and returns a dispose function. Canvas redraws are coalesced through one `requestAnimationFrame` dirty flag. DOM text is written with `textContent`, never `innerHTML` with data.
- **Rationale**: Predictable lifecycle without a framework, trivially testable under jsdom, and one redraw per frame regardless of how many store events fire during drag-painting.
- **Alternatives considered**: Custom elements (rejected, more ceremony than the three static panels warrant); a tiny reactive library (rejected, not needed for one store).

## Risks / Trade-offs

- **[Risk] Main-thread jank on very high grid widths (`96 × 72`) during rapid slider scrubbing** → **Mitigation**: Precompute the 256-entry S-curve lookup table and 125-entry combo LUT outside pixel loops, use `Float32Array` for the Floyd–Steinberg linear buffer, and wrap slider-driven recomputation in `requestAnimationFrame` coalescing.
- **[Risk] `localStorage` unavailable in restricted/incognito browsers** → **Mitigation**: Wrap all `localStorage.getItem`/`setItem` calls in `try/catch` with graceful in-memory fallback.
- **[Risk] Hand-written DOM binding drifts from the approved prototype** → **Mitigation**: copy prototype markup and CSS verbatim into `index.html` and `main.css`, bind by `data-ui` attributes only, and add a side-by-side manual parity check in `tests.md`.
- **[Risk] Touchscreens lack hover events** → **Mitigation**: On `pointerdown` with `pointerType === 'touch'`, update the inspected cell in the sidebar immediately alongside toggling (or provide a dedicated toggle button inside the mobile bottom inspector sheet).

## Migration & Rollback Plan

- Greenfield Vite application scaffolded at repository root (`index.html`, `package.json`, `src/`). Markup and CSS are lifted from `playgrounds/minimal_grid_playground.html`.
- Existing prototypes under `playgrounds/` remain untouched as the visual reference and for side-by-side parity checks.
- Rollback is trivial via git revert since no external databases or persisted user migrations exist.
