# Verification — `design-language-and-ui-ux`

## 1. Executive Summary & Environment

| Field | Value |
| :--- | :--- |
| Change | `design-language-and-ui-ux` (OpenSpec schema `tdd-rnd`) |
| Status | **IMPLEMENTED — automated gates PASS; visual capture PASS** |
| Date | 2026-11-27 |
| Branch | `feat/multi-20261126-2351` (no commits created by this agent) |
| Node / npm | `v22.23.2` / `10.9.8` |
| OS / arch | Linux, ARM64 container |
| App runner | Vite `8.4.0` (`npm run dev` → `http://localhost:5173/`) |
| Test runner | Vitest `5.1.2` + jsdom `31.0.1`, single worker (`--maxWorkers=1`) |
| TypeScript | `5.9.3`, `"strict": true`, `noUnusedLocals`, `noUnusedParameters`, `tsc --noEmit` clean |
| Runtime dependencies | **None** (only dev deps: `vite`, `typescript`, `vitest`, `jsdom`; no React, no UI framework, no `@testing-library/*`) |

`npm test`: **6 files / 60 tests passed**. `npm run build`: **19 modules transformed, 0 TypeScript errors** (output in §8). Post-verification repair: `patch.md` › `PATCH-01` (touch readout retention) — **APPLIED**.

### TDD evidence (red before green)

Group 1 tests were written first and run before any implementation existed:

```
FAIL src/engine/__tests__/colorMath.test.ts
FAIL src/engine/__tests__/contrast.test.ts
FAIL src/engine/__tests__/matcher.test.ts
FAIL src/engine/__tests__/engineClient.test.ts
FAIL src/store/__tests__/gridStore.test.ts
FAIL src/ui/__tests__/ui.test.ts
Test Files  6 failed (6)
     Tests  no tests   (module-resolution failures: modules did not exist yet)
```

Implementation then proceeded engine → store → UI, with each narrow suite (`npx vitest run src/engine`, `src/store`, `src/ui`) green before moving on.

---

## 2. Requirement Adherence Audit Matrix

Status legend: **PASS** = asserted by an automated test; **PASS (audit)** = verified by static inspection of the cited implementation (no headless-canvas pixels available under jsdom); **DEFERRED** = needs the orchestrator's browser capture, listed in §10.

### 2.1 `design-language`

| Req | Scenario | Status | Evidence |
| :--- | :--- | :--- | :--- |
| Minimalist blank-canvas visual hierarchy | Design tokens govern all surfaces | PASS (audit) | `src/styles/tokens.css:6-91`; every colour in `src/styles/main.css` is a `var(--*)` (the only literal colours left are the canvas theme fallbacks in `src/ui/gridCanvas.ts:21-57`, used only when CSS custom properties are unavailable). `index.html` contains no inline colour styles. |
| Editorial sans/mono pairing | Coordinates and progress align in JetBrains Mono | PASS (audit) | `src/styles/tokens.css:57-58`; `.progress-readout`, `.coord-value`, `.state-sub`, `.meta-footer`, `.legend-sym` all `var(--font-mono)` (`src/styles/main.css:117, 158, 289, 406, 439`); inspector writes into those elements (`src/ui/inspectorSidebar.ts:79-104`). |
| Whisper-quiet pills + collapsed settings | Initial load is uncluttered (Settings closed) | PASS | `ui.test.ts` › "is closed by default and toggles from the trigger"; markup `index.html:35`, CSS hides `.settings-popover` unless `.open` (`main.css:119-126`). |
| Whisper-quiet pills + collapsed settings | Outside click closes the popover | PASS | `ui.test.ts` › "closes on an outside click" and "keeps the popover open when clicking inside it"; `src/ui/settingsPopover.ts:47-58`. |
| Responsive unobstructed layout | Desktop `>= 768px` two columns, 256px sidebar | PASS (audit) | `src/styles/main.css:35-41` (`grid-template-columns: 1fr var(--sidebar-w)`), `tokens.css:59` (`--sidebar-w: 256px`), hairline `border-left` (`main.css:334`). |
| Responsive unobstructed layout | Mobile `< 768px` inspector docks below grid | PASS (visual) | `src/styles/main.css:449-499`; 390×844 capture: stage ends above inspector, zero overlap, Upload 104×44 and Reset 55×44 (see §10). |
| Visual parity with the approved prototype | Built app matches prototype side by side | PASS (visual) | 1280×800 side-by-side capture vs `playgrounds/minimal_grid_playground.html` with default Tree scene: mean absolute pixel difference 0.53/255, 2.47% of pixels differ by >8, 0.15% by >32; no structural, token, or typographic difference visible. Known intentional deltas in §7, measurements in §10. |
| Visual parity with the approved prototype | Modules bind via `data-ui`, do not recreate markup | PASS | `ui.test.ts` › "finds every data-ui hook and renders the initial progress readout"; all five `mountX` read existing shell nodes (`src/ui/*.ts`). |

