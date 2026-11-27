# pdf-export Specification

## Purpose
Defines the client-side multi-page PDF drawing guide — legend, tiled symbol chart, column checklist, optional true-to-scale template — and the unobtrusive export UI states.

## Requirements

### Requirement: Single unobtrusive Export PDF action
The top-right floating pill SHALL contain one `Export PDF` button. It SHALL be disabled while no `MatchedGrid` exists or while a pipeline run is pending, SHALL show a busy state while a PDF is being generated, and SHALL NOT open a modal or add any other persistent control to the canvas.

#### Scenario: Disabled before a grid exists
- **WHEN** the application has no `MatchedGrid`
- **THEN** the `Export PDF` button SHALL be disabled

#### Scenario: Disabled while the grid is recomputing
- **WHEN** a pipeline request is in flight or pending
- **THEN** the `Export PDF` button SHALL be disabled so the PDF is never built from a stale grid

#### Scenario: Export triggers a download
- **WHEN** the user clicks `Export PDF` with a valid grid
- **THEN** the browser SHALL download a file named `rgb-pencil-guide-<cols>x<rows>.pdf`

### Requirement: Export options live in the Settings popover
Export options SHALL be exposed in the collapsed-by-default Settings popover: page size (`A4` default, or `US Letter`), `Include faint template` (default off), and template cell size in millimetres (default `6`, range `4–12`).

#### Scenario: Defaults apply on first export
- **WHEN** the user exports without changing any option
- **THEN** the PDF SHALL use A4, SHALL NOT contain template pages, and SHALL use a `6` mm template cell size if the template is later enabled

### Requirement: Valid multi-page PDF generated client-side
`exportGuidePdf(grid, palette, options)` SHALL return a `Uint8Array` of a valid PDF generated with `pdf-lib`, beginning with the bytes `%PDF-`, with no network access. Page order SHALL be: (1) legend and summary page, (2) symbol chart tiles, (3) column RLE checklist pages, (4) faint template pages if enabled. The call SHALL be asynchronous and SHALL yield to the event loop between pages so the UI stays responsive.

#### Scenario: Output is a PDF
- **WHEN** `exportGuidePdf` is called for a `56 × 42` grid
- **THEN** the first five bytes of the result SHALL be `%PDF-` and re-loading it with `PDFDocument.load` SHALL succeed

#### Scenario: Page order is stable
- **WHEN** a PDF is generated with the template enabled
- **THEN** page 1 SHALL be the legend, followed by all chart tiles, then all checklist pages, then all template pages

#### Scenario: Template omitted by default
- **WHEN** `includeTemplate` is `false`
- **THEN** the PDF SHALL contain no template pages

### Requirement: Legend and summary page
Page 1 SHALL show the grid dimensions, stripe column count, pencil palette name, the five shading-state symbols with their names, and the per-state stripe counts from `summariseStates`.

#### Scenario: Legend lists all five states
- **WHEN** the legend page is generated
- **THEN** it SHALL list `White Paper`, `Full Color`, `Light Black`, `Heavy Black`, and `Solid Black` with their symbols and counts

### Requirement: Vector-drawn state symbols
State symbols in the PDF SHALL be drawn as vector shapes (empty square, filled circle, half-filled circle, three-quarter-filled circle, filled square) and SHALL NOT depend on any font glyph coverage, so they print identically on every viewer and printer.

#### Scenario: Export succeeds with only standard fonts
- **WHEN** a PDF is generated embedding only `pdf-lib` standard fonts
- **THEN** generation SHALL complete without an encoding error even though `□ ● ◐ ◑ ■` are not encodable in those fonts

### Requirement: Tiled symbol chart with absolute indices
The symbol chart SHALL be split using `paginateChart` sized to the printable area of the chosen page, drawing each cell as three adjacent symbols (R, G, B) and labelling every column and row with its absolute 1-based index. Each tile page SHALL state its tile position (for example `Tile 2 of 6`) and its column and row range.

#### Scenario: Tile indices are absolute
- **WHEN** a tile covers columns `20..39`
- **THEN** its column labels SHALL read `21` through `40`, not `1` through `20`

#### Scenario: No tile overflows the page
- **WHEN** charts are generated for A4 and US Letter
- **THEN** every drawn cell SHALL lie inside the page's printable margins

### Requirement: Column RLE checklist
The checklist SHALL render every `ColumnInstruction` as one entry titled with its logical column (1-based) and channel (`X12 · G`), listing runs as `rows <start>–<end>: <symbol> <state name>` with an empty checkbox per run. Entries SHALL flow across pages in ascending stripe column order and SHALL NOT be split across pages, except when a single entry is taller than one full page (possible for tall portrait grids), in which case it SHALL continue on the next page under a repeated `(cont.)` title.

#### Scenario: Every stripe column appears once
- **WHEN** the checklist is generated for a `56 × 42` grid
- **THEN** it SHALL contain exactly `168` entries in ascending stripe column order

#### Scenario: Entries are not split across pages
- **WHEN** an entry does not fit in the remaining space of a page but fits on a fresh page
- **THEN** the whole entry SHALL start on the next page

#### Scenario: Oversized entry continues with a repeated title
- **WHEN** a stripe column has more runs than fit on one page (for example `288` alternating runs)
- **THEN** the entry SHALL continue on the following page(s) under its title followed by `(cont.)` and no run SHALL be lost or duplicated

### Requirement: Optional true-to-scale faint template
When enabled, template pages SHALL draw the grid at the configured cell size in millimetres (`1 mm = 72 / 25.4` PDF points), with each cell split into three equal stripe columns, light-grey stripe guides, a darker outer border, every fifth line emphasised, and a printed scale note. Grids larger than one page SHALL be tiled with `paginateChart` and carry corner registration marks and tile labels.

#### Scenario: Cell width matches configuration
- **WHEN** the template cell size is `6` mm
- **THEN** each drawn cell SHALL be `6 × 72 / 25.4 ≈ 17.01` PDF points wide

#### Scenario: Large grid spans multiple template pages
- **WHEN** a `96 × 72` grid is exported at `6` mm on A4
- **THEN** more than one template page SHALL be produced and each SHALL show registration marks and its tile label

### Requirement: Export failure handling
If PDF generation throws, the application SHALL show a quiet, dismissible inline error near the pill, SHALL re-enable the `Export PDF` button, and SHALL NOT alter the grid or completed cells.

#### Scenario: Failure leaves state intact
- **WHEN** `exportGuidePdf` rejects
- **THEN** the grid, completed cells, and progress counter SHALL be unchanged and the button SHALL be enabled again
