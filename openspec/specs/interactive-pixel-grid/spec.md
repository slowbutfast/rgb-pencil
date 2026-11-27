# interactive-pixel-grid Specification

## Purpose
Defines the centered, contrast-boosted HTML5 canvas pixel grid and its hover, completion, view-mode, and progress-persistence behaviour.

## Requirements

### Requirement: Centered contrast-boosted pixel grid with crisp grid lines
The application SHALL render the downsampled, contrast-boosted logical pixel grid centered on the blank canvas stage using a `devicePixelRatio`-scaled HTML5 `<canvas>`, with crisp `1px` grid lines between every cell, emphasized reference lines every 5 cells, and a dark `1.25px` outer border.

#### Scenario: Default 4x dense grid renders on initial load
- **WHEN** the application loads with the default 4:3 sample scene
- **THEN** the grid SHALL default to `56` logical pixel columns wide (`56 × 42 = 2,352` logical pixels, `7,056` stripe segments) and fit proportionally within the available canvas stage without clipping

#### Scenario: Grid resizes cleanly on window resize
- **WHEN** the browser viewport is resized
- **THEN** the canvas cell size and backing store SHALL recalculate smoothly to keep the entire grid and axes crisp and centered

### Requirement: Adaptive X and Y axis markings with active coordinate highlight
The grid SHALL display 1-based X-axis column numbers along the top edge and Y-axis row numbers along the left edge with tick marks, adapting label spacing (`1`, `2`, or `5` cells) for dense grids so labels never overlap, while always bolding and highlighting the exact hovered `(X, Y)` coordinate and tick.

#### Scenario: Hovering a dense grid cell highlights its exact X and Y axis labels
- **WHEN** the user hovers over logical pixel `(23, 17)` on a `56 × 42` grid
- **THEN** the X-axis SHALL bold `23` with a darker tick mark, the Y-axis SHALL bold `17` with a darker tick mark, and adjacent non-hovered labels that would collide SHALL be suppressed

### Requirement: Crosshair cursor and active cell ring on hover
The canvas SHALL display a `crosshair` cursor whenever the pointer is over a logical pixel cell and a `default` cursor over the axis margins, rendering a high-contrast double-stroke selection ring around the hovered cell.

#### Scenario: Pointer enters and leaves the pixel grid cells
- **WHEN** the pointer moves over a valid logical pixel cell `(col, row)`
- **THEN** the canvas cursor SHALL be `crosshair` and a double-stroke highlight ring SHALL outline that cell
- **WHEN** the pointer moves outside the grid cells into the axis padding
- **THEN** the canvas cursor SHALL revert to `default` and the highlight ring SHALL disappear

### Requirement: Click-to-complete, drag-painting, and undo directly on the grid
Clicking a logical pixel cell SHALL toggle its completed state immediately on the grid; completed cells SHALL render heavily desaturated/grayed out with a subtle diagonal hatch so unfinished cells stay vivid. Re-clicking a completed cell SHALL undo completion and restore its vivid color. Clicking and dragging across adjacent cells SHALL paint the initial cell's new state (`done` or `undone`) smoothly across all crossed cells.

#### Scenario: Single click marks a pixel completed and grays it out
- **WHEN** the user clicks an uncompleted logical pixel cell `(10, 5)`
- **THEN** the cell SHALL be added to the completed set, render desaturated gray with a subtle diagonal hatch, and increment the top-bar progress readout by `1`

#### Scenario: Re-clicking a completed pixel undoes completion
- **WHEN** the user clicks an already completed logical pixel cell `(10, 5)`
- **THEN** the cell SHALL be removed from the completed set, restore its original contrast-boosted color, and decrement the top-bar progress readout by `1`

#### Scenario: Click-and-drag paints completion across multiple cells
- **WHEN** the user presses pointer down on an uncompleted cell and drags across 4 adjacent cells before releasing
- **THEN** all 5 cells SHALL be marked completed in one continuous gesture

#### Scenario: Reset button clears all completed cells
- **WHEN** the user clicks the `Reset` button in the top bar
- **THEN** all completed cells SHALL be cleared, all grid cells SHALL restore full color, and the progress readout SHALL display `0 / <total> done`

### Requirement: Pixel Grid and Stripes view mode toggle
The top-right floating pill SHALL provide a single compact view-mode dropdown button (`Pixel Grid ▾`, `Stripes ▾`, or `Squint ▾`) displaying the active mode and opening a fixed-order 3-item `role="menuitemradio"` menu (`Pixel Grid`, `Stripes`, `Squint`) with `aria-checked` and JS-synchronized `aria-expanded`. Pointer devices that match `(hover: hover) and (pointer: fine)` SHALL open/close the menu on hover without conflicting click-toggle; other devices SHALL toggle on tap; keyboard users SHALL navigate with `ArrowUp`/`ArrowDown` roving focus and dismiss with `Escape` returning focus to the trigger. `Pixel Grid` (contrast-boosted source colors) and `Stripes` (3 vertical RGB pencil stripes per cell) SHALL preserve completed-cell desaturation, while `Squint` mode (`effectiveMode === 'squint'`) SHALL preview the full matched artwork with UI grid lines, X/Y axes, and the hover ring suppressed and every completion path blocked (see `squint-preview`).

#### Scenario: Dropdown shows all three views in fixed order with active checkmark
- **WHEN** the user hovers (desktop) or taps (touch) `[data-ui="view-mode-trigger"]`
- **THEN** `[data-ui="view-mode-dropdown"]` SHALL open with `aria-expanded="true"` and display `Pixel Grid`, `Stripes`, and `Squint` in that exact order with `aria-checked="true"` on the active mode

#### Scenario: Switching to Stripes view renders RGB subpixels
- **WHEN** the user selects `Stripes` from the view-mode dropdown
- **THEN** each logical pixel cell SHALL render its 3 matched vertical colored pencil stripes (`R`, `G`, `B`) while keeping completed cells desaturated

#### Scenario: Selecting a view updates the trigger label and blurs the trigger
- **WHEN** the user selects `Squint` from the dropdown via pointer
- **THEN** `viewMode` SHALL update to `'squint'`, the trigger label SHALL display `Squint`, the dropdown SHALL close with `aria-expanded="false"`, and the trigger SHALL blur so a subsequent `Space` peek is not swallowed by a focused button

#### Scenario: Squint mode hides graph-paper cues and ignores cell completion
- **WHEN** `effectiveMode` is `'squint'`
- **THEN** the canvas SHALL hide X/Y axis labels, grid lines, and hover rings, render the linear-light blurred preview of the full artwork, use a `default` cursor, and ignore pointer clicks and drags for cell completion

### Requirement: Local persistence of completed cell progress
Completed cell progress SHALL persist across page reloads and browser restarts as part of the open project in the project store (IndexedDB), together with the project's image and settings, so reloading the page restores drawing progress automatically. Legacy `localStorage` progress written by earlier versions under `rgb-pencil:v1:<hash>` SHALL only be read once to seed a new project and then removed; it SHALL NOT be written.

#### Scenario: Page reload restores completed pixels
- **WHEN** the user marks 10 cells completed and reloads the browser page
- **THEN** those exact 10 cells SHALL remain marked completed and desaturated upon reload

#### Scenario: Legacy progress is adopted once
- **WHEN** a legacy `rgb-pencil:v1:<hash>` key matches a newly created project's source hash
- **THEN** its in-range cells SHALL seed the project and the legacy key SHALL be removed
