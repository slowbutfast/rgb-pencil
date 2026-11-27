## MODIFIED Requirements

### Requirement: Whisper-quiet floating pill controls and collapsed settings
Primary utility controls (`Upload Image`, progress counter, `Reset`, the single animated view-mode dropdown trigger `Pixel Grid ▾` / `Stripes ▾` / `Squint ▾`, `Settings`, `Export PDF`, and save status) SHALL live in compact translucent pill groups floating at the top corners of the canvas area. All secondary pipeline controls SHALL remain hidden inside the collapsible **Settings** popover by default, and the contextual Focus slider pill (`Sharp` – `Squint`) SHALL appear at the bottom-center of `#stage` only when explicit `Squint` mode is active.

#### Scenario: Initial load presents an uncluttered canvas with single view button
- **WHEN** the user opens the application
- **THEN** the top-right pill SHALL display a single view-mode dropdown button (`Pixel Grid ▾`), the Settings popover SHALL be closed by default, no persistent multi-card sidebar or modal SHALL obstruct the centered pixel grid, and the contextual Focus slider pill SHALL be hidden

#### Scenario: Outside click closes settings popover
- **WHEN** the Settings popover is open and the user clicks outside the popover and its trigger button
- **THEN** the Settings popover SHALL close cleanly

#### Scenario: View-mode dropdown animates smoothly and respects reduced motion
- **WHEN** the view-mode dropdown opens on hover or tap
- **THEN** the panel SHALL animate in over `150ms` (`opacity` and `translateY`) with subtle staggered option reveals (`0ms`, `25ms`, `50ms`), and all transition durations and delays SHALL collapse to `0ms` when `prefers-reduced-motion: reduce` is active
