# Verification — `worker-pipeline-and-pdf-export`

## 1. Executive Summary & Environment

| Field | Value |
| :--- | :--- |
| Change | `worker-pipeline-and-pdf-export` (OpenSpec schema `tdd-rnd`, 28 tasks) |
| Status | **IMPLEMENTED — all automated gates PASS. Orchestrator browser capture completed; one real UI defect found and repaired (`PATCH-01`), plus verification follow-ups (`PATCH-02`). Physical print scale and real-device touch remain manual (§12)** |
| Date | 2026-11-27 |
| Branch | `feat/multi-20261126-2351` (no commits created by this agent) |
| Node / npm | `v22.23.2` / `10.9.8` |
| OS / arch | Linux container (x86_64), single-worker test runs |
| App runner | Vite `8.4.0`; production build emits `dist/assets/pipeline.worker-*.js` |
| Test runner | Vitest `5.1.2` + jsdom `31.0.1`, `--maxWorkers=1` |
| TypeScript | `5.9.3`, `"strict": true`, `noUnusedLocals`, `noUnusedParameters`, `tsc --noEmit` clean |
| Runtime dependencies added | `pdf-lib@1.17.1` (MIT), `culori@4.0.2` (MIT) — agreed set only |

`npm test`: **11 files / 145 tests passed**. `npm run build`: **347 modules transformed, 0 TypeScript errors, separate 46.50 kB worker chunk** (verbatim logs in §9).

### TDD evidence (red before green)

Group 1 tests were written first and run before the new modules existed:

```text
FAIL src/engine/__tests__/engine.test.ts
Error: Failed to resolve import "../pipeline" from "src/engine/__tests__/engine.test.ts". Does the file exist?
FAIL src/engine/__tests__/pipelineClient.test.ts
Error: Failed to resolve import "../pipelineClient" from "src/engine/__tests__/pipelineClient.test.ts". Does the file exist?
FAIL src/engine/__tests__/guideBuilder.test.ts
Error: Failed to resolve import "../guideBuilder.ts?raw" from "src/engine/__tests__/guideBuilder.test.ts". Does the file exist?
FAIL src/engine/__tests__/pdfExporter.test.ts
Error: Failed to resolve import "../pdfExporter.ts?raw" from "src/engine/__tests__/pdfExporter.test.ts". Does the file exist?
Test Files  4 failed (4)
     Tests  no tests
```

A fifth red file (`src/ui/__tests__/touchAndExport.test.ts`) also failed while the store/UI still exposed the Change 1 object-cell grid and touch-toggle behaviour. Implementation then proceeded types → LUT → pipeline → worker/client → store → guide builder → exporter → UI, with the matching narrow suite green after each task group.

---

## 2. Requirement Adherence Audit Matrix

Status legend: **PASS** = asserted by an automated test; **PASS (audit)** = proven by static inspection of the cited implementation because jsdom cannot observe worker scheduling or print geometry; **DEFERRED** = needs the browser/print capture recorded in §12 or the manual checks in §11.

### 2.1 `worker-pipeline`

