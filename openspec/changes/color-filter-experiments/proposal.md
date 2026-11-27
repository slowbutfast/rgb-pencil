## Why

The squinted outputs of two real photos show colour casts: a mint tint on cream fur, olive-brown ginger instead of orange, and a charcoal lift in the darks. Measurement points at two causes inside the engine, not at the blur: the 125 stripe combinations cannot reach bright saturated warm colours (bright orange's best achievable CIEDE2000 is 21 to 31 while neutrals sit at 3 to 4.5), and Floyd-Steinberg diffusion has no bound on accumulated error, so unreachable colours push later cells to saturated red/green stripes (`research.md`, Verified facts). The assessment's proposed fixes (fixed channel gains, saturation boost, warm white balance) are unproven and several would likely worsen the gamut problem. We need to test candidates against a fixed score before changing any default.

## What Changes

- Add five **optional, default-off colour filters** to the pipeline, passed beside `settings` as `filters`: `blackPoint` (noise gate), `gains` (per-channel multipliers), `chromaScale` (Lab chroma multiplier), `errorLimit` (bounded diffusion error), and `metric` (`de76` current, or exact full-search `de2000`). With all at identity the output is byte-identical to today.
- Add `deltaE2000` and `labToLinearRgb` to `src/engine/colorMath.ts`, validated against published CIEDE2000 reference pairs.
- Add an **Experimental colour filters** section to the Settings popover: a preset select (baseline, assessment warm-bias, gamut-soft, CIEDE2000 only, error-limit only), individual controls, and Reset filters. Filters are session-only: never saved, reset on image load, project open, and reload.
- While any filter is active the app is **preview-only**: completion (click, drag, `Mark Done / Undo`) and Export PDF are disabled with a quiet banner, and the controls are disabled while any cell is done. This keeps the paper drawing and the screen grid from drifting apart.
- Add a pure **evaluation harness** (`src/engine/evaluation/filterEval.ts`) and a sweep test that scores each candidate on the two photos plus synthetic fixtures using the Squint blur, printing a markdown table of `meanDE00`, `neutralCast`, `warmDE00`, `darkSpeckle`, and `highDE`. Results go in `verification.md`; adopting a default is a later change.
- **Not in this change**: persisting filters, changing any default, `PIPELINE_VERSION` bump, calibrated pencil palettes, per-image presets.

## Capabilities

### New Capabilities
- `color-filter-pipeline`: Engine stages and options (`blackPoint`, `gains`, `chromaScale`, `errorLimit`, `metric`), their fixed order, identity guarantees, `deltaE2000`/`labToLinearRgb`, and worker request plumbing.
- `filter-experiments-ui`: Settings section, presets, session-only lifecycle, preview-only gating of completion and PDF export, lock while cells are done, and the filtered target in Pixel Grid and the inspector.
- `filter-evaluation`: Fixtures, metric definitions, sweep configurations, and the reproducible report format.

### Modified Capabilities
<!-- None: all behaviour is additive and default-off. Completion gating is specified as a new requirement in `filter-experiments-ui` rather than by rewriting existing requirements. -->

## Impact

- **Modified files**: `src/types/pipeline.ts` (`ColorFilters`, `DEFAULT_FILTERS`, `PipelineRequest.filters`), `src/engine/colorMath.ts`, `src/engine/matcher.ts`, `src/engine/pipeline.ts`, `src/engine/engineClient.ts` and `pipelineClient.ts` (pass-through only), `src/store/gridStore.ts`, `src/ui/settingsPopover.ts`, `src/ui/topBar.ts`, `src/ui/gridCanvas.ts`, `src/ui/inspectorSidebar.ts`, `index.html` / `src/styles/main.css` if needed.
- **New files**: `src/engine/evaluation/filterEval.ts`, `src/engine/__tests__/{colorFilters,filterEval,filterSweep}.test.ts`, `src/engine/__tests__/fixtures/{white_cat.jpg,cat_face.jpg}`, UI tests.
- **Dependencies**: `jpeg-js@^0.4.4` (BSD-3-Clause), **dev-only**, used by tests.
- **Untouched**: persistence (`projectDb`, `projectFile`, `autosave`), PDF exporter, worker protocol shape (additive field only), `PIPELINE_VERSION`.
- **Cost note**: `metric: 'de2000'` costs about 165 ms at 56×42 and 485 ms at 96×72 per run in the worker; stale runs are already coalesced.
- **Rollback**: remove the settings section and the `filters` argument; defaults were never changed.
