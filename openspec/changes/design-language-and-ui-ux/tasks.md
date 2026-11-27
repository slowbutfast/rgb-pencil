## 1. Test Scaffolding (TDD)

- [ ] 1.1 Initialize Vite + vanilla TypeScript (strict) + Vitest + jsdom project scaffold (`package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`) and stub core type contracts in `src/types/pipeline.ts`; no React dependency
- [ ] 1.2 Write failing unit tests in `src/engine/__tests__/colorMath.test.ts` covering sRGB ↔ Linear RGB round-trips, 125-combo LUT generation, dark-border weighting, and R+G yellow optical averaging in CIELAB
- [ ] 1.3 Write failing unit tests in `src/engine/__tests__/contrast.test.ts` covering 1.0× identity pass-through, S-curve shadow crush / highlight lift, and `[0, 255]` clamping
- [ ] 1.4 Write failing unit tests in `src/engine/__tests__/matcher.test.ts` covering aspect-preserving grid dimensions (default `56×42`, range `16–96`), deterministic matching without dithering, and Floyd–Steinberg linear-RGB error diffusion
- [ ] 1.5 Write failing unit tests in `src/store/__tests__/gridStore.test.ts` covering single-click completion toggle, undo, drag-paint state consistency, reset, out-of-bounds pruning, subscribe/unsubscribe, and `localStorage` fingerprint persistence with fallback
- [ ] 1.6 Write failing unit tests in `src/engine/__tests__/engineClient.test.ts` covering that the local `EngineClient` resolves the same `MatchedGrid` as a direct engine call and rejects widths outside `16–96`
- [ ] 1.7 Write failing jsdom tests in `src/ui/__tests__/ui.test.ts` covering `data-ui` binding and dispose, collapsed-by-default Settings popover, outside-click dismissal, inspector empty state and live 3-stripe readout, and `Pixel Grid` / `Stripes` mode toggle

## 2. Prototype Refactor & Design Language

- [ ] 2.1 Create `index.html` from the approved prototype's markup (top pills, settings popover, canvas stage, right inspector, 5-state legend), adding `data-ui` hooks and mobile viewport metadata; keep markup otherwise verbatim
- [ ] 2.2 Create `src/styles/tokens.css` defining all semantic CSS custom properties from `design.md` (`--bg`, `--surface`, `--ink`, `--ink-muted`, `--line`, `--sidebar-w`, channel badges, typography families, spacing, radii)
- [ ] 2.3 Create `src/styles/main.css` from the prototype's CSS: the two-column desktop shell (`1fr 256px`), responsive `< 768px` stacked mobile layout with `>= 44×44px` touch targets, translucent floating pills, and accessible focus outlines; replace hardcoded values with tokens
- [ ] 2.4 Side-by-side parity check against `playgrounds/minimal_grid_playground.html` at `1280×800` before moving on; record differences as defects

## 3. Optical Mixing Pipeline Engine

- [ ] 3.1 Implement `src/engine/palettes.ts` with the 5 shading state definitions (`□`, `●`, `◐`, `◑`, `■`) and 3 preset pencil palettes (`reflective`, `vibrant`, `emissive`)
- [ ] 3.2 Implement `src/engine/colorMath.ts` with IEC 61966-2-1 sRGB ↔ Linear RGB, D65 XYZ → CIELAB, and `buildComboLUT` (125 entries with dark-border linear weighting)
- [ ] 3.3 Implement `src/engine/contrast.ts` with the 256-entry precomputed sigmoidal S-curve LUT
- [ ] 3.4 Implement `src/engine/matcher.ts` with pixel grid matching, CIELAB ΔE76 lookup, Floyd–Steinberg linear-RGB error diffusion, and deterministic FNV-1a image+grid fingerprinting
- [ ] 3.5 Implement `src/engine/sampleScenes.ts` generating the 3 procedural sample scenes (`Tree`, `Sunset`, `Orbs`) on an offscreen canvas
- [ ] 3.6 Implement `src/engine/engineClient.ts` (`EngineClient` interface plus `createLocalEngineClient()` composing downsample, contrast, match, and dither)

## 4. State Store & Persistence

- [ ] 4.1 Implement `src/store/gridStore.ts`, a framework-free observable store (`getState`, `subscribe`, actions) managing source image, pipeline settings (default `cols = 56`, `contrast = 1.45`, `palette = 'reflective'`, `dither = true`), `viewMode`, `hoveredCell`, `completedCells` set, an injected `EngineClient`, and resilient `localStorage` persistence

## 5. Minimalist Blank-Canvas UI Modules

- [ ] 5.1 Implement `src/ui/gridCanvas.ts` rendering the HiDPI centered pixel grid with rAF-coalesced redraws, crisp `1px` grid lines, major 5-cell reference lines, adaptive X/Y axis labels with active coordinate bolding, `crosshair` cursor on cells (`default` on margins), double-stroke hover ring, desaturated + hatched completed cells, and click/drag toggle painting
- [ ] 5.2 Implement `src/ui/inspectorSidebar.ts` driving the unobstructed `256px` right-hand column with empty state, `(X, Y)` coordinate, `To Do / Completed` badge, dark 3-stripe visual card, Target vs. Mix swatches, 3 channel rows (`R`, `G`, `B`), `ΔE` readout, and persistent 5-state legend, writing text via `textContent`
- [ ] 5.3 Implement `src/ui/topBar.ts` and `src/ui/settingsPopover.ts` for image upload, progress counter, `Reset`, `Pixel Grid` / `Stripes` toggle, and collapsed-by-default pipeline settings
- [ ] 5.4 Implement `src/ui/dropZone.ts` (full-canvas drag-and-drop, non-image files ignored) and assemble `src/main.ts` to construct the store with the local `EngineClient`, mount all UI modules, and load the default sample scene

## 6. Verification & Empirical Audit

- [ ] 6.1 Run full regression test suite (`npm test`) and production build (`npm run build`), verifying all tests pass with zero TypeScript or bundle errors
- [ ] 6.2 Populate `verification.md` with the Requirement Adherence Audit Matrix, resolved assumptions, manual UI/UX verification results (desktop + `390×844` mobile + side-by-side prototype parity), and verbatim execution logs
