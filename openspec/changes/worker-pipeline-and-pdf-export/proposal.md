## Why

The `design-language-and-ui-ux` change builds the interactive grid on a synchronous main-thread engine and explicitly defers the Web Worker, the printable PDF, and the column-by-column RLE checklist (see `research.md`, "Prior change"). That leaves two gaps: slider scrubbing on a `96 × 72` grid (~864k ΔE checks) can stall pointer hover and drag-painting, and an artist still cannot take the guide away from the screen to draw on paper, which is the whole point of the tool. The finalized implementation plan assigns both to this change, so it is the right time to specify them against the contracts the UI change already fixed.

## What Changes

- Move the match + Floyd–Steinberg linear-RGB pipeline run into a module Web Worker (`src/workers/pipeline.worker.ts`) behind a typed request/response client with **latest-job-wins** semantics, returning the `MatchedGrid` as transferred typed arrays.
- Add the shared data contracts in `src/types/pipeline.ts` (`ShadingStateId`, `PencilPalette`, `ComboLUTEntry`, `MatchedCell`, `MatchedGrid`, `ColumnInstruction`) as plain serialisable values, so the worker, the exporter, and the future Phase 2 calibration all share one shape.
- Build the RLE guide builder (`src/engine/guideBuilder.ts`): turns a `MatchedGrid` into per-**stripe column** `ColumnInstruction`s (`3 × cols` of them) and paginates the symbol chart into overlapping **chart tiles**.
- Build the printable PDF exporter (`src/engine/pdfExporter.ts`, `pdf-lib`): legend page, tiled symbol charts with vector-drawn state glyphs, column RLE checklist, and an optional true-to-scale **faint template**, in A4 or US Letter. Reachable from one **Export PDF** action in the top-right pill.
- Resolve the plan's mobile Open Question: on touch, tapping a cell **inspects** it (no completion); completion is an explicit **Mark Done / Undo** button in the bottom inspector. No double-tap gesture.
- Use `culori` only to build the 125-entry LUT and to cross-check our maths in tests; the per-pixel loop stays on typed arrays (resolves the plan vs. prior-change conflict recorded under "Superseded claims").
- **Not in this change**: Phase 2 pencil calibration, the hover pop-up, and a Distance-blur view mode (see "Raised but not acted on").

## Capabilities

### New Capabilities
- `worker-pipeline`: Off-main-thread matching with job-id staleness handling, transferable typed-array results, error propagation, and the shared `src/types/pipeline.ts` contracts.
- `guide-builder`: Deterministic conversion of a `MatchedGrid` into per-stripe-column RLE `ColumnInstruction`s and overlapping paginated chart tiles. Pure functions, no DOM.
- `pdf-export`: Multi-page printable PDF (legend, symbol chart tiles, RLE checklist, optional faint template) generated client-side with `pdf-lib`, plus the Export PDF action and its progress/error behaviour.
- `touch-interaction`: Tap-to-inspect and explicit Mark Done / Undo on touchscreens, preserving the zero-overlap rule and `44 × 44px` tap targets.

### Modified Capabilities
<!-- None. `openspec/specs/` is empty: the four capabilities from `design-language-and-ui-ux` are still unarchived deltas, so nothing here is a spec-level modification of a main spec. -->

## Impact

- **New files**: `src/types/pipeline.ts`, `src/engine/guideBuilder.ts`, `src/engine/pdfExporter.ts`, `src/engine/pipelineClient.ts`, `src/workers/pipeline.worker.ts`, plus tests under `src/engine/__tests__/` and `src/workers/__tests__/`.
- **Touches the prior change's code** (must be applied after it, or merged into it): `gridStore.ts` (async pipeline status, stale-result guard), `topBar.ts` (Export PDF button, busy state), `inspectorSidebar.ts` (Mark Done / Undo button when `pointerType === 'touch'`), `gridCanvas.ts` (touch `pointerdown` inspects instead of toggling). The prior `design-language-and-ui-ux` text says a touch `pointerdown` toggles; this change replaces that behaviour. No requirement text in the prior change is edited here; the conflict is called out in `design.md`.
- **Dependencies added**: `pdf-lib@^1.17.1` (MIT), `culori@^4.0.2` (MIT), both client-side only. Verified current versions in `research.md`.
- **Zero backend**: all processing and PDF generation stay in the browser.
- **Rollback**: remove the worker client and fall back to calling `runPipeline()` synchronously (kept as the worker's only body), and hide the Export PDF button. No persisted-data migration.