| Requirement & Scenario | Verification method | Status |
| :--- | :--- | :--- |
| Shared serialisable contracts · `MatchedGrid` survives `structuredClone` | `engine.test.ts` › "pipeline data contracts survives a structured clone with every typed array intact" (values compared element-wise; jsdom returns cross-realm typed arrays, so `Object.prototype.toString` confirms `Uint8Array`/`Float32Array`/`Uint8ClampedArray`) | **PASS** |
| Shared serialisable contracts · flat arrays are row-major | `engine.test.ts` › "returns flat row-major typed arrays of the documented lengths"; `matcher.ts` writes `row * cols + col`, `guideBuilder`/UI read the same index | **PASS** |
| Off-main-thread worker · slider scrubbing does not block pointer handling | `pipelineClient.test.ts` proves worker dispatch/coalescing; pointer handlers in `gridCanvas.ts` never await. Actual frame smoothness is visual → §11 | **PASS (audit)** |
| Off-main-thread worker · worker unavailable falls back to synchronous execution | `pipelineClient.test.ts` › "runs synchronously when worker construction throws" and "runs synchronously when the platform has no Worker" | **PASS** |
| Latest-job-wins · stale response discarded | `pipelineClient.test.ts` › "discards a stale response that arrives after a newer request was issued" (`StalePipelineResultError`) | **PASS** |
| Latest-job-wins · burst collapses to in-flight plus latest | `pipelineClient.test.ts` › "collapses 30 rapid requests into one in-flight plus the latest pending" (2 posts total; second carries request 30) | **PASS** |
| Zero-copy results · buffers transferred | `engine.test.ts` › "lists every result buffer for zero-copy transfer"; `pipelineClient.test.ts` › "posts a success response with all five result buffers transferred" (worker adapter post has 5-buffer transfer list) | **PASS** |
| Zero-copy results · large photo does not inflate per-run cost | `engine.test.ts` › `prepareWorkingBitmap` 4032×3024 → 512×384; `gridStore.test.ts` › "prepares the working bitmap once per image, bounded to 512 px" (same bounded request on later runs) | **PASS** |
| Source fingerprint · contrast change preserves progress key | `engine.test.ts` › "keeps sourceHash stable across contrast, dither, and palette changes" | **PASS** |
| Source fingerprint · width change changes progress key | `engine.test.ts` › "changes sourceHash when the grid width changes" | **PASS** |
| Failures never corrupt grid · worker crash keeps previous grid | `pipelineClient.test.ts` › "rejects on a worker error… and recreates the worker"; `gridStore.test.ts` › "keeps the last good grid and surfaces an error when a run fails"; `touchAndExport.test.ts` › "Pipeline error line shows a dismissible error on failure…" renders `[data-ui="pipeline-error"]` with the message, keeps the old grid/progress, and dismisses | **PASS (user-visible)** |
| Failures never corrupt grid · out-of-range width rejected | `engine.test.ts` › four width rejections + boundary acceptance; `pipelineClient.test.ts` › "posts a typed error response for an out-of-range width" | **PASS** |
| 125-combo LUT · complete and unique | `engine.test.ts`/`colorMath.test.ts` `it.each` over all 3 palettes (125 entries, 125 unique keys) | **PASS** |
| 125-combo LUT · hand-rolled Lab agrees with culori | `engine.test.ts` › "hand-rolled Lab agrees with culori within 0.5 for %s" (max observed component delta 0.005; `entry.lab` is culori-built from the same exact linear input) | **PASS** |

### 2.2 `guide-builder`

| Requirement & Scenario | Verification method | Status |
| :--- | :--- | :--- |
| Per-stripe-column instructions · 168 for 56×42 and `k = 3c + ch` | `guideBuilder.test.ts` › "returns exactly 3 x cols instructions ordered by k = 3c + ch" (`k=31` → column 10, channel G) | **PASS** |
| Per-stripe-column instructions · channel read from right array | `guideBuilder.test.ts` › "reads each channel from the matching flat array" | **PASS** |
| Complete/ordered/maximal runs · reconstruct original column | `guideBuilder.test.ts` › "reconstructs every original column from complete, ordered, maximal runs" (randomised 23×37 grid, gap/overlap/maximality checked) | **PASS** |
| Complete/ordered/maximal runs · uniform column yields one run | `guideBuilder.test.ts` › "emits one run for a uniform stripe column" | **PASS** |
| Complete/ordered/maximal runs · adjacent runs always differ | Same reconstruction test asserts neighbouring states differ | **PASS** |
| White-paper runs included | `guideBuilder.test.ts` › "includes white-paper runs" and summarise test counts state 0 | **PASS** |
| Paginated tiles · every cell covered | `guideBuilder.test.ts` › "covers every cell with tiles no larger than the tile size" | **PASS** |
| Paginated tiles · adjacent tiles overlap exactly one line | `guideBuilder.test.ts` › "overlaps horizontally and vertically adjacent tiles by exactly one line" | **PASS** |
| Paginated tiles · grid smaller than one tile → single tile | `guideBuilder.test.ts` › "returns a single tile when the grid fits" | **PASS** |
| Paginated tiles · degenerate tile size → `RangeError` | `guideBuilder.test.ts` › "rejects a degenerate tile size …" (1×29, 20×1, 0×29, 20×−3) | **PASS** |
| State summary · counts sum to 7,056 | `guideBuilder.test.ts` › "counts every stripe segment and sums to 3 x cols x rows" | **PASS** |
| Pure/deterministic · repeated calls identical | `guideBuilder.test.ts` › "is deterministic for identical input"; source-import purity test rejects DOM/React/worker/pdf-lib imports | **PASS** |