### 2.2 `interactive-pixel-grid`

| Req | Scenario | Status | Evidence |
| :--- | :--- | :--- | :--- |
| Centered contrast-boosted grid, crisp lines | Default 4× grid is `56 × 42` (2,352 cells) | PASS | `matcher.test.ts` › "builds the default 56 x 42 grid for a 4:3 source"; `matcher.test.ts` › `computeRows` 56→42 / 96→72; store default in `gridStore.test.ts` › "starts with the specified default settings". |
| Centered contrast-boosted grid, crisp lines | Canvas recalculates on resize without clipping | PASS (audit) | `src/ui/gridCanvas.ts:96-119` (fit), `:337-345` (ResizeObserver + window resize). Pixel-level crispness pending capture. |
| Adaptive X/Y axes with active highlight | Hovering `(23,17)` bolds exact labels, suppresses collisions | PASS (visual) | `src/ui/gridCanvas.ts:121-205`; 1280×800 capture hovered `X21, Y11`: both axis labels bold/darker, neighbouring labels suppressed, no collision (see §10). |
| Crosshair cursor + active cell ring | Crosshair over cells, default over margins, double ring | PASS (visual) | `src/ui/gridCanvas.ts:296-335`; browser capture: `crosshair` over a cell, `default` over margins, double-stroke ring visible; no overlay anywhere (see §10). |
| Click-to-complete / drag / undo | Single click marks done and increments progress | PASS | `gridStore.test.ts` › "toggles a single cell on click and notifies subscribers"; `ui.test.ts` › "updates the status pill the moment the hovered cell is completed"; progress render `src/ui/topBar.ts:22-24`. |
| Click-to-complete / drag / undo | Re-click undoes completion | PASS | Same `gridStore.test.ts` toggle test (second toggle removes the key). |
| Click-to-complete / drag / undo | Drag paints the gesture direction across cells | PASS | `gridStore.test.ts` › "paints a drag gesture in one consistent direction". |
| Click-to-complete / drag / undo | Reset returns progress to `0 / <total> done` | PASS | `gridStore.test.ts` › "clears every completed cell on reset"; `ui.test.ts` › "resets every completed cell from the top bar". |
| Pixel Grid / Stripes toggle | Stripes renders 3 vertical RGB stripes, completed stays desaturated | PASS (visual) | Toggle asserted by `ui.test.ts` › "switches view mode and active styling cleanly"; 1280×800 capture shows 3 vertical stripes per cell with completed cells still desaturated (see §10). |
| Local persistence | Reload restores 10 completed cells | PASS | `gridStore.test.ts` › "persists completions under the rgb-pencil:v1 fingerprint key and restores them". |

### 2.3 `pixel-inspector-sidebar`

