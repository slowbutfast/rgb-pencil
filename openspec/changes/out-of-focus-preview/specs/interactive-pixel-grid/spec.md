## MODIFIED Requirements

### Requirement: Pixel Grid and Stripes view mode toggle
The top-right floating pill SHALL provide a single compact view-mode dropdown button (`Pixel Grid ▾`, `Stripes ▾`, or `Squint ▾`) displaying the active mode and opening a fixed-order 3-item `role="menuitemradio"` menu (`Pixel Grid`, `Stripes`, `Squint`) with `aria-checked` and JS-synchronized `aria-expanded`. Pointer devices that match `(hover: hover) and (pointer: fine)` SHALL open/close the menu on hover without conflicting click-toggle; other devices SHALL toggle on tap; keyboard users SHALL navigate with `ArrowUp`/`ArrowDown` roving focus and dismiss with `Escape` returning focus to the trigger. While open, the menu SHALL also close on any pointer press outside it (without consuming that press, so the press still reaches its target) and when keyboard focus moves to an element outside it; keyboard activation of an option SHALL return focus to the trigger. `Pixel Grid` (contrast-boosted source colors) and `Stripes` (3 vertical RGB pencil stripes per cell) SHALL preserve completed-cell desaturation, while `Squint` mode (`effectiveMode === 'squint'`) SHALL preview the full matched artwork with UI grid lines, X/Y axes, and the hover ring suppressed and every completion path blocked (see `squint-preview`).

#### Scenario: Dropdown shows all three views in fixed order with active checkmark
- **WHEN** the user hovers (desktop) or taps (touch) `[data-ui="view-mode-trigger"]`
- **THEN** `[data-ui="view-mode-dropdown"]` SHALL open with `aria-expanded="true"` and display `Pixel Grid`, `Stripes`, and `Squint` in that exact order with `aria-checked="true"` on the active mode

#### Scenario: Switching to Stripes view renders RGB subpixels
- **WHEN** the user selects `Stripes` from the view-mode dropdown
- **THEN** each logical pixel cell SHALL render its 3 matched vertical colored pencil stripes (`R`, `G`, `B`) while keeping completed cells desaturated

#### Scenario: Selecting a view updates the trigger label and blurs the trigger
- **WHEN** the user selects `Squint` from the dropdown via pointer
- **THEN** `viewMode` SHALL update to `'squint'`, the trigger label SHALL display `Squint`, the dropdown SHALL close with `aria-expanded="false"`, and the trigger SHALL blur so a subsequent `Space` peek is not swallowed by a focused button

#### Scenario: Pressing outside the open dropdown closes it
- **WHEN** the dropdown is open and the user presses the pointer on any element outside `[data-ui="view-mode-menu"]`
- **THEN** the dropdown SHALL close with `aria-expanded="false"` and the press SHALL still reach its target

#### Scenario: Moving keyboard focus out of the menu closes it
- **WHEN** the dropdown is open and keyboard focus moves to an element outside the menu
- **THEN** the dropdown SHALL close; a focus change with no destination element SHALL NOT close it, so a press on an option is never lost

#### Scenario: Keyboard selection returns focus to the trigger
- **WHEN** the user activates an option with Enter or Space
- **THEN** `viewMode` SHALL update, the dropdown SHALL close, and focus SHALL return to `[data-ui="view-mode-trigger"]`

#### Scenario: Squint mode hides graph-paper cues and ignores cell completion
- **WHEN** `effectiveMode` is `'squint'`
- **THEN** the canvas SHALL hide X/Y axis labels, grid lines, and hover rings, render the linear-light blurred preview of the full artwork, use a `default` cursor, and ignore pointer clicks and drags for cell completion
