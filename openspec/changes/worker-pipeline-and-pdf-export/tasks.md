## 1. Test Scaffolding (TDD)

- [x] 1.1 Write failing tests for pipeline data contracts and `buildComboLUT` (125 unique entries, R+G→yellow, `culori` cross-check) in `src/engine/__tests__/engine.test.ts`
- [x] 1.2 Write failing tests for `runPipeline` determinism, dither luminance preservation, width validation, and `sourceHash` stability rules
- [x] 1.3 Write failing tests for `pipelineClient` (stale discard, in-flight + latest-pending coalescing, error recovery, sync fallback, image-swap invalidation) using a fake worker
- [x] 1.4 Write failing tests for `buildColumnInstructions`, run completeness/maximality, `summariseStates`, and `paginateChart` (including `RangeError`)
- [x] 1.5 Write failing tests for `exportGuidePdf` (`%PDF-` header, page order, legend counts, absolute tile indices, margins, checklist count and `(cont.)`, template scale and tiling, standard-font-only generation)
- [x] 1.6 Write failing UI tests for touch inspect-only, `Mark Done / Undo`, double-tap no-op, and Export PDF disabled/busy/error states

## 2. Prerequisites and Contracts

- [x] 2.1 Confirm `design-language-and-ui-ux` engine files (`contrast.ts`, `colorMath.ts`, `matcher.ts`) and `gridStore.ts` exist; if not, apply that change first
- [x] 2.2 Add `pdf-lib` and `culori` dependencies and verify `npm install` and `npm run build` still pass
- [x] 2.3 Implement `src/types/pipeline.ts` (`ShadingStateId`, `PencilPalette`, `ComboLUTEntry`, `MatchedCell`, `MatchedGrid`, `ColumnInstruction`, request/response types) within the `L1-L85` budget
- [x] 2.4 Update `buildComboLUT` to produce 125 entries via `culori`-assisted Lab and a flat Lab table for the matcher; keep `culori` out of the per-pixel loop

## 3. Worker Pipeline

- [x] 3.1 Extract `runPipeline(request)` into `src/engine/pipeline.ts` from the first change's local `EngineClient` implementation (downsample, contrast, match, dither, `sourceHash`, width validation) with no behaviour change to results; the local client now delegates to it
- [x] 3.2 Implement `prepareWorkingBitmap` (longest edge <= 512, aspect preserved)
- [x] 3.3 Implement `src/workers/pipeline.worker.ts` as a thin adapter that transfers result buffers
- [x] 3.4 Implement `src/engine/pipelineClient.ts` as an `EngineClient` implementation and inject it from `main.ts` (`jobId`, in-flight + latest-pending, stale drop, error recovery, worker recreation, synchronous fallback)
- [x] 3.5 Wire `gridStore` to the client: pending/error status, keep last good grid, bump `latestJobId` on image load

## 4. Guide Builder

- [x] 4.1 Implement `buildColumnInstructions` (3 × cols instructions, maximal runs including white paper)
- [x] 4.2 Implement `paginateChart` and `summariseStates` in `src/engine/guideBuilder.ts` within the `L1-L90` budget

## 5. PDF Exporter

- [x] 5.1 Implement page geometry constants, vector state-symbol drawing, and legend/summary page
- [x] 5.2 Implement tiled symbol chart pages with absolute 1-based indices and tile labels
- [x] 5.3 Implement two-column RLE checklist pages with `(cont.)` handling for oversize entries
- [x] 5.4 Implement optional faint template pages (mm-to-pt scale, registration marks, 10 mm calibration bar, scale note)
- [x] 5.5 Implement async per-page yield, `Uint8Array` return, and download helper (Blob URL created and revoked)

## 6. UI Wiring

- [x] 6.1 Add `Export PDF` button to `topBar` with disabled, busy, and error behaviour; add export options rows to `settingsPopover`
- [x] 6.2 Add `pointerType` branch in `gridCanvas` (touch inspects only, `touch-action: none`) and store `lastPointerType`
- [x] 6.3 Add `Mark Done / Undo` button to `inspectorSidebar` (>= 44 × 44 px, shown only after touch interaction with an inspected cell)
- [x] 6.4 Add quiet `Updating…` caption while a pipeline run is pending

## 7. Verification & Empirical Audit

- [x] 7.1 Run full regression test suite (`npm test`) and `npm run build`; verify clean passes and check for metric/data regressions (including a recorded 96-wide timing)
- [x] 7.2 Populate verification.md with Requirement Adherence Matrix, resolved assumptions (standard-font glyph check, worker bundling, print scale), and verbatim execution logs
