# design-language Specification

## Purpose
Defines the visual and interaction design language of the minimalist studio workspace: design tokens, typography, floating pill chrome, responsive layout, and parity with the approved prototype.

## Requirements

### Requirement: Minimalist blank-canvas visual hierarchy
The application SHALL present a minimalist blank-canvas studio aesthetic built on centralized CSS custom properties (`src/styles/tokens.css`), using a soft neutral canvas background (`#fafafa`), pure-white inspector surfaces (`#ffffff`), hairline borders (`1px solid #e5e5e5`), high-contrast ink (`#171717`), and muted secondary ink (`#737373` / `#a3a3a3`).

#### Scenario: Design tokens govern all application surfaces
- **WHEN** the application loads in any modern browser
- **THEN** all backgrounds, borders, typography, and interactive controls SHALL derive their values from CSS custom properties defined in `src/styles/tokens.css` rather than ad-hoc hardcoded hex strings

### Requirement: Editorial sans and monospace typographic pairing
The application SHALL pair a clean geometric sans-serif (`Inter`, with system sans fallback) for UI labels with a tabular monospace font (`JetBrains Mono`, with system monospace fallback) for coordinates, progress readouts, ΔE values, and shading state symbols.

#### Scenario: Numeric coordinates and progress counters align cleanly
- **WHEN** the user hovers across different pixel coordinates (`X1, Y1` to `X56, Y42`) or increments the completed counter
- **THEN** coordinate labels and progress readouts SHALL render in `JetBrains Mono` without causing horizontal layout shift

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

### Requirement: Responsive unobstructed layout
On viewports `>= 768px` wide, the workspace SHALL use a two-column shell (`1fr` blank-canvas stage + `256px` fixed right inspector sidebar). On viewports `< 768px` wide, the inspector sidebar SHALL transition into a compact bottom inspector panel so the grid remains usable and unobstructed on mobile devices.

#### Scenario: Desktop viewport shows two-column unobstructed layout
- **WHEN** the viewport width is `>= 768px`
- **THEN** the pixel grid stage SHALL occupy the remaining left area and the inspector sidebar SHALL occupy a fixed `256px` right column separated by a `1px` hairline border

#### Scenario: Mobile viewport stacks inspector cleanly below the grid
- **WHEN** the viewport width is `< 768px`
- **THEN** the inspector SHALL dock below the grid stage without overlapping any grid cells

### Requirement: Visual parity with the approved prototype
The production application SHALL reuse the approved prototype's markup and styling (`playgrounds/minimal_grid_playground.html`), split into `index.html` and `src/styles/`, so that its visual output matches the prototype at the same viewport, scene, and settings.

#### Scenario: Built app matches the prototype side by side
- **WHEN** the built app and the prototype are opened at `1280×800` with the same sample scene and default settings
- **THEN** layout, colours, typography, pill chrome, grid, axis labels, inspector, and legend SHALL be visually indistinguishable

#### Scenario: Interaction modules do not generate competing markup
- **WHEN** the UI modules mount
- **THEN** they SHALL bind to existing `index.html` elements through `data-ui` attributes rather than re-creating the shell markup
