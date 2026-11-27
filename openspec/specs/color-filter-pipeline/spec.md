# color-filter-pipeline Specification

## Purpose
Defines the optional, default-off colour filters applied between contrast and optical matching, their fixed stage order, identity guarantees, exact CIEDE2000 matching, and worker request plumbing.

## Requirements


### Requirement: Optional colour filters with identity defaults
The engine SHALL accept an optional `filters` value of type `ColorFilters` beside `settings`: `{ blackPoint: number, gains: [number, number, number], chromaScale: number, errorLimit: number | null, metric: 'de76' | 'de2000' }`. `DEFAULT_FILTERS` SHALL be `{ blackPoint: 0, gains: [1, 1, 1], chromaScale: 1, errorLimit: null, metric: 'de76' }`. `blackPoint` SHALL be an integer in `[0, 40]`, each gain in `[0.6, 1.4]`, `chromaScale` in `[0.5, 1.5]`, and `errorLimit` either `null` or a number in `[0.02, 0.5]`. Out-of-range or non-finite values SHALL be rejected with a `RangeError`. When `filters` is absent or equal to `DEFAULT_FILTERS`, `matchGrid` SHALL return typed arrays byte-identical to its output before this change.

#### Scenario: Default filters reproduce the baseline exactly
- **WHEN** `matchGrid` runs on each fixture with `filters` omitted and again with `DEFAULT_FILTERS`
- **THEN** `ri`, `gi`, `bi`, `deltaE`, `target`, and `sourceHash` SHALL be equal element for element

#### Scenario: Out-of-range filter values are rejected
- **WHEN** `matchGrid` is called with `blackPoint = 41`, or a gain of `1.5`, or `errorLimit = 0.01`, or `chromaScale = NaN`
- **THEN** it SHALL throw a `RangeError` and SHALL NOT return a grid

#### Scenario: Filters never alter the source fingerprint
- **WHEN** the same image is matched with and without non-default filters
- **THEN** `sourceHash` SHALL be identical

### Requirement: Fixed stage order and filtered target
Stages SHALL run in this order: area-average downsample, contrast S-curve, black-point gate, channel gains, chroma scale, linearization, matching with the selected metric and error limit. A stage whose filter is at its identity value SHALL be skipped entirely. `MatchedGrid.target` SHALL hold the post-filter 8-bit target (the colour the matcher is trying to reach), and `sourceHash` SHALL still be computed from the pre-contrast downsample.

#### Scenario: Target reflects the filters
- **WHEN** `gains = [1.15, 0.8, 0.85]` is applied to a cell whose contrast-boosted target is `(100, 200, 200)`
- **THEN** that cell's `target` SHALL be `(115, 160, 170)`

### Requirement: Black-point gate
After the contrast stage, every 8-bit target channel value strictly below `blackPoint` SHALL be set to `0`; values equal to or above it SHALL be unchanged. `blackPoint = 0` SHALL be the identity.

#### Scenario: Gate boundary
- **WHEN** `blackPoint = 25` is applied to channel values `24` and `25`
- **THEN** they SHALL become `0` and `25` respectively

### Requirement: Channel gains in encoded sRGB
After the black-point gate, each target channel SHALL be multiplied by its gain, rounded, and clamped to `[0, 255]`. Gains of `[1, 1, 1]` SHALL be the identity.

#### Scenario: Clamping
- **WHEN** a channel value of `240` is multiplied by `1.15`
- **THEN** the result SHALL be `255`

### Requirement: Chroma scale in CIELAB
After gains, when `chromaScale !== 1`, each target colour SHALL be converted to CIELAB (D65), its `a*` and `b*` multiplied by `chromaScale` with `L*` unchanged, converted back to linear RGB, clamped to `[0, 1]`, and re-encoded to 8-bit sRGB. `labToLinearRgb` SHALL invert `linearRgbToLab` to within `1e-4` per linear channel for in-gamut inputs.

#### Scenario: Scale of 0.5 halves chroma and keeps lightness
- **WHEN** a mid-chroma in-gamut colour is scaled by `0.5`
- **THEN** the result's `L*` SHALL equal the input's within `0.5` and its chroma SHALL be half the input's within `1.0`