### 2.3 `pdf-export`

| Requirement & Scenario | Verification method | Status |
| :--- | :--- | :--- |
| Export action · disabled before a grid exists | `touchAndExport.test.ts` › "is disabled before any grid exists" | **PASS** |
| Export action · disabled while the grid recomputes | `touchAndExport.test.ts` › "is disabled and captions the readout while a run is pending" | **PASS** |
| Export action · download filename | `touchAndExport.test.ts` › "shows a busy label while exporting and downloads the named PDF" (`rgb-pencil-guide-56x42.pdf`); `guideFilename` asserted in `pdfExporter.test.ts` | **PASS** |
| Export options · defaults (A4, no template, 6 mm) | `touchAndExport.test.ts` › "defaults to A4, no template, and a 6 mm cell"; changed values written back | **PASS** |
| Valid multi-page PDF · `%PDF-` and reload | `pdfExporter.test.ts` › "returns a valid multi-page PDF beginning with %PDF-" | **PASS** |
| Valid multi-page PDF · stable page order | `pdfExporter.test.ts` › "writes pages in legend, chart, checklist, template order" | **PASS** |
| Valid multi-page PDF · template omitted by default | `pdfExporter.test.ts` › "omits template pages by default" | **PASS** |
| Legend page · all five states and counts | `pdfExporter.test.ts` › "lists all five states with their summarised counts on the legend page" | **PASS** |
| Vector symbols · standard fonts only | `pdfExporter.test.ts` › "requires vector symbols because standard fonts cannot encode the glyphs" (`encodeText('◐'/'●'/'□')` throws; generation still succeeds) | **PASS** |
| Tiled chart · absolute 1-based indices | `pdfExporter.test.ts` › "labels chart tiles with absolute 1-based indices" (second tile reads `Columns 21–41`; no `Columns 0`) | **PASS** |
| Tiled chart · no tile overflows margins | `pdfExporter.test.ts` A4/Letter margin arithmetic against `chartLayout`; drawing uses the same origin/cell size | **PASS** |
| Checklist · exactly 168 entries in order | `pdfExporter.test.ts` › "renders exactly 168 checklist entries for a 56 x 42 grid in stripe-column order" | **PASS** |
| Checklist · entries not split across pages | `pdfExporter.test.ts` › "keeps each checklist entry whole on one page when it fits" (per page, one run line per title; 168 unique titles) | **PASS** |
| Checklist · oversize entry continues with `(cont.)` | `pdfExporter.test.ts` › "continues an oversize entry with (cont.) without losing or duplicating runs" (3×288 grid; drawn run count equals `buildColumnInstructions` total) | **PASS** |
| Template · cell width matches configuration | `pdfExporter.test.ts` › `mmToPt(6) ≈ 17.01 pt` in the template test | **PASS** |
| Template · large grid spans multiple pages with marks/labels | Same test: 96×72 at 6 mm yields >1 template page, each with `Faint Template`, `10 mm`, `Print at 100%`, tile label | **PASS** |
| Failure handling · state intact | `touchAndExport.test.ts` › "shows one dismissible inline error on failure without touching the grid" (grid identity, completed set, progress unchanged; button re-enabled; error dismisses) | **PASS** |

### 2.4 `touch-interaction`

| Requirement & Scenario | Verification method | Status |
| :--- | :--- | :--- |
| Tap inspects only · single tap shows `X11, Y6`, `To Do`, count unchanged | `touchAndExport.test.ts` › "inspects without completing on tap and never paints on touch drag" | **PASS** |
| Tap inspects only · touch drag moves inspection without painting | Same test (down + two moves, completed count stays 0) | **PASS** |
| Mark Done / Undo · completes, label flips, counter +1 | `touchAndExport.test.ts` › "toggles the inspected cell with Mark Done / Undo and updates progress" (`1 / 2352 done`, then back to 0) | **PASS** |
| Mark Done / Undo · absent for mouse use | `touchAndExport.test.ts` › "hides the Mark Done button after a mouse interaction…" now asserts both `hidden` and inline `display: none` (PATCH-01) | **PASS** |
| Mark Done / Undo · absent without an inspected cell | Same test: `hidden` + `display: none` initially before any hover; ≥44×44 and inside the inspector asserted in the first touch test | **PASS** |
| No double-tap/zoom · double tap changes nothing | `touchAndExport.test.ts` › "changes nothing on a double-tap"; `canvas.style.touchAction === 'none'` asserted | **PASS** |
| Mouse/pen unchanged | `touchAndExport.test.ts` › "keeps mouse click, drag-paint, and re-click undo unchanged"; `ui.test.ts` hover/leave tests | **PASS** |

