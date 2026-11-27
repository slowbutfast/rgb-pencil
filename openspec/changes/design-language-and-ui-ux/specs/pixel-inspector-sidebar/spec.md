## ADDED Requirements

### Requirement: Unobstructed right-hand inspector column
Pixel inspection details SHALL render in a dedicated right-hand sidebar (`256px` wide on desktop) rather than a floating tooltip over the canvas, ensuring that hovered pixel information NEVER covers any portion of the grid.

#### Scenario: Hovering any pixel never obscures neighboring cells
- **WHEN** the user hovers over any cell on the grid (including cells near the right or top edges)
- **THEN** all inspection data SHALL update strictly within the right-hand sidebar and zero floating overlays SHALL appear over the grid canvas

### Requirement: Live 3-stripe inspection readout
When a logical pixel cell `(col, row)` is hovered (or tapped on touchscreens), the sidebar SHALL display:
1. 1-based coordinate (`X<col+1>, Y<row+1>`) and status pill (`To Do` or `Completed`).
2. A dark-framed visual preview of the 3 vertical RGB stripes (`R`, `G`, `B`) rendered in the active pencil palette's colors for their matched states.
3. Side-by-side **Target** (contrast-boosted pixel) and **Mix** (optical linear average) color swatches.
4. Three explicit channel rows (`R`, `G`, `B`) displaying the channel badge, shading state symbol (`□`, `●`, `◐`, `◑`, `■`), and human-readable state name (`White Paper`, `Full Color`, `Light Black`, `Heavy Black`, `Solid Black`).
5. The pixel's CIELAB `ΔE` color error readout and a contextual click hint (`Click cell to mark done` or `Click cell to undo`).

#### Scenario: Hovering an uncompleted pixel populates all inspector fields
- **WHEN** the user hovers over an uncompleted logical pixel `(12, 8)`
- **THEN** the sidebar SHALL display `X12, Y8`, status `To Do`, 3 vertical colored stripe bars matching the pixel's `ri/gi/bi` states, Target and Mix swatches, all 3 state labels and symbols, `ΔE`, and `Click cell to mark done`

#### Scenario: Clicking a hovered pixel updates the sidebar status immediately
- **WHEN** the user clicks the currently hovered pixel `(12, 8)` to mark it completed
- **THEN** the sidebar status pill SHALL immediately switch to `Completed` and the hint SHALL update to `Click cell to undo`

### Requirement: Quiet empty state and persistent 5-state legend
Before any cell is hovered, the sidebar SHALL display a concise instructional empty state. Regardless of hover state, the bottom of the sidebar SHALL display a compact reference legend for all 5 shading states (`□`, `●`, `◐`, `◑`, `■`).

#### Scenario: Initial load shows empty state and 5-state legend
- **WHEN** the application loads and the user has not yet hovered any grid cell
- **THEN** the sidebar SHALL display the instructional empty state message and the 5-state symbol legend without layout jump when the first cell is hovered