#### Scenario: Round trip
- **WHEN** 1,000 random in-gamut linear colours are converted to Lab and back
- **THEN** every channel SHALL match within `1e-4`

### Requirement: Bounded diffusion error
When `errorLimit = L` (not `null`), the value used to match each cell SHALL be its accumulated, diffused linear value clamped per channel to `[orig - L, orig + L]` (where `orig` is that cell's post-filter linear target before any diffusion) and then to `[0, 1]`; the residual passed on to neighbours SHALL be computed from that clamped value. `errorLimit = null` SHALL leave behaviour unchanged. An `errorLimit` of `1` or more SHALL behave like `null`. For testability `matchGrid` SHALL accept an optional fourth argument `{ onCell?: (index: number, used: readonly [number, number, number], original: readonly [number, number, number]) => void }` and call `onCell` once per cell with the linear value actually matched and the cell's own post-filter linear target; the hook SHALL NOT change results.

#### Scenario: Deviation never exceeds the limit
- **WHEN** a uniform out-of-gamut field (target sRGB `(237, 145, 33)`, `contrast = 1.0`) is matched with dithering on and `errorLimit = 0.05`
- **THEN** for every `onCell` call and channel, `used` SHALL differ from `original` by at most `0.05` in linear light, and without the limit the same field SHALL produce at least one cell whose deviation exceeds `0.05`

#### Scenario: Tiny limit approaches no dithering
- **WHEN** a smooth gradient is matched with `errorLimit = 0.02` and, separately, with dithering off
- **THEN** the fraction of cells whose chosen combo differs between the two runs SHALL be lower than the fraction between the unlimited dithered run and the no-dither run

### Requirement: Exact full-search CIEDE2000 metric
`deltaE2000(lab1, lab2)` SHALL implement CIEDE2000 and SHALL match the Sharma, Wu, Dalal (2005) reference pairs `((50, 2.6772, -79.7751), (50, 0, -82.7485)) = 2.0425`, `((50, 3.1571, -77.2803), (50, 0, -82.7485)) = 2.8615`, `((50, 2.8361, -74.0200), (50, 0, -82.7485)) = 3.4412`, `((50, -1.3802, -84.2814), (50, 0, -82.7485)) = 1.0000`, `((50, 2.5, 0), (50, 0, -2.5)) = 4.3065`, and `((60.2574, -34.0099, 36.2677), (60.4626, -34.1751, 39.4387)) = 1.2644` to within `1e-4`. With `metric = 'de2000'`, every cell SHALL be matched by evaluating all 125 combos (no shortlist) and choosing the minimum CIEDE2000. `MatchedGrid.deltaE` SHALL continue to report the CIELAB ΔE76 between the matching value and the chosen combo, so the inspector's `ΔE` keeps its meaning under both metrics.

#### Scenario: Published reference pairs
- **WHEN** `deltaE2000` is evaluated on the six reference pairs
- **THEN** each result SHALL match the published value within `1e-4`

#### Scenario: Metric changes the pick on a warm out-of-gamut colour
- **WHEN** a uniform target of sRGB `(237, 145, 33)` is matched on the `reflective` palette with `contrast = 1.0` and dithering off, once per metric
- **THEN** the `de76` run SHALL choose combo `(ri, gi, bi) = (1, 1, 4)` and the `de2000` run SHALL choose `(1, 1, 0)`

#### Scenario: Metric is exact, not shortlisted
- **WHEN** `de2000` matching is compared with a brute-force CIEDE2000 minimum over the same 125 combos for 1,000 random targets
- **THEN** every chosen combo SHALL be identical

### Requirement: Filters travel with the pipeline request
`PipelineRequest` SHALL carry `filters?: ColorFilters` as a sibling of `settings`. The synchronous client, the worker client, and the worker adapter SHALL pass it through unchanged, it SHALL be structured-clone safe, and the latest-job-wins behaviour SHALL apply to filter changes exactly as to setting changes. `PIPELINE_VERSION` SHALL NOT change.

#### Scenario: Worker result equals direct result
- **WHEN** a request with non-default filters is processed through the worker handler and through `matchGrid` directly
- **THEN** both grids SHALL be equal

#### Scenario: Stale filter result is discarded
- **WHEN** two filter changes are issued in quick succession and the first result arrives after the second was issued
- **THEN** the first result SHALL be discarded
