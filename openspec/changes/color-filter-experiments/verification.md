# Verification Report: color-filter-experiments

## Executive Summary & Environment

- **Change**: optional, default-off colour filters, preview-only UI, and an evaluation harness.
- **Branch**: `feat/color-filter-experiments`, based on `origin/master` at `0994d96` (PR #2 merged).
- **Host**: Linux, Node `v22.23.2`, npm `10.9.8`, Vitest `5.1.2`, Vite `8.4.0`, TypeScript `5.9.3`.
- **Baseline before edits**: 19 test files / 265 tests passing; `npm run build` passing with a separate `pipeline.worker` chunk.
- **Final**: 23 test files / 333 tests passing; strict TypeScript build passing; worker chunk still separate (`dist/assets/pipeline.worker-DGVebaI3.js`, 49.92 kB).
- **Defaults unchanged**: `PipelineSettings`, `StoredSettings`, `PIPELINE_VERSION` (still `1`), the project record, autosave, IndexedDB, and `.rgbpencil.json` are untouched. With filters omitted or equal to `DEFAULT_FILTERS`, `matchGrid` output is byte-identical (asserted on both photos and synthetic fixtures, dither on and off).
- **No candidate is adopted**: the sweep found no configuration that clears the adoption bar (see Decision Record). No preset or threshold was tuned to make one win.

## Requirement Adherence Audit Matrix

Legend: **A** = automated test in the suite; **M** = manual check recorded in this report.

### `color-filter-pipeline`

| Requirement / scenario | Verification |
| :--- | :--- |
| Optional filters, identity defaults; default output byte-identical | **A** `colorFilters.test.ts` > "returns byte-identical grids when filters are omitted or DEFAULT_FILTERS" (white cat, orange cat, gradient; dither on/off) |
| Out-of-range / non-finite values rejected with `RangeError` | **A** `colorFilters.test.ts` > "rejects %s with RangeError" (14 cases) |
| Filters never alter `sourceHash` | **A** `colorFilters.test.ts` > "keeps the source fingerprint independent of filters" |
| Fixed stage order and post-filter `target` | **A** `colorFilters.test.ts` > "handles all stages together and returns the filtered target"; gate/gain/chroma cases below |
| Black-point gate boundary (`24 -> 0`, `25 -> 25` at 25) | **A** `colorFilters.test.ts` > "gates channels strictly below the black point" |
| Gains `(100,200,200) -> (115,160,170)` and clamp `240 x 1.15 -> 255` | **A** `colorFilters.test.ts` > "applies channel gains with rounding and clamping" |
| Chroma scale halves chroma and keeps `L*` | **A** `colorFilters.test.ts` > "halves chroma without moving lightness" |
| `labToLinearRgb` round trip within `1e-4` | **A** `colorMath.test.ts` > "inverts linearRgbToLab within 1e-4 per channel on random in-gamut colours" |
| Bounded diffusion deviation `<= L`; unlimited exceeds it; `L >= 1` equals `null`; tiny limit approaches no dither | **A** `colorFilters.test.ts` > "bounded diffusion error" (4 cases) |
| Six Sharma CIEDE2000 pairs within `1e-4` | **A** `colorMath.test.ts` > CIEDE2000 "matches the published pair" |
| `de2000` changes the bright-orange pick to `(1,1,0)` | **A** `colorFilters.test.ts` > "changes the pick on bright orange" |
| `de2000` equals brute-force minimum over 125 combos | **A** `colorFilters.test.ts` > "equals a brute-force CIEDE2000 minimum over all 125 combos" (960 targets) |
| `deltaE` stays ΔE76 under `de2000` | **A** `colorFilters.test.ts` > "keeps deltaE reported as CIELAB ΔE76" |
| Worker handler equals direct `matchGrid`; filters forwarded | **A** `colorFilters.test.ts` > "worker handler equals direct matchGrid and forwards filters" |
| Stale filter result discarded | **A** `colorFilters.test.ts` > "worker client forwards filters and discards a stale filter result" |
| `PIPELINE_VERSION` unchanged | **A** `colorFilters.test.ts` > "keeps PIPELINE_VERSION unchanged" |

### `filter-experiments-ui`

| Requirement / scenario | Verification |
| :--- | :--- |
| Section collapsed, neutral defaults, no active filter | **A** `filtersUi.test.ts` > "is collapsed with neutral defaults and no active filter" |
| Preset sets every control and issues one run | **A** `filtersUi.test.ts` > "applies a preset to every control and issues one run" |
| Editing a control marks `Custom` | **A** `filtersUi.test.ts` > "marks the preset Custom when a control is edited" |
| Reset restores defaults | **A** `filtersUi.test.ts` > "restores defaults from Reset filters" |
| Filters never reach the record, autosave, export; `updatedAt` unchanged | **A** `gridStore.test.ts` > "never persists filters or changes updatedAt" |
| Reload restores the baseline | **A** `gridStore.test.ts` > "starts a reloaded session at the baseline filters" |
| New image / start-new-drawing reset | **A** `gridStore.test.ts` > "resets filters on a new image and when starting a new drawing" |
| Project switch and import reset | **A** `gridStore.test.ts` > "resets filters when switching projects and on import" |
| Completion blocked (click, drag, store-level `toggleCell`/`paintCell`) | **A** `gridStore.test.ts` > "blocks completion while active and locks filters once a cell is done"; `filtersUi.test.ts` > "blocks canvas clicks..." |
| `Export PDF` disabled with title, re-enabled after reset | **A** `filtersUi.test.ts` > "shows a dismissible banner, disables Export PDF..." |
| Banner shows, dismisses, re-arms on the next change | **A** `gridStore.test.ts` > "applies filters, shows the banner, and re-arms it after dismissal"; `filtersUi.test.ts` safety-rails test |
| Inspection stays live; hint text; `Mark Done` disabled | **A** `filtersUi.test.ts` > "blocks canvas clicks and shows the inspect-only inspector hint" |
| Controls lock with `doneCount > 0`, unlock when cleared; `setFilters` returns `locked` | **A** `filtersUi.test.ts` > "locks every control while a cell is done"; `gridStore.test.ts` > "blocks completion while active..." |
| Filters allowed in a read-only tab | **A** `gridStore.test.ts` > "allows filters in a read-only tab" |
| Pixel Grid shows the post-filter target | **A** `filtersUi.test.ts` > "draws the post-filter target in Pixel Grid" |
| Mobile controls reachable, banner does not overlay the grid | **M** `mobile-filters-open.png`, `mobile-banner.png`; the popover scrolls within the viewport and the banner sits in the stage flow above the canvas |

### `filter-evaluation`

| Requirement / scenario | Verification |
| :--- | :--- |
| Photos decode at documented sizes | **A** `filterEval.test.ts` / `colorFilters.test.ts` > "decodes white_cat at 640 x 638" / "decodes the cat photos..." (`cat_face` 735 x 736) |
| Perfect rendering scores zero | **A** `filterEval.test.ts` > "scores a perfect rendering as zero" |
| Known `+3 a*` shift gives `neutralDa = +3` | **A** `filterEval.test.ts` > "reports a known +3 a* shift as neutralDa +3" |
| Border cells excluded | **A** `filterEval.test.ts` > "excludes cells within two cells of the border" |
| Deterministic | **A** `filterEval.test.ts` > "is deterministic..."; `filterSweep.test.ts` rerun equality |
| Sweep prints a row per baseline/candidate for both photos | **A** `filterSweep.test.ts` > "prints a complete, deterministic table..." |
| Baseline row equals independent unfiltered evaluation | **A** same test |
| Decision record with numeric verdicts and recommendation | **M** this section; table printed by `filterSweep.test.ts` |

## Decision Record

### Sweep table (verbatim test output)

Command: `npx vitest run src/engine/__tests__/filterSweep.test.ts` at `cols = 32`. The baseline uses `filters` omitted; the synthetic fixtures are the 64-step neutral ramp and the five warm patches.

| Configuration | white cat meanDE00 | white cat Δ% | white cat neutralCast | white cat neutralDa | white cat neutralDb | white cat warmDE00 | white cat darkSpeckle | white cat highDE | orange cat meanDE00 | orange cat Δ% | orange cat neutralCast | orange cat neutralDa | orange cat neutralDb | orange cat warmDE00 | orange cat darkSpeckle | orange cat highDE | neutral ramp meanDE00 | neutral ramp Δ% | neutral ramp neutralCast | neutral ramp neutralDa | neutral ramp neutralDb | neutral ramp warmDE00 | neutral ramp darkSpeckle | neutral ramp highDE | warm patches meanDE00 | warm patches Δ% | warm patches neutralCast | warm patches neutralDa | warm patches neutralDb | warm patches warmDE00 | warm patches darkSpeckle | warm patches highDE |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline | 13.17 | +0.0 | 4.61 | -1.03 | +1.22 | 13.69 | 0.151 | 0.332 | 13.14 | +0.0 | 4.74 | -1.06 | -1.16 | 14.39 | 0.917 | 0.434 | 3.59 | +0.0 | 1.50 | +0.09 | +1.12 | 0.00 | 0.042 | 0.000 | 18.60 | +0.0 | 0.00 | +0.00 | +0.00 | 21.66 | 0.000 | 0.750 |
| errorLimit 0.20 | 13.22 | +0.3 | 4.58 | -1.15 | +1.22 | 14.01 | 0.153 | 0.332 | 13.11 | -0.2 | 4.70 | -1.17 | -1.13 | 14.40 | 0.778 | 0.423 | 3.59 | +0.0 | 1.50 | +0.09 | +1.12 | 0.00 | 0.042 | 0.000 | 21.69 | +16.6 | 0.00 | +0.00 | +0.00 | 25.45 | 0.000 | 0.750 |
| errorLimit 0.10 | 13.09 | -0.6 | 4.33 | -1.33 | +1.13 | 13.60 | 0.136 | 0.307 | 12.92 | -1.6 | 4.63 | -1.39 | -1.16 | 14.18 | 0.778 | 0.397 | 3.59 | +0.0 | 1.50 | +0.09 | +1.12 | 0.00 | 0.042 | 0.000 | 21.94 | +17.9 | 0.00 | +0.00 | +0.00 | 25.73 | 0.000 | 0.750 |
| errorLimit 0.05 | 12.97 | -1.5 | 4.18 | -1.42 | +1.04 | 13.48 | 0.133 | 0.309 | 12.40 | -5.6 | 4.51 | -1.58 | -1.23 | 13.70 | 0.639 | 0.365 | 3.59 | -0.2 | 1.51 | +0.08 | +1.13 | 0.00 | 0.042 | 0.000 | 21.77 | +17.0 | 0.00 | +0.00 | +0.00 | 25.46 | 0.000 | 0.750 |
| errorLimit 0.02 | 12.82 | -2.7 | 3.97 | -1.51 | +0.88 | 13.16 | 0.123 | 0.298 | 12.20 | -7.1 | 4.45 | -1.65 | -1.31 | 13.40 | 0.778 | 0.351 | 3.78 | +5.1 | 1.70 | -0.07 | +1.24 | 0.00 | 0.042 | 0.000 | 21.44 | +15.3 | 0.00 | +0.00 | +0.00 | 25.06 | 0.000 | 0.750 |
| metric de2000 | 13.11 | -0.5 | 4.72 | -0.70 | +1.15 | 12.91 | 0.159 | 0.321 | 12.76 | -2.9 | 4.73 | -0.92 | -1.19 | 14.11 | 0.917 | 0.394 | 3.52 | -2.0 | 1.37 | +0.18 | +1.02 | 0.00 | 0.000 | 0.000 | 17.99 | -3.3 | 0.00 | +0.00 | +0.00 | 20.93 | 0.000 | 0.750 |
| chromaScale 0.7 | 13.06 | -0.9 | 3.90 | -1.49 | +0.77 | 13.13 | 0.110 | 0.309 | 12.68 | -3.5 | 4.24 | -1.62 | -1.44 | 14.01 | 0.972 | 0.392 | 3.59 | +0.0 | 1.50 | +0.09 | +1.12 | 0.00 | 0.042 | 0.000 | 18.21 | -2.1 | 0.00 | +0.00 | +0.00 | 21.17 | 0.000 | 0.750 |
| chromaScale 0.85 | 13.11 | -0.4 | 4.36 | -1.16 | +1.09 | 13.42 | 0.130 | 0.321 | 12.80 | -2.5 | 4.58 | -1.26 | -1.21 | 14.06 | 0.833 | 0.416 | 3.59 | +0.0 | 1.50 | +0.09 | +1.12 | 0.00 | 0.042 | 0.000 | 18.38 | -1.2 | 0.00 | +0.00 | +0.00 | 21.38 | 0.000 | 0.750 |
| chromaScale 1.15 | 13.27 | +0.8 | 4.86 | -1.01 | +1.41 | 13.88 | 0.169 | 0.343 | 13.43 | +2.2 | 4.92 | -0.96 | -1.07 | 14.63 | 0.917 | 0.429 | 3.59 | +0.0 | 1.50 | +0.09 | +1.12 | 0.00 | 0.042 | 0.000 | 18.74 | +0.7 | 0.00 | +0.00 | +0.00 | 21.85 | 0.000 | 0.750 |
| chromaScale 1.3 | 13.46 | +2.1 | 4.99 | -0.94 | +1.46 | 14.37 | 0.189 | 0.353 | 13.69 | +4.2 | 5.09 | -0.77 | -0.99 | 14.81 | 0.917 | 0.439 | 3.59 | +0.0 | 1.50 | +0.09 | +1.12 | 0.00 | 0.042 | 0.000 | 19.42 | +4.4 | 0.00 | +0.00 | +0.00 | 22.69 | 0.000 | 0.750 |
| blackPoint 15 | 13.18 | +0.1 | 4.61 | -1.02 | +1.21 | 13.69 | 0.146 | 0.332 | 13.13 | -0.0 | 4.74 | -1.06 | -1.16 | 14.39 | 0.917 | 0.431 | 3.59 | +0.0 | 1.50 | +0.09 | +1.12 | 0.00 | 0.042 | 0.000 | 18.60 | +0.0 | 0.00 | +0.00 | +0.00 | 21.66 | 0.000 | 0.750 |
| blackPoint 25 | 13.16 | -0.1 | 4.62 | -1.04 | +1.23 | 13.70 | 0.146 | 0.330 | 13.14 | +0.0 | 4.71 | -1.09 | -1.18 | 14.40 | 0.861 | 0.431 | 3.54 | -1.4 | 1.46 | +0.07 | +1.08 | 0.00 | 0.000 | 0.000 | 18.60 | +0.0 | 0.00 | +0.00 | +0.00 | 21.66 | 0.000 | 0.750 |
| gains 1.15/0.80/0.85 | 16.54 | +25.6 | 11.51 | +8.04 | +1.89 | 17.09 | 0.217 | 0.552 | 15.73 | +19.7 | 10.89 | +7.03 | -0.62 | 15.58 | 1.000 | 0.497 | 12.54 | +249.0 | 12.46 | +12.20 | +2.21 | 0.00 | 0.083 | 0.384 | 23.28 | +25.1 | 0.00 | +0.00 | +0.00 | 25.54 | 0.000 | 0.866 |
| preset: Assessment: warm bias | 17.11 | +29.9 | 11.84 | +8.51 | +1.44 | 18.51 | 0.238 | 0.588 | 17.31 | +31.7 | 11.11 | +7.65 | -1.52 | 17.19 | 0.972 | 0.580 | 13.40 | +272.9 | 13.52 | +13.28 | +1.62 | 0.00 | 0.083 | 0.429 | 26.45 | +42.2 | 0.00 | +0.00 | +0.00 | 29.10 | 0.000 | 0.938 |
| preset: Gamut-soft | 13.05 | -0.9 | 4.15 | -1.26 | +0.94 | 13.04 | 0.138 | 0.316 | 12.02 | -8.5 | 4.41 | -1.39 | -1.36 | 13.30 | 0.750 | 0.339 | 3.53 | -1.7 | 1.43 | +0.17 | +1.09 | 0.00 | 0.000 | 0.000 | 17.09 | -8.1 | 0.00 | +0.00 | +0.00 | 19.84 | 0.000 | 0.750 |
| preset: CIEDE2000 only | 13.11 | -0.5 | 4.72 | -0.70 | +1.15 | 12.91 | 0.159 | 0.321 | 12.76 | -2.9 | 4.73 | -0.92 | -1.19 | 14.11 | 0.917 | 0.394 | 3.52 | -2.0 | 1.37 | +0.18 | +1.02 | 0.00 | 0.000 | 0.000 | 17.99 | -3.3 | 0.00 | +0.00 | +0.00 | 20.93 | 0.000 | 0.750 |
| preset: Error limit only | 13.09 | -0.6 | 4.33 | -1.33 | +1.13 | 13.60 | 0.136 | 0.307 | 12.92 | -1.6 | 4.63 | -1.39 | -1.16 | 14.18 | 0.778 | 0.397 | 3.59 | +0.0 | 1.50 | +0.09 | +1.12 | 0.00 | 0.042 | 0.000 | 21.94 | +17.9 | 0.00 | +0.00 | +0.00 | 25.73 | 0.000 | 0.750 |

### Hypothesis verdicts

Adoption criteria (`specs/filter-evaluation`): a candidate is recommendable only if it lowers `meanDE00` by **at least 5% on both photos**, does not raise `|neutralDa|` or `|neutralDb|` by more than **0.5**, and does not raise `warmDE00`.

| Hypothesis | Verdict | Numbers it rests on |
| :--- | :--- | :--- |
| **H1** Error limiting reduces out-of-gamut speckle and lowers `meanDE00` on both photos | **supported** (but below the adoption bar) | `errorLimit 0.02`: white cat `meanDE00` 13.17 -> 12.82 (-2.7%), orange cat 13.14 -> 12.20 (-7.1%); `darkSpeckle` orange 0.917 -> 0.123, white 0.151 -> 0.123. Warm patches get worse (`meanDE00` +15.3%), so this is not a free win. |
| **H2** CIEDE2000 gives paler warm tones and lower `warmDE00` without worse neutral cast | **supported** | `metric de2000`: `warmDE00` white 13.69 -> 12.91, orange 14.39 -> 14.11; `|neutralDa|` white 1.03 -> 0.70, orange 1.06 -> 0.92; `neutralCast` white 4.61 -> 4.72 (+0.11), orange 4.74 -> 4.73. |
| **H3** Mild chroma reduction beats a boost; saturation boost worsens `meanDE00` | **supported** | `chromaScale 0.7`: -0.9% white, -3.5% orange; `0.85`: -0.4% / -2.5%; `1.15`: +0.8% / +2.2%; `1.3`: +2.1% / +4.2%. |
| **H4** The assessment's fixed gains tint warm and raise `meanDE00` by construction | **supported** | `gains 1.15/0.80/0.85`: `meanDE00` +25.6% white, +19.7% orange; `neutralDa` +8.04 / +7.03; `warmDE00` 13.69 -> 17.09 / 14.39 -> 15.58. The visual preset reads strongly magenta. |
| **H5** A black point of 15-25 removes dark-area speckle at negligible `meanDE00` cost | **not supported** | `blackPoint 15` / `25`: `darkSpeckle` white 0.151 -> 0.146 / 0.146, orange 0.917 -> 0.917 / 0.861; `meanDE00` moves by at most 0.1%. The gate removes near-black channels but not the speckled combos. |

### Recommendation

**No candidate qualifies for adoption in this change.** The closest is `Gamut-soft` (chroma `0.85`, `errorLimit 0.10`, `de2000`): orange cat -8.5% and white cat -0.9% `meanDE00`, with lower `warmDE00` on both photos (13.69 -> 13.04, 14.39 -> 13.30). Neutral error stays within the allowance: `neutralDa` -1.03 -> -1.26 on white and -1.06 -> -1.39 on orange (absolute rise 0.23 and 0.33), `neutralDb` +1.22 -> +0.94 and -1.16 -> -1.36 (absolute change 0.28 and 0.20). It fails the **5% on both photos** criterion because white improves by only 0.9%. Keep `DEFAULT_FILTERS`; if a follow-up chases this, test a combined mild-chroma + error-limit candidate, not a default change.

### Visual comparison (manual, maintainer's call)

Captured from the dev server at `localhost:5173`, Squint at `1.0` cells, `1280 x 800`; files under `screenshots/color-filters/` (untracked tool output, not committed).

| Preset | White cat | Orange cat |
| :--- | :--- | :--- |
| `None (baseline)` | Mint-green cast across the muzzle and cheeks; cool blue-grey plate rim and shadow; fine red/green speckle in the dark background. | Cream highlights read slightly green; coat is olive-brown rather than ginger; cream background carries faint green/pink noise. |
| `Assessment: warm bias` | Strong magenta/pink over the white fur; green cast replaced by a warm tint, not neutralized. | Fur becomes red/maroon; highlights pink; visually the worst of the five. |
| `Gamut-soft` | Cleanest white fur of the five; mint cast largely gone; plate shadow still slightly cool; speckle reduced. | Best ginger/cream separation; less olive, slightly flatter colour; background cleaner. |
| `CIEDE2000 only` | White fur clearly better than baseline; a little more cream than Gamut-soft. | Close to Gamut-soft, marginally more olive; speckle similar to baseline. |
| `Error limit only` | Close to baseline; speckle slightly reduced, mint cast remains. | Slightly cleaner than baseline, but still olive; the smallest visual change. |

The numeric leader (`Gamut-soft`) is also the visual leader in this sample, but the white-cat improvement is small and the sample is two photos. Final visual acceptance is left to the maintainer, as required.

## Resolved Assumptions & Empirical Proof

- **CIEDE2000 cost**: median of 5 runs on this host, full 125-combo search, in Node: **168 ms at 56 columns (56 x 42 cells)** and **491 ms at 96 columns (96 x 72 cells)**. This matches the planning estimate (165 / 485 ms) and stays in the worker with latest-wins coalescing.
- **Accuracy of CIEDE2000**: the implementation reproduces all six published Sharma pairs to four decimals; those are the test vectors. No shortlist or CIE94 approximation is used (`specs/color-filter-pipeline`).
- **Default identity**: proven by element-for-element equality of `ri`, `gi`, `bi`, `deltaE`, `target`, and `sourceHash` on both photos and a synthetic gradient, with dithering on and off.
- **Neutrals are not systematically biased**: the baseline neutral metrics are `neutralDa` -1.03 / -1.06 and `neutralDb` +1.22 / -1.16 on the two photos, i.e. about 1-1.6 units before any filter; the fixed-gain preset pushes `neutralDa` to +8.04 / +7.03, confirming it adds a cast rather than correcting one.
- **Two photos are a small sample**: the sweep also prints the neutral-ramp and warm-patch fixtures; conclusions beyond these fixtures remain suggestive.
- **Mobile reachability**: the popover gained a mobile `max-height` with internal scrolling so the new section is reachable at `390 x 844`; the banner remains in the stage flow above the grid, not overlaid.
- **Screenshots**: desktop preset matrix plus `desktop-filters-open.png`, `mobile-filters-open.png`, `mobile-banner.png`. They are tool output and stay untracked.

## Nomenclature & Code Symbol Audit

| Symbol | Location | Meaning |
| :--- | :--- | :--- |
| `ColorFilters` | `src/types/pipeline.ts` | Optional filter payload (`blackPoint`, `gains`, `chromaScale`, `errorLimit`, `metric`) |
| `DEFAULT_FILTERS` | `src/types/pipeline.ts` | Identity values; never persisted |
| `isDefaultFilters` / `cloneFilters` / `presetKeyForFilters` | `src/types/pipeline.ts` | Identity check, defensive copy, UI preset matching |
| `FILTER_PRESETS` | `src/types/pipeline.ts` | The five UI presets |
| `filters` | `PipelineRequest`, store state | Sibling of `settings`; transient |
| `filtersActive` / `selectFiltersActive` | `src/store/gridStore.ts` | Preview-only gate |
| `errorLimit` | `matchGrid` loop | Per-channel linear deviation bound |
| `chromaScale` | `matchGrid` | Lab `a*`/`b*` multiplier |
| `deltaE2000` / `deltaE2000Raw` / `labToLinearRgb` | `src/engine/colorMath.ts` | Exact CIEDE2000 and Lab inverse |
| `evaluate` / `sweep` / `scoreCells` | `src/engine/evaluation/filterEval.ts` | Squint-score harness |
| `data-ui="filters-*"` / `filters-banner` | UI | Test and styling hooks |

## Verbatim Execution Logs

### Red run (new tests first, before implementation)

Command: `npx vitest run src/engine/__tests__/colorMath.test.ts src/engine/__tests__/colorFilters.test.ts src/engine/__tests__/filterEval.test.ts src/engine/__tests__/filterSweep.test.ts`

```
 Test Files  4 failed (4)
      Tests  35 failed | 18 passed (53)
```

Representative failures were missing exports (`deltaE2000`, `labToLinearRgb`) and the missing evaluation/sweep modules, as intended for the red phase.

### Green run (full suite)

Command: `SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm test -- --maxWorkers=1`

```
 Test Files  23 passed (23)
      Tests  333 passed (333)
```

Every pre-existing test still passes unchanged; the new files are `colorFilters.test.ts`, `filterEval.test.ts`, `filterSweep.test.ts`, and `filtersUi.test.ts`, plus extensions to `colorMath.test.ts` and `gridStore.test.ts`.

### Build

Command: `SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm run build`

```
dist/assets/pipeline.worker-DGVebaI3.js   49.92 kB
dist/assets/index-C5RWfSaj.css           15.65 kB
dist/assets/index-DW7A4VjE.js           558.57 kB
✓ built in 375ms
```

The worker chunk remains separate.

### Sweep

Command: `npx vitest run src/engine/__tests__/filterSweep.test.ts`

```
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

The table above is the verbatim `stdout` from that test.

### OpenSpec validation

Command: `openspec validate color-filter-experiments --strict`

```
Change 'color-filter-experiments' is valid
```
