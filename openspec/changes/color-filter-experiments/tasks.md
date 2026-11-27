## 1. Test Scaffolding (TDD)

- [x] 1.1 Branch from `origin/master` (PR #2 merged), run `npm test` and `npm run build` before any edit, and record the baseline file and test counts in `verification.md`
- [x] 1.2 Write failing tests in `src/engine/__tests__/colorMath.test.ts` for `deltaE2000` (six Sharma pairs within `1e-4`, symmetry) and `labToLinearRgb` (round trip within `1e-4`)
- [x] 1.3 Write failing tests in `src/engine/__tests__/colorFilters.test.ts` for identity (byte-identical defaults), range validation, black-point gate, channel gains, chroma scale, filtered `target`, error-limit bound via `onCell`, exact full-search CIEDE2000 (orange picks `(1,1,4)` vs `(1,1,0)`; brute-force equality), `deltaE` staying ΔE76, `sourceHash` stability, worker-handler equality, and stale-result discard
- [x] 1.4 Write failing tests in `src/engine/__tests__/filterEval.test.ts` (zero score for perfect rendering, signed `+3 a*` shift, border exclusion, determinism, fixture dimensions) and the `filterSweep.test.ts` skeleton (table printed, baseline row equals unfiltered evaluation, no improvement assertion)
- [x] 1.5 Write failing store and UI tests (`gridStore.test.ts`, `ui.test.ts`, new `filtersUi.test.ts`) for the collapsed section, presets, `Custom`, reset, transient lifecycle and non-persistence, preview-only gating (click, drag, `Mark Done`, store-level block, Export PDF), banner, inspector hint, filtered target in Pixel Grid, lock while cells are done, and read-only tabs

## 2. Dependencies, Fixtures & Contracts

- [x] 2.1 Add `jpeg-js@^0.4.4` as a **dev** dependency (tests only) and copy `evidence/white_cat.jpg` and `evidence/cat_face.jpg` to `src/engine/__tests__/fixtures/`
- [x] 2.2 Add `ColorFilters`, `DEFAULT_FILTERS`, `isDefaultFilters`, filter bounds constants, and `filters?` on `PipelineRequest` in `src/types/pipeline.ts` (no change to `PipelineSettings` or `StoredSettings`)
- [x] 2.3 Add `deltaE2000` and `labToLinearRgb` to `src/engine/colorMath.ts`

## 3. Engine

- [x] 3.1 Extend `matchGrid(image, settings, filters?, hooks?)` in `src/engine/matcher.ts`: validation, black-point gate, channel gains, chroma scale (each skipped at identity), filtered `target`, and the `hooks.onCell` test hook; confirm byte-identical defaults
- [x] 3.2 Implement the bounded-error clamp (`errorLimit`) in the matching loop, using a pre-diffusion copy of the post-filter linear target
- [x] 3.3 Implement the exact full-search CIEDE2000 option (`metric: 'de2000'`) with ΔE76 still reported in `deltaE`
- [x] 3.4 Forward `filters` through `runPipeline` (`src/engine/pipeline.ts`), `engineClient.ts`, `pipelineClient.ts`, and the worker adapter without changing message shapes or `PIPELINE_VERSION`

## 4. Store & UI

- [x] 4.1 Update `src/store/gridStore.ts`: transient `filters`, `filtersActive` selector, `setFilters` (locked while cells are done), `resetFilters`, reset on every image/project replacement path, store-level completion block, `filters` banner, and keep filters out of `recordFromState` and autosave
- [x] 4.2 Add the `Color filters (experimental)` section to `src/ui/settingsPopover.ts` (presets, metric, error limit, chroma, gains, black point, Reset filters, lock caption), using existing tokens only
- [x] 4.3 Update `src/ui/topBar.ts` (Export PDF disabled and title while active, banner line), `src/ui/gridCanvas.ts` (completion blocked and filtered target in Pixel Grid), and `src/ui/inspectorSidebar.ts` (`Mark Done / Undo` disabled, hint text)

## 5. Evaluation Harness

- [x] 5.1 Implement `src/engine/evaluation/filterEval.ts` (fixtures loader helpers, Squint-score metrics, `evaluate`, `sweep`, markdown table formatter) reusing `buildLinearStripeRaster` and `blurLinearRaster`
- [x] 5.2 Implement the sweep configurations and printing in `src/engine/__tests__/filterSweep.test.ts`

## 6. Verification & Empirical Audit

- [x] 6.1 Run full regression (`npm test`) and `npm run build`; verify clean passes, byte-identical defaults, and the worker chunk still separate
- [x] 6.2 Run the sweep, paste the table into `verification.md`, give each hypothesis H1 to H5 a numeric verdict, state the recommendation using the adoption criteria, and record CIEDE2000 timings at `56` and `96` columns
- [x] 6.3 Capture Squint screenshots of both photos for each preset (desktop and `390×844`) and note observations beside the numbers; mark the final visual judgement for maintainer review
- [x] 6.4 Populate `verification.md` with the Requirement Adherence Audit Matrix, resolved assumptions, and verbatim execution logs