| Req | Scenario | Status | Evidence |
| :--- | :--- | :--- | :--- |
| Unobstructed right-hand column | Hover never covers neighbouring cells | PASS (audit) | `index.html:90-133` is a sibling `<aside>` outside `.stage`; CSS `main.css:333-343` (fixed column, hairline divider); no overlay nodes exist. |
| Live 3-stripe readout | Hovering `(12,8)` populates coordinate, status, bars, swatches, 3 labels, ΔE, hint | PASS | `ui.test.ts` › "renders the live 3-stripe readout for a hovered cell" (asserts `X12, Y8`, `To Do`, `Full Color`/`Light Black`/`Solid Black`, `● Red Stripe` etc., `ΔE 4.2`, `Click cell to mark done`, bar colour). Implementation `src/ui/inspectorSidebar.ts:52-108`. |
| Live 3-stripe readout | Tapping a cell on touchscreens keeps the readout visible | PASS | `ui.test.ts` › "keeps the sidebar readout visible after a touch tap, then clears on mouse leave": dispatches `pointerdown → pointerup → pointerleave` with `pointerType: 'touch'`, then asserts `X11, Y11`, `[data-ui="inspector-active"]` `.visible`, empty state hidden, and that a later mouse leave clears it. Fix recorded in `patch.md` › `PATCH-01` (`src/ui/gridCanvas.ts` touch-aware `onPointerLeave`). |
| Live 3-stripe readout | Clicking hovered pixel switches to `Completed` + undo hint | PASS | `ui.test.ts` › "updates the status pill the moment the hovered cell is completed". |
| Quiet empty state + 5-state legend | Initial load shows empty state and legend without jump | PASS | `ui.test.ts` › "shows the empty state before any hover" and "renders the 5-state legend from the shell" (5 legend lines). |

### 2.4 `optical-mixing-pipeline`

| Req | Scenario | Status | Evidence |
| :--- | :--- | :--- | :--- |
| Upload / drop / sample scenes | Upload replaces grid, preserves aspect, clears prior cells | PASS | `gridStore.test.ts` › "clears previous completions when a different image is loaded"; aspect in `matcher.test.ts` `computeRows`; ingestion `src/ui/dropZone.ts:30-69`; samples `src/engine/sampleScenes.ts:15`. Positive-path pixel decode needs browser capture. |
| Upload / drop / sample scenes | Non-image drop ignored without clearing grid | PASS | `ui.test.ts` › "ignores non-image files without clearing the current grid" and "ignores non-image drops and clears the dragover state". |
| S-curve contrast boost | `1.0×` is exact identity | PASS | `contrast.test.ts` › "is an exact identity transform at 1.0x". |
| S-curve contrast boost | `1.45×` crushes below 0.46, lifts above, clamped | PASS | `contrast.test.ts` › "crushes shadows below the 0.46 centre and lifts highlights above it", "clamps every output into [0, 255]", "stays monotonic non-decreasing". |
| 125-combo linear-RGB LUT + CIELAB | Exactly 125 valid entries per palette | PASS | `colorMath.test.ts` › `it.each` "builds exactly 125 unique combos for %s" (all 3 palettes). |
| 125-combo linear-RGB LUT + CIELAB | R+G full + B solid black averages yellow (`b* > 0`, higher `L*`) | PASS | `colorMath.test.ts` › "optically averages full red + full green + solid black into yellow". |
| Optional Floyd–Steinberg | Dither off → deterministic identical pixels | PASS | `matcher.test.ts` › "matches identical pixels identically when dithering is disabled". |
| Optional Floyd–Steinberg | Error diffusion reduces mean luminance error | PASS | `matcher.test.ts` › "reduces mean luminance error on a flat mid-gray patch with dithering". Weights `7/16, 3/16, 5/16, 1/16` at `src/engine/matcher.ts:196-211`. |
| Width adjustment + pruning | Slider `16–96` recomputes with aspect rows and prunes cells | PASS | `gridStore.test.ts` › "prunes out-of-bounds completions when the grid width shrinks", "clamps width changes into the 16-96 range"; `matcher.test.ts` rejects 15/97. |

---

## 3. Behavioural Acceptance Checklist