---

## 3. Behavioural Acceptance Checklist

| Acceptance item (orchestrator wording) | Status | Evidence |
| :--- | :--- | :--- |
| `runPipeline` pure; downsample/contrast/match/dither; `sourceHash`; width 16–96; `PIPELINE_VERSION` | **PASS** | `src/engine/pipeline.ts`; `engine.test.ts` suite; `engineClient.test.ts` parity |
| Local client delegates with no result change | **PASS** | `engineClient.test.ts` › "resolves the same MatchedGrid as a direct engine call" |
| `prepareWorkingBitmap`: longest edge ≤512, aspect kept, once per image | **PASS** | `workingBitmap.ts`; engine + store tests |
| Thin module worker with transfer list | **PASS** | `src/workers/pipeline.worker.ts`; adapter tests; Vite emits separate chunk (§9) |
| Client: monotonic `jobId`, in-flight + latest pending, stale drop, error recovery/recreate, sync fallback, image-swap invalidation | **PASS** | `pipelineClient.test.ts` (10 tests) |
| Flat `MatchedGrid` contract; store/UI/tests migrated | **PASS** | `types/pipeline.ts`; `matcher.ts`; canvas/inspector read `ri/gi/bi/target` |
| `sourceHash` invariants | **PASS** | engine tests (contrast/dither/palette invariant, width sensitive) |
| Store status/error/last-grid/`latestJobId`/`lastPointerType` | **PASS** | `gridStore.test.ts` additions; `touchAndExport.test.ts` › "Pipeline error line …" proves the error is user-visible and dismissible |
| Guide builder: 3×cols, `k=3c+ch`, maximal runs incl. white, pagination, `RangeError`, totals | **PASS** | `guideBuilder.test.ts` |
| PDF geometry, order, checklist, `(cont.)`, template, `%PDF-`, yield, Blob revoke, filename | **PASS** | `pdfExporter.test.ts` (15) + `touchAndExport.test.ts` download test |
| UI: Export PDF states, 3 Settings rows, touch inspect-only, `touch-action:none`, no double-tap, Mark Done ≥44×44, `Updating…` | **PASS** | `touchAndExport.test.ts`; `ui.test.ts` regressions |
| Change 1 surfaces keep working (visuals, persistence, samples, upload/drop, settings) | **PASS** | All 60 prior tests still present (5 extra store tests added); full suite green |

---

## 4. Resolved Assumptions & Empirical Proof

| Assumption (`research.md`) | Proof | Result |
| :--- | :--- | :--- |
| Standard fonts cannot encode `□ ● ◐ ◑ ■`; vector shapes required | `pdfExporter.test.ts` embeds Helvetica and asserts `encodeText` throws for all three sampled glyphs; a full PDF still generates | **Confirmed** |
| Worker bundling under Vitest: tests import engine functions, not a real worker | Tests inject a fake worker; `npm run build` emits `pipeline.worker-*.js` as its own chunk | **Confirmed** |
| A 96-wide run finishes in well under ~100 ms | Measured in Node/Vitest: **96×72 → 30.1 ms** (soft budget only) | **Confirmed** |
| Print scale is 1:1 at “actual size” | `mmToPt(6) = 17.008 pt`; PDF generation is DTP-point based. Physical ruler check is manual → §11 | **Deferred (manual)** |
| `sourceHash` fingerprint survives moving work off-thread | Hash computed inside `runPipeline`, returned in the transferred grid; engine + worker-adapter tests | **Confirmed** |
| Open Questions 1–3 defaults (inspect-only touch, PDF in MVP, vanilla TS) | Implemented and covered by tests | **Confirmed as chosen defaults** |
| `culori@4.0.2` offers `lab65` conversion | Installed 4.0.2; converter cross-check within 0.005 on exact linear input | **Confirmed** |
| `pdf-lib@1.17.1` is browser/Node usable and supports standard fonts | Build + jsdom tests generate, reload, and parse real PDFs | **Confirmed** |

