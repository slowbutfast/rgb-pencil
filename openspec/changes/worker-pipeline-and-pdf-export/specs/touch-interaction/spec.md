## ADDED Requirements

### Requirement: Tap inspects, never completes
On a `pointerdown` with `pointerType === 'touch'` over a grid cell, the application SHALL set that cell as the inspected cell and update the inspector, and SHALL NOT toggle its completed state. Touch dragging across the grid SHALL move the inspected cell without painting completion.

#### Scenario: Single tap inspects only
- **WHEN** the user taps an uncompleted cell `(10, 5)` with a finger
- **THEN** the inspector SHALL show `X10, Y5` with status `To Do` and the completed count SHALL NOT change

#### Scenario: Touch drag does not paint
- **WHEN** the user drags a finger across five cells
- **THEN** the inspector SHALL follow the finger and no cell SHALL be marked completed

### Requirement: Explicit Mark Done / Undo control
When the most recent pointer interaction on the grid was touch, the inspector SHALL show a single `Mark Done` button (or `Undo` when the inspected cell is already completed) that toggles the inspected cell. The button SHALL be at least `44 × 44` CSS pixels and SHALL live in the inspector, never over the grid. Mouse and pen interaction (click, drag-paint, re-click undo) SHALL be unchanged.

#### Scenario: Button completes the inspected cell
- **WHEN** a cell is inspected via touch and the user presses `Mark Done`
- **THEN** that cell SHALL be completed, the button label SHALL change to `Undo`, and the progress counter SHALL increment by `1`

#### Scenario: Button is absent for mouse use
- **WHEN** the most recent grid interaction was a mouse pointer
- **THEN** the `Mark Done / Undo` button SHALL NOT be shown

#### Scenario: Button has no effect without an inspected cell
- **WHEN** no cell has been inspected
- **THEN** the button SHALL NOT be rendered

### Requirement: No double-tap gesture or browser zoom interference
The grid canvas SHALL set `touch-action: none` so taps and drags are not interpreted as scroll or double-tap zoom, and the application SHALL NOT assign any behaviour to double-tap.

#### Scenario: Double-tap changes nothing
- **WHEN** the user double-taps a cell
- **THEN** the cell SHALL be inspected and its completed state SHALL be unchanged