| Acceptance item | Status | Evidence |
| :--- | :--- | :--- |
| Defaults `56×42`, width 16–96, contrast 1.45 @ 0.46, palette `reflective`, dither on @ 0.85 | PASS | `DEFAULT_SETTINGS` `src/types/pipeline.ts:75-81`; `gridStore.test.ts` defaults test. |
| 5 shading states `□ ● ◐ ◑ ■` | PASS | `SHADING_STATES` `src/types/pipeline.ts:7-13`; inspector + legend tests. |
| 3 palettes (reflective, vibrant, emissive) | PASS | `src/engine/palettes.ts:18-97`; LUT test `it.each` over all keys. |
| 125-combo LUT, dark-border ratio 0.15, linear-RGB average | PASS | `colorMath.ts:57-88`; `colorMath.test.ts` border-weight test (exact 0.85/0.15 decomposition). |
| CIELAB ΔE76 matching | PASS | `colorMath.ts:32-51`, `matcher.ts:126-146`; yellow test + match tests. |
| Floyd–Steinberg in linear RGB | PASS | `matcher.ts:196-211`; dither error-reduction test. |
| FNV-1a over downsampled RGB + cols + rows | PASS | `matcher.ts:88-111`; `matcher.test.ts` fingerprint suite (deterministic, width/row/pixel sensitive, 8 hex chars). |
| localStorage key `rgb-pencil:v1:<hash>`, try/catch in-memory fallback | PASS | `gridStore.ts:18, 108-135`; `gridStore.test.ts` persistence + "falls back to in-memory progress when localStorage throws". |
| `EngineClient.process(req): Promise<PipelineResult>`; `createLocalEngineClient()`; UI never imports engine internals | PASS | `src/engine/engineClient.ts:13-20`; `engineClient.test.ts` parity + RangeError; UI computation only through `store` (`main.ts:12-20`). Only `settingsPopover` imports the scene *generator* (see §7). |
| gridStore API `getState/subscribe/actions`, viewMode, hoveredCell, completedCells | PASS | `gridStore.ts:40-66`; store suite (11 tests). |
| Click/drag paint with toggle, reset, prune on width change, persistence | PASS | store suite. |
| index.html shell with `data-ui` hooks, mounted modules returning dispose | PASS | `ui.test.ts` binding suite + "unsubscribes when disposed". |
| Single rAF dirty-flag redraw | PASS (audit) | `gridCanvas.ts:81-94` single `frame` guard; no other draw path. |
| HiDPI canvas | PASS (audit) | `gridCanvas.ts:113-118` `devicePixelRatio` transform. |
| Crisp 1px grid lines + 5-cell major lines | PASS (audit) | `gridCanvas.ts:243-269`. |
| Axis ticks with bold active coordinate | PASS (audit) | `gridCanvas.ts:121-205`. |
| Crosshair/default cursors + double-stroke hover ring | PASS (audit) | `gridCanvas.ts:296-303, 271-282`. |
| Desaturate + hatch completed cells | PASS (audit) | `gridCanvas.ts:44-48, 232-239` (`gray = round(lum*0.42+132)`). |
| Stripes mode | PASS (audit) | `gridCanvas.ts:216-231`. |
| 256px sidebar with empty state and live readout | PASS | tokens `--sidebar-w`; inspector tests. |
| Collapsed settings popover closing outside | PASS | settings tests. |
| Upload button + full-canvas drop (ignore non-images) + 3 samples | PASS (browser) | drop-zone tests; samples `src/engine/sampleScenes.ts:15-130`; live drop of a 200×100 PNG produced `96 × 48` with progress reset to `0 / 4608`, and a dropped `.txt` left the grid untouched (see §10). |
| Mobile `<768px` bottom inspector, ≥44×44 targets | PASS (visual) | `main.css:449-499`; 390×844 capture: inspector below the stage with zero overlap, Upload 104×44, Reset 55×44 (see §10). |
| Tokens `--bg`, `--surface`, `--ink`, `--ink-muted`, `--line`, channel badges, swatch stage | PASS | `tokens.css:8-40` (see §7 for the `#525252`/`#737373` reconciliation). |
| Inter + JetBrains Mono | PASS | `tokens.css:57-58`; font link `index.html:8-10`; both loaded in the browser capture. |
| Translucent pills with `backdrop-filter: blur(10px)` | PASS | `main.css:71`; popover `blur(12px)` at `:130`. |
| Prototype markup/CSS parity | PASS (visual) | 1280×800 side-by-side capture; metrics in §10. |