---

## 5. Nomenclature & Code Symbol Audit

| Glossary term | Final code symbol(s) | Location | Verdict |
| :--- | :--- | :--- | :--- |
| Stripe column | `ColumnInstruction.stripeColumn`, `k = 3c + ch` | `src/engine/guideBuilder.ts`, `src/types/pipeline.ts` | Match |
| Run (RLE run) | `RleRun { state, startRow, length }` | `src/types/pipeline.ts` | Match |
| Column instruction | `ColumnInstruction`, `buildColumnInstructions` | `src/engine/guideBuilder.ts` | Match |
| Chart tile | `ChartTile`, `paginateChart` | `src/types/pipeline.ts`, `src/engine/guideBuilder.ts` | Match |
| Symbol chart | `drawChartPage`, "Symbol Chart" headers | `src/engine/pdfExporter.ts` | Match |
| Faint template | `drawTemplatePage`, "Faint Template" headers | `src/engine/pdfExporter.ts` | Match |
| Pipeline run | `runPipeline`, `PipelineRequest`/`PipelineResult` | `src/engine/pipeline.ts` | Match |
| Job id | `PipelineJobRequest.jobId`, client `latestJobId` | `src/types/pipeline.ts`, `src/engine/pipelineClient.ts` | Match |
| Pencil palette | `PencilPalette` (unchanged data shape) | `src/types/pipeline.ts` | Match |
| ΔE | `MatchedGrid.deltaE` (`Float32Array`), `ΔE` readout | `src/types/pipeline.ts`, `src/ui/inspectorSidebar.ts` | Match |
| Working bitmap | `WorkingBitmap`, `prepareWorkingBitmap`, `MAX_WORKING_EDGE` | `src/engine/workingBitmap.ts` | Match |
| Pipeline version | `PIPELINE_VERSION` (integer `1`) | `src/engine/pipeline.ts` | Match (Change 3 contract) |

Code identifiers introduced by this change use the glossary vocabulary; no competing names (`columnGroup`, `jobID`, `tilePage`, etc.) were introduced.

---

## 6. Landed Tech Footprint & Patterns

| Pattern / package | Implementation | Verified by |
| :--- | :--- | :--- |
| Pure `runPipeline` + thin adapter | `src/engine/pipeline.ts`, `src/workers/pipeline.worker.ts`, `src/engine/pipelineClient.ts` | engine/client suites; worker chunk in build |
| Latest-job-wins coalescing | `createWorkerEngineClient` in-flight + pending queues | `pipelineClient.test.ts` |
| Typed-array transfer | `gridTransferables`, `postMessage(response, transfer)` | adapter transfer-list test |
| Bounded working bitmap | `prepareWorkingBitmap` (area-average, 512 px) | engine + store tests |
| Flat typed-array grid | `MatchedGrid.ri/gi/bi/deltaE/target` | engine/canvas/inspector/store |
| `culori` LUT build only | `srgbToLabCulori`, `buildComboLUT`, `buildLabTable` in `src/engine/colorMath.ts`; matcher scans `Float32Array` only | culori cross-check tests |
| RLE + overlapping pagination | `src/engine/guideBuilder.ts` | `guideBuilder.test.ts` |
| Vector PDF glyphs | `drawSymbol` (rectangles/circles, white overlays) | PDF tests + glyph-encoding test |
| Async per-page yield | `yieldToEventLoop()` between pages in `exportGuidePdf` | code audit; export tests complete without blocking timeout after page work |
| DOM download at UI boundary | `downloadPdf` in `src/ui/topBar.ts`; exporter stays DOM-free | `touchAndExport.test.ts` download test; exporter source purity test |
| Dynamic control mount (no shell markup edits) | Export button, error line, Settings rows, Mark Done created with `textContent` in UI modules | UI tests bind to `data-ui` nodes |

---

## 7. Invalidated Hypotheses & Mid-Build Adjustments

