## Automated Tests

- `npm test` (Vitest unit and UI suite). **Baseline**: branch from `origin/master` (PR #2 merged; includes PATCH-01); before any edit run the suite and record the passing file and test counts. After this change every pre-existing test must still pass unchanged.
  - **Colour math (`src/engine/__tests__/colorMath.test.ts`, extended)**:
    - `deltaE2000` reproduces the six published Sharma pairs within `1e-4` and is symmetric to `1e-9` on random pairs.
    - `labToLinearRgb` inverts `linearRgbToLab` within `1e-4` per channel on 1,000 random in-gamut colours (fixed seed).
  - **Filters engine (`src/engine/__tests__/colorFilters.test.ts`)**:
    - Identity: `filters` omitted and `DEFAULT_FILTERS` give byte-identical `ri`, `gi`, `bi`, `deltaE`, `target`, and `sourceHash` on both photo fixtures and the synthetic fixtures, at dither on and off.
    - Validation: out-of-range or non-finite values throw `RangeError` for each field.
    - Stage behaviour: gate boundary (`24 -> 0`, `25 -> 25` at `blackPoint 25`); gains `(100,200,200) -> (115,160,170)` and clamp `240 × 1.15 -> 255`; chroma scale `0.5` halves chroma and keeps `L*`; filtered `target` is returned; `sourceHash` is unchanged by filters.
    - Error limit: with `onCell`, deviation `<= L` for every cell and channel on the uniform orange field, and unlimited runs exceed it; `errorLimit >= 1` equals `null`; tiny limits move results toward the no-dither result; `onCell` does not change results.
    - Metric: bright orange on `reflective` with `contrast 1.0` and dither off picks `(1,1,4)` under `de76` and `(1,1,0)` under `de2000`; `de2000` equals a brute-force CIEDE2000 minimum over 125 combos on 1,000 random targets; `MatchedGrid.deltaE` stays ΔE76.
    - Plumbing: the worker handler and direct `matchGrid` agree with non-default filters; a stale filter result is discarded by the client; `PIPELINE_VERSION` is unchanged.
  - **Evaluation harness (`src/engine/__tests__/filterEval.test.ts`)**:
    - A perfect rendering scores `0` for `meanDE00`, `neutralDa`, `neutralDb`, `warmDE00`, `highDE`; a synthetic `+3 a*` shift gives `neutralDa = +3 ± 0.1`; border cells are excluded; repeated runs are identical; photo fixtures decode to `640×638` (white cat) and the expected size for the orange cat.
  - **Sweep (`src/engine/__tests__/filterSweep.test.ts`)**:
    - Runs the baseline and every candidate in the spec on both photos, prints one markdown table, asserts completion, determinism, and that the baseline row equals an independent unfiltered evaluation. It does not assert improvement.
  - **Store and UI (`src/store/__tests__/gridStore.test.ts`, `src/ui/__tests__/ui.test.ts`, `src/ui/__tests__/filtersUi.test.ts`)**:
    - Settings section is collapsed with defaults on load; presets set every control and issue one run; editing marks `Custom`; `Reset filters` restores defaults.
    - Filters never appear in the stored record, autosave payload, or exported file, and do not change `updatedAt`; reset on new image, project open or switch, import, start-new-drawing, and reload.
    - While active: click, drag, `Mark Done`, and `toggleCell`/`paintCell` do nothing; `Export PDF` is disabled with its title; the banner shows and dismisses; inspector hover and hint text are correct; Pixel Grid draws `MatchedGrid.target`.
    - While `doneCount > 0`: controls disabled with caption and `setFilters` returns `locked`; unlock when cells are cleared; filter changes work in a read-only tab.
- `npm run build`: strict TypeScript build passes with the worker chunk still separate.

## Manual Verification

- **Run the sweep and record the decision**:
  - **WHEN** running `npx vitest run src/engine/__tests__/filterSweep.test.ts`
  - **THEN** the markdown table is copied verbatim into `verification.md`, each hypothesis H1 to H5 gets a numeric verdict, and a recommendation is stated using the adoption criteria in the spec.
- **Visual comparison on the two photos (desktop `1280×800`)**:
  - **WHEN** loading `white_cat.jpg` and `cat_face.jpg`, switching to Squint at `1.0` cells, and cycling the presets (`None`, `Assessment: warm bias`, `Gamut-soft`, `CIEDE2000 only`, `Error limit only`)
  - **THEN** screenshots of each are saved, the mint tint on cream fur, olive ginger, and dark-area speckle are assessed per preset, and the observations sit beside the numeric table; final judgement is the maintainer's.
- **Preview-only safety**:
  - **WHEN** a preset is active and the user clicks cells, uses `Mark Done` (touch), and tries `Export PDF`
  - **THEN** nothing is completed, export is disabled, and after reload the grid is the baseline and completion works again.
- **Lock while drawing**:
  - **WHEN** one cell is marked done
  - **THEN** the filter controls are disabled with the caption.
- **Cost of CIEDE2000**:
  - **WHEN** switching `Match metric` to CIEDE2000 at widths `56` and `96`
  - **THEN** the `Updating…` caption shows briefly, the UI stays responsive, and the measured run times are recorded.
- **Mobile (`390×844`)**:
  - **WHEN** opening Settings and the filters section
  - **THEN** all controls are reachable with `>= 44px` touch targets and the banner does not overlay the grid.
