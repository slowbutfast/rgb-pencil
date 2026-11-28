## ADDED Requirements

### Requirement: Fixtures
The evaluation SHALL run on at least these fixtures: `white_cat.jpg` and `cat_face.jpg` (real photos, decoded in tests with `jpeg-js`, area-averaged to the pipeline's working size), a synthetic 64-step neutral grey ramp, and a synthetic set of warm patches (ginger `(222,150,90)`, bright orange `(237,145,33)`, cream `(240,222,190)`, pink `(200,120,110)`, dark ginger `(160,95,50)`). Photo fixtures SHALL be stored under `src/engine/__tests__/fixtures/`.

#### Scenario: Photos decode to the expected size
- **WHEN** `white_cat.jpg` is decoded
- **THEN** its dimensions SHALL be `640 × 638`

### Requirement: Squint score metrics
For a given image, settings, and filters, the harness SHALL run `matchGrid`, render the matched mix through `buildLinearStripeRaster` and `blurLinearRaster` at `blurCells = 1.0`, average each cell's `3×3` subpixels to a per-cell linear colour, and compare it with the **unfiltered** contrast-boosted downsampled target (the "truth", computed with `DEFAULT_FILTERS` and ignoring dithering state of the run under test). Cells within `2` cells of the grid border SHALL be excluded. It SHALL report, per fixture: `meanDE00` (mean CIEDE2000 over cells); `neutralCast` (mean over cells whose truth chroma `C* < 8` and `L*` in `[20, 95]` of the rendered chroma `C*`), together with `neutralDa` and `neutralDb` (mean signed `a*` and `b*` error over the same cells); `warmDE00` (mean CIEDE2000 over cells whose truth chroma is above `20` and hue is in `[20°, 100°]`); `darkSpeckle` (fraction of cells with truth `L* < 15` whose chosen combo is not `(4, 4, 4)`); and `highDE` (fraction of cells with CIEDE2000 above `15`).

#### Scenario: Perfect rendering scores zero
- **WHEN** the harness compares a grid with itself (rendered cell colours set equal to truth)
- **THEN** `meanDE00`, `neutralDa`, `neutralDb`, `warmDE00`, and `highDE` SHALL be `0`

#### Scenario: Metric definitions on a known case
- **WHEN** a synthetic neutral field is rendered with a known `+3` `a*` shift
- **THEN** `neutralDa` SHALL equal `+3` within `0.1`

#### Scenario: Deterministic
- **WHEN** the same configuration is evaluated twice
- **THEN** every metric SHALL be identical

### Requirement: Sweep configurations and report
A sweep test SHALL evaluate, for each photo fixture, the baseline and these one-factor candidates: `errorLimit` in `{0.20, 0.10, 0.05, 0.02}`; `metric = de2000`; `chromaScale` in `{0.7, 0.85, 1.15, 1.3}`; `blackPoint` in `{15, 25}`; gains `[1.15, 0.8, 0.85]`; and the five UI presets. It SHALL print one markdown table (rows = configuration, columns = metrics per fixture, plus the change in `meanDE00` versus baseline in percent) to the test output. The sweep SHALL NOT assert that any candidate improves on the baseline; it SHALL assert only that every run completes, is deterministic, and that the baseline row equals an independent baseline evaluation.

#### Scenario: Sweep prints a complete table
- **WHEN** the sweep test runs
- **THEN** its output SHALL contain a row for the baseline and for every candidate above, for both photo fixtures

#### Scenario: Baseline row is the unfiltered pipeline
- **WHEN** the baseline row is compared with an evaluation using `filters` omitted
- **THEN** all metrics SHALL be equal

### Requirement: Decision record
`verification.md` SHALL contain the sweep table verbatim, a verdict for each hypothesis H1 to H5 in `research.md` (`supported`, `not supported`, or `inconclusive`, each with the numbers it rests on), and a recommendation of which candidate, if any, to adopt as a default in a follow-up change. A candidate SHALL be recommended only if it lowers `meanDE00` by at least `5%` on both photos, does not move `|neutralDa|` or `|neutralDb|` up by more than `0.5`, and does not raise `warmDE00`.

#### Scenario: Verdicts are numeric
- **WHEN** `verification.md` is reviewed
- **THEN** each hypothesis verdict SHALL cite at least one metric value from the sweep table