| Original belief | What proved wrong | Final resolution |
| :--- | :--- | :--- |
| `culori` ships TypeScript declarations | Package 4.0.2 has no `types` field and no `.d.ts` | Added minimal ambient `src/types/culori.d.ts` (no new dependency such as `@types/culori`) |
| Comparing hand-rolled Lab to `culori` on rounded 8-bit sRGB stays within 0.5 for every entry | One saturated combo reached 0.506 because `culori` reconverts the rounded 8-bit sRGB while the hand-rolled function used the unrounded linear value | Cross-check both implementations on the exact **linear** colour (`culori` `lrgb` mode; max Δ 0.005); `entry.lab` is likewise built from exact linear input. Still satisfies “within 0.5” with margin |
| `structuredClone` returns same-realm typed arrays in jsdom | It returns cross-realm views, so `toBeInstanceOf` fails despite equal values | Element-wise comparison + `Object.prototype.toString` type checks |
| `pdf-lib` content streams stay uncompressed enough to read text directly | Streams are Flate-compressed and text may be literal or hex-encoded | Test helper decompresses with `DecompressionStream` and decodes hex `Tj` strings (no new dependency) |
| `src/types/pipeline.ts` can stay inside 85 lines | Change 1 already had 142 lines; the flat grid + RLE + export contracts add ~77 | Accepted overage (same policy as Change 1 §7.11); documented rather than compressing readability |
| `guideBuilder.ts` ≤90 and `pdfExporter.ts` ≤200 lines | Pure builder is 120 lines; the four page types (legend, chart, checklist, template) total 664 lines | Accepted overage; split only if a future change needs reuse. Functionality is fully tested |
| Every UI element can be bound from `index.html` markup | Change 2’s Export/error/option/Mark-Done controls are new; handoff Target Context Map did not list `index.html` | Controls are created dynamically with `data-ui` hooks and `textContent`, keeping the shell file untouched |
| `matcher.ts` may stay unmodified | The flat `MatchedGrid` and precomputed Lab table are produced in the matcher | `src/engine/matcher.ts` updated (required by the flat contract); this is the one file used beyond the handoff table’s “modified” list, recorded here |
| “Contracts contain no functions” can be checked module-wide | Change 1 already placed the pure `cellKey`/`parseCellKey` helpers in `src/types/pipeline.ts` | All new contract shapes are function-free data; the two pre-existing helpers are not fields of any contract and were left to avoid touching unrelated imports. No new functions were added to serialisable shapes |
| Setting the `hidden` attribute is enough to hide a `.btn` | The author rule `.btn { display: inline-flex }` overrides the UA `[hidden]` rule; Chromium showed the button at `215×44` while `hidden === true` | `PATCH-01`: inline `display: none` in `inspectorSidebar.ts` plus a global `[hidden] { display: none !important; }` rule; tests assert the display value |
| Store `status: 'error'` is enough to satisfy the failure-surfacing requirement | No UI consumed `status`/`error`; the user never saw a failure state | `PATCH-02`: `[data-ui="pipeline-error"]` quiet dismissible line in `topBar.ts`, covered by `touchAndExport.test.ts` |
| Placing Mark Done above the meta footer is reachable on mobile | At 390×844 the inspector scrolls and the button could sit off-screen | `PATCH-02`: moved directly below the coordinate/status header, above the swatch card |
| The exporter can trust UI-side template clamping | Direct callers could request 20 mm or 1 mm | `PATCH-02`: `exportGuidePdf` clamps to 4–12 mm, with a dedicated test |

### 7.1 Orchestrator-approved scope exception: `src/styles/main.css`

`src/styles/main.css` was **not in this change's original Target Context Map**. The orchestrator explicitly approved adding exactly two rules:

- `[hidden] { display: none !important; }` — fixes the real Chromium defect where `.btn { display: inline-flex }` kept a `hidden` control (`Mark Done / Undo`) rendered at `215×44`.
- `.btn:disabled { opacity: 0.45; cursor: not-allowed; }` — restores the disabled-state treatment required by `design.md` for the Export PDF button.

No other style, token, or layout rule was changed.

---

## 8. Implementation-Discovered Deferrals

- **PDF progress bar / cancel** — not specified; the button is disabled and shows `Exporting…` while the async export yields per page.
- **Custom page sizes** — only A4 and US Letter, per spec.
- **Pixel-level visual regressions** — jsdom has no canvas raster; the browser pass recorded in §12 covers the rendered layout.
- **Real-device touch and physical print scale** — manual by nature; §11.