---

## 4. Resolved Assumptions & Empirical Proof

| Assumption (research.md) | Resolution | Proof |
| :--- | :--- | :--- |
| `localStorage` fingerprint of downsampled pixels + grid width is enough to restore progress without storing images | **Confirmed.** Hash covers pre-contrast downsampled RGB + cols + rows; only `"col,row"` strings are stored. | `matcher.test.ts` fingerprint suite; `gridStore.test.ts` save/restore + throwing-storage tests. |
| Narrow mobile (`<768px`) can stack the inspector below the canvas without overlap | **Confirmed visually.** Two-row grid shell with a `max-height: 44vh` inspector; at 390×844 the inspector starts below the stage bottom and no grid cell is covered. | `main.css:449-499`; §10 mobile capture. |
| Prototype is a single monolithic file and can be refactored with zero visual drift | **Confirmed.** Markup and CSS copied verbatim, colours routed through tokens; 1280×800 pixel comparison is effectively identical. | `index.html` vs prototype; §10 parity metrics. |
| IEC 61966-2-1 / CIE 1976 / Floyd–Steinberg formulas from external research are implementable dependency-free | **Confirmed.** Round-trip is exact for all 256 values; ΔE and dither tests pass. | `contrast.test.ts`, `colorMath.test.ts`, `matcher.test.ts`. |
| Node toolchain present; greenfield repo | **Confirmed.** Node `v22.23.2`, npm `10.9.8`; scaffold created from nothing. | §8 build/test logs. |

---

## 5. Nomenclature & Code Symbol Audit

| Glossary term | Code symbol(s) | Verdict |
| :--- | :--- | :--- |
| Optical (partitive) mixing | `buildComboLUT`, `ComboLUTEntry.lin`, docs in `colorMath.ts` | Match |
| Logical pixel cell | `MatchedCell`, `MatchedGrid.cells`, `(col,row)` / `CellCoord` | Match |
| Stripe segment | `ri/gi/bi`, `ShadingStateId`, `PencilPalette.R/G/B` | Match |
| Shading state (`□ ● ◐ ◑ ■`) | `SHADING_STATES` (`src/types/pipeline.ts:7-13`) | Match, exact symbols and names |
| Contrast-boosted grid | `MatchedCell.rgb` (post-LUT sRGB), `buildContrastLUT`, `CONTRAST_CENTER = 0.46` | Match |
| Completed cell | `completedCells: ReadonlySet<string>`, `toggleCell`/`paintCell`, `cellKey()` | Match |
| Right inspector sidebar | `mountInspectorSidebar`, `[data-ui="inspector"]` | Match |
| Engine seam | `EngineClient.process`, `PipelineRequest`/`PipelineResult` | Match |
| Fingerprint | `sourceHash`, `fingerprint()`, `STORAGE_PREFIX = 'rgb-pencil:v1:'` | Match |

Also confirmed: no `React`, `react`, `@testing-library`, `culori`, `pdf-lib`, or `fake-indexeddb` in `package.json`/`node_modules` tree (deferred to later changes). Dependency tree is exactly `jsdom`, `typescript`, `vite`, `vitest`.

---

## 6. Scope & File Inventory

