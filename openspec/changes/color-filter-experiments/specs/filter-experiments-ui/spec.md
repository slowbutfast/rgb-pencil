## ADDED Requirements

### Requirement: Experimental colour filters section in Settings
The Settings popover SHALL contain a collapsed-by-default `Color filters (experimental)` section with: a preset select; a `Match metric` select (`ΔE76 (current)`, `CIEDE2000`); an `Error limit` select (`Off`, `0.20`, `0.10`, `0.05`, `0.02`); a `Chroma` range (`0.5`–`1.5`, step `0.05`, default `1`); `R`, `G`, and `B` gain ranges (`0.6`–`1.4`, step `0.01`, default `1`); a `Black point` range (`0`–`40`, step `1`, default `0`); and a `Reset filters` button. Each range SHALL show its current value. The presets SHALL be: `None (baseline)` = `DEFAULT_FILTERS`; `Assessment: warm bias` = gains `[1.15, 0.80, 0.85]`, `blackPoint 25`, `chromaScale 1.2`; `Gamut-soft` = `chromaScale 0.85`, `errorLimit 0.10`, `metric de2000`; `CIEDE2000 only` = `metric de2000`; `Error limit only` = `errorLimit 0.10`. Selecting a preset SHALL set all controls; editing any control SHALL switch the preset select to `Custom`.

#### Scenario: Section is collapsed and neutral on first load
- **WHEN** the application loads and Settings is opened
- **THEN** the filters section SHALL be collapsed, every control SHALL show its default, and no filter SHALL be active

#### Scenario: Preset sets every control
- **WHEN** the user selects `Gamut-soft`
- **THEN** the controls SHALL read chroma `0.85`, error limit `0.10`, metric `CIEDE2000`, gains `1.00`, black point `0`, and a pipeline run SHALL be issued with those filters

#### Scenario: Editing a control marks the preset custom
- **WHEN** a preset is selected and the user moves the `Chroma` range
- **THEN** the preset select SHALL show `Custom`

### Requirement: Filters are transient session state
Filter values SHALL live only in the store, SHALL NOT be written to the project record, autosave, IndexedDB, or the `.rgbpencil.json` export, SHALL NOT mark the project dirty, and SHALL reset to `DEFAULT_FILTERS` (with a pipeline re-run if they were not default) when a new image loads, a project is opened or switched, a project is imported, a drawing is started from the current image, or the page reloads. Filter changes SHALL be allowed in read-only tabs (they only change the displayed grid).

#### Scenario: Reload restores the baseline
- **WHEN** filters are active and the page is reloaded
- **THEN** the filters SHALL be at defaults and the grid SHALL equal the baseline grid for that project

#### Scenario: Filters do not reach storage
- **WHEN** filters are active and an autosave and a project export occur
- **THEN** neither the stored record nor the exported file SHALL contain any filter value, and `updatedAt` SHALL NOT change because of a filter change alone

#### Scenario: Switching project resets filters
- **WHEN** filters are active and the user opens a different project
- **THEN** filters SHALL reset to defaults before the grid is shown

### Requirement: Preview-only gating while filters are active
While any filter differs from its default (`filtersActive`), the application SHALL block every completion path (click, drag-paint, and the touch `Mark Done / Undo` button, which SHALL render disabled), SHALL disable `Export PDF` (with a title explaining why), and SHALL show one dismissible quiet banner reading that filters are experimental, preview-only, and reset on reload. Inspector hover and touch inspection SHALL keep working and the inspector hint SHALL read `Experimental filters — clicks inspect only`. Squint and Stripes views SHALL work normally.

#### Scenario: Completion is blocked
- **WHEN** a filter is active and the user clicks, drags over, or taps `Mark Done` for a cell
- **THEN** the completed set and progress counter SHALL be unchanged

#### Scenario: PDF export is disabled
- **WHEN** a filter is active
- **THEN** `Export PDF` SHALL be disabled and SHALL become enabled again after `Reset filters`

#### Scenario: Inspection stays live
- **WHEN** a filter is active and the pointer hovers cell `(12, 8)`
- **THEN** the inspector SHALL show `X12, Y8` and the post-filter `Target` swatch

### Requirement: Filters are locked while cells are done
While `doneCount > 0`, the filter controls SHALL be disabled with a one-line caption explaining that filters change the matched stripes and are locked while cells are done; `Reset filters` SHALL remain a no-op. Unlocking SHALL follow the same rule as the geometry lock (all cells undone or reset).

#### Scenario: Controls lock after the first completed cell
- **WHEN** one cell is marked done
- **THEN** every filter control SHALL be disabled with the caption

#### Scenario: Controls unlock when progress is cleared
- **WHEN** the only completed cell is undone
- **THEN** the filter controls SHALL become enabled again

### Requirement: Pixel Grid and inspector show the filtered target
With filters active, the Pixel Grid view and the inspector `Target` swatch SHALL use `MatchedGrid.target` (the post-filter target), and the `Mix` swatch and Stripes view SHALL use the matched combo as before.

#### Scenario: Black-point gate is visible in Pixel Grid
- **WHEN** `blackPoint` is raised so that near-black cells are gated to `0`
- **THEN** those cells SHALL render as pure black in Pixel Grid view