---

## 9. Empirical Execution Logs & Evidence

### 9.1 Final full suite (`SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm test -- --maxWorkers=1`)

```text
[safe-test 01:32:06] Lock acquired (10018MB RAM free | limit: 65536MB). Executing: npm test -- --maxWorkers=1

> rgb-pencil@0.1.0 test
> vitest run --maxWorkers=1


 RUN  v5.1.2 /home/node/.local/share/opencode/worktree/b77075c9f77e5d74ec765af9d1584f0a3a83612c/gentle-gecko

Not implemented: HTMLCanvasElement's getContext() method: without installing the @napi-rs/canvas npm package
[... repeated 11 times, one per jsdom file, expected ...]

 Test Files  11 passed (11)
      Tests  145 passed (145)
   Start at  01:32:07
   Duration  29.71s (tests 69%, environment 26%, import 4%)

Environment  jsdom was created 11 times · 7.46s total, 27% of tracked time
```

Per-file counts: `colorMath 10`, `contrast 5`, `engine 24`, `engineClient 3`, `guideBuilder 16`, `matcher 15`, `pdfExporter 16`, `pipelineClient 10`, `gridStore 16`, `touchAndExport 14`, `ui 16` → **145**.

### 9.2 Final production build (`SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm run build`)

```text
> rgb-pencil@0.1.0 build
> tsc --noEmit && vite build

vite v8.4.0 building client environment for production...
transforming...
✓ 347 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                            7.27 kB │ gzip:   2.06 kB
dist/assets/pipeline.worker-C01QtuUB.js   46.50 kB
dist/assets/index-CZMQp1GQ.css             9.23 kB │ gzip:   2.57 kB
dist/assets/index-LhVF7tuh.js            500.68 kB │ gzip: 203.96 kB

[plugin builtin:vite-reporter]
(!) Some chunks are larger than 500 kB after minification. [...]
✓ built in 266ms
```

The separate `pipeline.worker-*.js` chunk is the acceptance evidence that the module worker is bundled by Vite rather than inlined or dropped.

### 9.3 Dependency tree (`npm ls --depth=0`)