Created (all inside the change's Target Context Map):

```
package.json, package-lock.json, tsconfig.json, vite.config.ts, vitest.config.ts, index.html
src/types/pipeline.ts
src/styles/tokens.css, src/styles/main.css
src/engine/{palettes,colorMath,contrast,matcher,sampleScenes,engineClient}.ts
src/store/gridStore.ts
src/ui/{gridCanvas,inspectorSidebar,topBar,settingsPopover,dropZone}.ts
src/main.ts
src/engine/__tests__/{colorMath,contrast,matcher,engineClient}.test.ts
src/store/__tests__/gridStore.test.ts
src/ui/__tests__/ui.test.ts
openspec/changes/design-language-and-ui-ux/verification.md
openspec/changes/design-language-and-ui-ux/patch.md
```

No modifications to `playgrounds/*`, `.env*`, other changes' artifacts, or any file outside the map. `tasks.md` was updated only for checkboxes. Browser-capture scratch files were kept in an untracked `.verify/` directory for the audit and removed before staging.

---

## 7. Deviations, Design Disagreements & Notes for Review

1. **`--ink-muted` vs `#737373`.** `design.md` (authoritative) sets secondary ink to `#525252`; the prototype uses `#737373`. `tokens.css` exposes **both**: `--ink-muted: #525252` (progress, setting labels, ΔE/meta, legend) and `--ink-soft: #737373` (empty-state copy, sample chips, channel sublabels), with `--ink-faint: #a3a3a3` for eyebrows/hints. Net effect vs the prototype: progress/legend/ΔE text is slightly darker. This is an intentional `design.md` supersession, flagged for the parity review.
2. **Channel badge hues conflict between the two design docs.** Root `DESIGN.md` says `#B91C1C / #15803D / #1D4ED8`; the change's `design.md` and the orchestrator acceptance say `#dc2626 / #16a34a / #2563eb`. The change's `design.md` wins; `tokens.css` uses `#dc2626 / #16a34a / #2563eb` (also the prototype's values). Reported here rather than silently resolved.
3. **`--on-swatch-stage`.** `design.md`/`DESIGN.md` specify `#d4d4d4` for the swatch-card caption; the prototype uses `#a3a3a3`. Token follows `design.md` (`tokens.css:27`), a very slight lightening.
4. **Downsampling method.** The spec mandates area-average downsampling; the prototype used canvas `drawImage` bilinear smoothing. Cell colours for the same scene can therefore differ by a few RGB units even though the matching pipeline is identical. This is spec-driven and cannot be removed without violating `optical-mixing-pipeline` §"Area-average downsample".
5. **`sampleScenes` placement.** Task/target map mandates `src/engine/sampleScenes.ts`, so a scene *generator* lives under `engine/`. It imports no DOM/worker/UI modules; it uses the ambient `document` only when called. `settingsPopover.ts` imports it (plus `readImageElement`) to wire the sample chips. The computational `EngineClient` seam remains strict: no UI module imports matching/color modules.
6. **Store testability seam.** `createGridStore({ client, storage? })` accepts a `StorageLike` so the throwing-storage fallback is deterministic; production passes no `storage` and uses `globalThis.localStorage` inside `try/catch` with an always-on in-memory mirror.
7. **Source extraction bound.** `readImageElement` caps the longest edge at 512 px (aligned with the follow-up `WorkingBitmap` bound) before handing pixels to the area-average engine; the fingerprint is computed after downsampling, so results are stable.
8. **`safe-test` virtual-memory cap.** Under this host, `safe-test`'s default `ulimit -v 4194304` makes V8's WebAssembly guard reservation fail inside Vitest 5/Vite 8 (`RangeError: WebAssembly.instantiate(): Out of memory`). This is a *virtual address space* limit, not RAM (actual free RAM ≈ 9.5 GB). Verification used the tool's documented override: `SAFE_TEST_MAX_MEM_KB=67108864 safe-test …`. No test command or Vitest flag was substituted.
9. **jsdom canvas.** jsdom logs `HTMLCanvasElement's getContext() method … without installing @napi-rs/canvas`. No such package was added (unapproved dependency); canvas pixel drawing is therefore validated by code audit + browser capture, not jsdom.
10. **Mobile cell-size floor.** The fit algorithm keeps the prototype's `4–28px` cell range (prototype floor was `7px`). At `390px` wide, a 56-column grid needs ~5px cells to fit without horizontal clipping, so the floor was lowered to `4px`; desktop/tablet cell sizing is unchanged because the viewport-derived value is well above it. Labels switch to the 5-cell interval below 12px, so ticks remain legible.
11. **File line budgets.** Several modules exceed the handoff's target line budgets: `src/store/gridStore.ts` 264 vs 110, `src/ui/gridCanvas.ts` 386 vs 210 (≈373 before `PATCH-01`), `src/engine/matcher.ts` 227 vs 135, `src/types/pipeline.ts` 142 vs 85, `src/engine/palettes.ts` 103 vs 75. The overage is descriptive comments, explicit validation/normalisation, and the prototype's rendering branches; functionality and tests are correct, so the budgets are accepted rather than compressing readability.
12. **Type-scale source.** Root `DESIGN.md` lists a `17 / 13 / 12px` UI scale, while the authoritative change `design.md` specifies `16.8 / 12.5 / 11.5px`. `src/styles/main.css` uses the change `design.md` values (equivalent rem sizes: `1.05rem`, `0.78rem`, `0.72rem`); the root document is treated as supplemental.

---

## 8. Empirical Execution Logs (verbatim)

### 8.1 `SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm test -- --maxWorkers=1`

```text
[safe-test 00:30:27] Lock acquired (9643MB RAM free | limit: 65536MB). Executing: npm test -- --maxWorkers=1

> rgb-pencil@0.1.0 test
> vitest run --maxWorkers=1


 RUN  v5.1.2 /home/node/.local/share/opencode/worktree/b77075c9f77e5d74ec765af9d1584f0a3a83612c/gentle-gecko

Not implemented: HTMLCanvasElement's getContext() method: without installing the @napi-rs/canvas npm package
Not implemented: HTMLCanvasElement's getContext() method: without installing the @napi-rs/canvas npm package
Not implemented: HTMLCanvasElement's getContext() method: without installing the @napi-rs/canvas npm package

 Test Files  6 passed (6)
      Tests  60 passed (60)
   Start at  00:30:27
   Duration  6.48s (environment 83%, tests 14%, import 2%, transform 1%, worker 1%)

Environment  jsdom was created 6 times · 4.58s total, 83% of tracked time
             create it once per worker with pool: 'vmThreads' (keeps per-file isolation) or isolate: false (shares it across files)
             learn more: https://vitest.dev/guide/improving-performance#test-environments
```

### 8.2 `SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm run build`

```text
[safe-test 00:30:34] Lock acquired (9312MB RAM free | limit: 65536MB). Executing: npm run build

> rgb-pencil@0.1.0 build
> tsc --noEmit && vite build

vite v8.4.0 building client environment for production...
transforming...
✓ 19 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  7.27 kB │ gzip: 2.06 kB
dist/assets/index-tiAWIhMk.css   9.16 kB │ gzip: 2.52 kB
dist/assets/index-CS8SQOa4.js   21.75 kB │ gzip: 8.20 kB

✓ built in 87ms
```

### 8.3 Dependency tree (`npm ls --depth=0`)

```text
rgb-pencil@0.1.0
+-- jsdom@31.0.1
+-- typescript@5.9.3
+-- vite@8.4.0
`-- vitest@5.1.2
```

### 8.4 Dev server smoke

```text
VITE v8.4.0  ready in 249 ms
➜  Local:   http://localhost:5173/
GET /            -> 200
GET /src/main.ts -> 200 (transformed ES module graph)
```

---

## 9. Quick Re-Verification (60-second audit)

```bash
cd /home/node/.local/share/opencode/worktree/b77075c9f77e5d74ec765af9d1584f0a3a83612c/gentle-gecko
SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm test -- --maxWorkers=1   # expect: Test Files 6 passed, Tests 60 passed
SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm run build                # expect: 0 TS errors, "✓ built in ..."
npm run dev                                                          # expect: http://localhost:5173/
```

Narrow single-suite checks while iterating:

```bash
npx vitest run src/engine/__tests__/matcher.test.ts
npx vitest run src/store/__tests__/gridStore.test.ts
npx vitest run src/ui/__tests__/ui.test.ts
```

---

## 10. Visual Capture & Parity Results (orchestrator)

Captured 2026-11-27 with Playwright 1.65.1 (bundled Chromium, `--no-sandbox`), Vite dev server at `http://localhost:5173/`, and the prototype opened from `file://…/playgrounds/minimal_grid_playground.html`. Desktop viewport `1280×800`; mobile `390×844` with `isMobile`, `hasTouch`, DPR 2. Screenshots were inspected directly; pixel comparison used Pillow. No page errors or console errors were emitted in either pass.

### 10.1 Desktop `1280×800`, default load — PASS

- Canvas `876×660` (`cellSize 15`), grid `56 × 42`, footer `56 × 42 grid (7,056 stripes) · …`, progress `0 / 2352 done`.
- `#fafafa` stage, centered grid with crisp 1px lines and 5-cell reference lines, adaptive X/Y ticks, both floating pill groups, Settings closed, 256px white inspector with empty state and 5-state legend.
- Inter and JetBrains Mono both loaded; no layout shift or clipping.

### 10.2 Side-by-side parity vs approved prototype — PASS

| Pair (same viewport, Tree sample, defaults) | Mean absolute diff | Pixels >8/255 | Pixels >32/255 |
| :--- | ---: | ---: | ---: |
| Initial load, app vs prototype | **0.53/255** | 2.47% | 0.15% |
| Hovered `X21, Y11`, app vs prototype | **0.46/255** | 2.32% | 0.02% |

Strong differences are confined to font antialiasing on axis/top-bar text and a few cell-edge colours from area-average vs bilinear downsampling (§7.4). There is no visible difference in layout, colour hierarchy, pill chrome, grid geometry, axis labels, inspector, or legend at normal viewing distance: **no parity defect found**, and task 2.4 is complete.

### 10.3 Interaction run — PASS

| Check | Observed |
| :--- | :--- |
| Hover cell | `X21, Y11`, status `To Do`, right stripe `Solid Black`, `ΔE 9.8`, hint `Click cell to mark done`; cursor `crosshair`; ring visible; X/Y labels bold with neighbours suppressed |
| Click cell | `1 / 2352 done`, status `Completed`, hint `Click cell to undo` |
| Drag 5 cells | `6 / 2352 done` in one gesture |
| Persistence | `localStorage` key `rgb-pencil:v1:e9b6422d`; reload restored `6 / 2352 done` |
| Settings | Closed on load, opens on trigger, closes on outside click |
| Grid width 56→96 | `96 × 72 grid (20,736 stripes)`, progress `6 / 6912 done` (in-bounds cells retained) |
| Sample switch to Sunset | Grid recomputed at the active width |
| Stripes toggle | Three vertical RGB stripes per cell; completed cells remain desaturated |
| Non-image drop (`.txt`) | Grid and progress unchanged |
| Image drop (200×100 PNG, width 96) | Aspect-preserved `96 × 48`, progress reset to `0 / 4608 done` |

### 10.4 Mobile `390×844` — PASS

- Canvas `316×240` (`cellSize 5`) starting at `y=206`; inspector begins at `y=557`, below the stage bottom — **zero overlap**.
- Top-bar controls measured `Upload Image 104×44`, `Reset 55×44` — both meet the 44px target height.
- Two-row pill layout keeps the grid visible; 5-cell axis labels remain legible.

### 10.5 Residual manual review

- **Real-device touch**: A tap now toggles completion **and retains the inspected cell** — after the browser’s `pointerup → pointerout → pointerleave` sequence the hover ring and sidebar readout (`X<col>, Y<row>`, stripes, ΔE) remain visible; regression-covered in `ui.test.ts` › "keeps the sidebar readout visible after a touch tap, then clears on mouse leave" (`PATCH-01`). Mouse/pen leave still clears normally. Re-confirm on real hardware; the next change intentionally replaces tap-toggle with inspect-only + `Mark Done`.
- **Print scale / Safari storage eviction**: not applicable yet (Changes 2 and 3).
- **Google Fonts availability**: shared network dependency with the prototype; capture succeeded with fonts loaded.
- **`sampleScenes.ts` ambient `document`** (§7.5): a WARNING, not a blocker — the target context map requires that path, and the computational engine modules stay DOM-free.

