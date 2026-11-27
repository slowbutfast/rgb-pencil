# guide-builder Specification

## Purpose
Defines the pure, DOM-free derivation of per-stripe-column RLE instructions, shading-state summaries, and overlapping chart tiles used by the printable guide.

## Requirements

### Requirement: Per-stripe-column RLE instructions
`buildColumnInstructions(grid)` SHALL return exactly `3 × grid.cols` `ColumnInstruction` values ordered by stripe column index `k = 3c + ch`, where `c` is the logical column (0-based) and `ch` is `0` for R, `1` for G, `2` for B. Each instruction SHALL contain `stripeColumn`, `logicalColumn`, `channel`, and an ordered list of runs `{ state, startRow, length }` read top to bottom down that stripe column.

#### Scenario: Instruction count matches stripe columns
- **WHEN** `buildColumnInstructions` is called on a `56 × 42` grid
- **THEN** it SHALL return `168` instructions and instruction `k = 3 * 10 + 1` SHALL have `logicalColumn = 10` and `channel = 'G'`

#### Scenario: Channel is read from the right array
- **WHEN** a grid has `gi[r * cols + c] = 3` at `(c, r) = (2, 5)` and every other `gi` is `0`
- **THEN** the G instruction for column `2` SHALL contain a run `{ state: 3, startRow: 5, length: 1 }` and the R and B instructions for column `2` SHALL contain no run with `state = 3`

### Requirement: RLE runs are complete, ordered, and maximal
For every instruction, the runs SHALL cover rows `0 .. rows-1` exactly once with no gaps and no overlap, SHALL be in ascending `startRow` order, and SHALL be maximal: two adjacent runs SHALL never share the same `state`. Runs of `□ White Paper` SHALL be included so the checklist is complete.

#### Scenario: Runs reconstruct the original column
- **WHEN** the runs of every instruction are expanded back to per-row states
- **THEN** the result SHALL equal the original `ri` / `gi` / `bi` value at every `(column, row)`

#### Scenario: Uniform column yields one run
- **WHEN** a stripe column has the same state in all `42` rows
- **THEN** its instruction SHALL contain exactly one run with `startRow = 0` and `length = 42`

#### Scenario: Adjacent runs always differ
- **WHEN** instructions are built from a randomised grid
- **THEN** no instruction SHALL contain two consecutive runs with equal `state`

### Requirement: Overlapping paginated chart tiles
`paginateChart(cols, rows, tileCols, tileRows)` SHALL return an ordered list of rectangular tiles `{ colStart, colEnd, rowStart, rowEnd }` (inclusive, 0-based) in row-major tile order that together cover every cell, with adjacent tiles sharing exactly one repeated boundary column or row so they can be re-aligned. No tile SHALL exceed `tileCols × tileRows`. It SHALL reject non-positive tile sizes smaller than `2` in either dimension.

#### Scenario: Every cell is covered
- **WHEN** `paginateChart(56, 42, 20, 29)` is called
- **THEN** the union of all returned tiles SHALL contain every `(col, row)` for `0 ≤ col < 56` and `0 ≤ row < 42`

#### Scenario: Adjacent tiles overlap by exactly one line
- **WHEN** two horizontally adjacent tiles are returned
- **THEN** the second tile's `colStart` SHALL equal the first tile's `colEnd`

#### Scenario: Grid smaller than one tile yields a single tile
- **WHEN** `paginateChart(16, 12, 20, 29)` is called
- **THEN** exactly one tile `{ colStart: 0, colEnd: 15, rowStart: 0, rowEnd: 11 }` SHALL be returned

#### Scenario: Degenerate tile size is rejected
- **WHEN** `paginateChart(56, 42, 1, 29)` is called
- **THEN** it SHALL throw a `RangeError`

### Requirement: State usage summary
`summariseStates(grid)` SHALL return the count of stripe segments per `ShadingStateId` across R, G, and B (total `3 × cols × rows`) for use in the PDF legend page.

#### Scenario: Counts sum to total stripe segments
- **WHEN** `summariseStates` is called on a `56 × 42` grid
- **THEN** the five counts SHALL sum to `7,056`

### Requirement: Guide builder is pure and deterministic
`guideBuilder.ts` SHALL import no DOM, worker, React, or `pdf-lib` APIs and SHALL return identical output for identical input.

#### Scenario: Repeated calls are identical
- **WHEN** `buildColumnInstructions` is called twice on the same `MatchedGrid`
- **THEN** the two results SHALL deep-equal each other