```text
rgb-pencil@0.1.0
+-- culori@4.0.2
+-- jsdom@31.0.1
+-- pdf-lib@1.17.1
+-- typescript@5.9.3
+-- vite@8.4.0
`-- vitest@5.1.2
```

### 9.4 Timing, counts and invariants

| Metric | Before Change 2 | After Change 2 | Delta / observation |
| :--- | ---: | ---: | :--- |
| Test files | 6 | 11 | +5 (engine, pipelineClient, guideBuilder, pdfExporter, touchAndExport) |
| Tests | 60 | 145 | +85: +80 new-file tests, +5 new store tests; **no prior test deleted** (touch-toggle assertions updated because this change intentionally supersedes that behaviour) |
| LUT entries per palette | 125 | 125 | unchanged, all three presets |
| Stripe instructions / segments for 56×42 | 168 / 7,056 | 168 / 7,056 | `guideBuilder.test.ts` |
| Checklist entries for 56×42 | n/a (not built) | 168 | PDF text extraction |
| `runPipeline` 96×72 | n/a | **30.1 ms** | Node/Vitest measurement, soft budget only |
| Production bundle | 19 modules | 347 modules | pdf-lib/culori + new modules; worker separate |
| Completed cells / grid state on export failure | n/a | unchanged | UI test asserts identical grid reference, completed set, progress |

Data-loss check: no grid, cell, palette, or sample data was removed; the flat-array migration preserves every per-cell value (all matcher/store/UI tests and `structuredClone` checks pass).

---

## 10. Quick Re-Verification (60-Second Audit)

```bash
cd /home/node/.local/share/opencode/worktree/b77075c9f77e5d74ec765af9d1584f0a3a83612c/gentle-gecko
SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm test -- --maxWorkers=1   # expect: Test Files 11 passed, Tests 145 passed
SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm run build                # expect: 0 TS errors, separate pipeline.worker-*.js chunk
```

Narrow checks while iterating:

```bash
npx vitest run src/engine/__tests__/engine.test.ts
npx vitest run src/engine/__tests__/pipelineClient.test.ts
npx vitest run src/engine/__tests__/guideBuilder.test.ts
npx vitest run src/engine/__tests__/pdfExporter.test.ts
npx vitest run src/store/__tests__/gridStore.test.ts
npx vitest run src/ui/__tests__/touchAndExport.test.ts
```

---

## 11. Manual & Print Checks Remaining

- **Physical print scale** — print a template page at 100% / Actual size and measure the 10 mm calibration bar with a ruler; expected 10 mm ±1 mm. Not performed by this agent.
- **Real-device touch** — confirm tap/drag pinch-zoom suppression on physical iOS/Android hardware. Emulated touch was exercised by the orchestrator; hardware remains a manual review item.
- **Safari-specific worker/Blob behaviour** — not exercised; Chromium was the browser under test.

---

## 12. Orchestrator Visual & Browser Capture

Browser results supplied by the independent orchestrator run (Chromium, Playwright, `--no-sandbox`). These are recorded as observed; this agent re-ran the automated suites and fixed the one defect they found (§12.1).

### 12.1 Defect found and repaired

- **C1 (CRITICAL)**: after a mouse hover at 1280×800 the inspector was visible and the `Mark Done` button reported `hidden: true`, but computed `display: flex` and occupied `215×44` at `(1045, 452)`. The author rule `.btn { display: inline-flex }` overrode the UA `[hidden]` rule.
- Fix: `PATCH-01` (see `patch.md`) sets inline `display: none` whenever the button is hidden, keeps the `hidden` attribute, and adds the global `[hidden] { display: none !important; }` rule. `touchAndExport.test.ts` now asserts both `hidden` and the inline display for mouse/no-inspection and touch states.
- After the fix, automated checks confirm `button.hidden === true` and `button.style.display === 'none'` for mouse and no-inspection states, and a non-`none` display after a touch tap. Final Chromium confirmation of the repaired computed style is the one remaining browser re-check.
- **Secondary**: `PIPELINE_VERSION` was changed from `'1.0.0'` to the integer `1` required by `project-persistence/architecture.md` §11; `engine.test.ts` now asserts an integer. The PDF legend therefore reads `Pipeline v1`.

### 12.2 Desktop 1280×800 — PASS

- The grid loaded through the module worker (`/src/workers/pipeline.worker.ts?...type=module`).
- `Export PDF` was enabled with a grid present; no console or page errors were emitted.

### 12.3 Export PDF, A4 defaults — PASS

- Downloaded `rgb-pencil-guide-56x42.pdf` (14 pages), page size A4 `595.28×841.89` pt.
- Page order: legend (page 1) → 6 symbol-chart tiles → 7 checklist pages containing 168 entries → no template pages.
- Legend per-state counts: `212 / 826 / 57 / 57 / 5904`, summing to `7056`.

### 12.4 Export PDF, US Letter + faint template — PASS

- 18 pages, page size Letter `612×792` pt.
- 6 chart pages + 7 checklist pages + 4 template pages.
- Every template page showed the `10 mm` calibration text and the 100%/actual-size scale note.

### 12.5 Worker fallback — PASS

- With `window.Worker` undefined, the grid still rendered at `56×42` (canvas `876×660`) and no errors were reported.

### 12.6 Mobile 390×844 touch — PASS

- Canvas `touch-action: none`.
- Tap inspected only: progress stayed `0`, inspector showed `X11, Y11`, and the `Mark Done` button measured `358×44` (height ≥ 44 px).
- Pressing `Mark Done` produced `1 / 2352 done`, label `Undo`, status `Completed`.
- A double-tap left progress unchanged.
- Mouse movement switches the hint back to the click wording; after `PATCH-01` the button is hidden for mouse input.
- The earlier mobile finding that `Mark Done` could require scrolling into view is **fixed** by `PATCH-02`: the button now sits immediately below the coordinate/status header, above the swatch card.
- **Known limitation, inherited; not fixed here:** when the active inspector appears, the stage/canvas shifts by approximately `40 px` (Change 1 mobile layout), so a same-point second tap can inspect a different cell. Completion remains unchanged (touch never paints), and the selected cell is always the inspector’s current coordinate.
- Layout: the inspector sits below the stage with no overlap (no exact viewport-relative y value is asserted here; it varies with scroll and viewport).

### 12.7 Remaining manual review

Physical 10 mm print measurement, real-device touch, and Safari worker/Blob behaviour (see §11).
