---
version: alpha
name: Studio Draftboard
description: Ultra-minimalist blank-canvas design system for the RGB Colored Pencil Optical Mixing Grid — a quiet drafting table where the contrast-boosted pixel grid is the sole visual hero and an unobstructed right-hand instrument column reports exact RGB stripe states.
---

# DESIGN.md — Studio Draftboard

## Overview

A Swiss drafting table meets an archival printmaker's light-box. The user is an artist sitting with graph paper, a ruler, and red, green, blue, and black colored pencils, translating a photograph into thousands of vertical optical-mixing stripes.

The interface's job is to disappear. The artwork's contrast-boosted pixel grid sits alone on a calm off-white blank canvas (`{colors.canvas}`), ringed only by crisp hairline coordinates and whisper-quiet translucent pills at the top corners. All pixel inspection data lives in a dedicated pure-white instrument column on the right (`{colors.surface}`), separated by a single `1px` architectural hairline, so no floating tooltip or modal ever covers a single neighboring cell.

Nothing in this workspace competes with the artwork's color. All chrome is strictly monochrome neutral; red, green, and blue appear only on the three `R` / `G` / `B` channel badges and inside the artwork itself.

## Colors

```yaml
colors:
  primary: "#171717"
  primary-hover: "#333333"
  on-primary: "#FFFFFF"
  secondary: "#525252"
  canvas: "#FAFAFA"
  surface: "#FFFFFF"
  surface-subtle: "#F0F0F0"
  surface-active: "#ECECEC"
  surface-pill: "rgba(255, 255, 255, 0.9)"
  surface-popover: "rgba(255, 255, 255, 0.97)"
  swatch-stage: "#141414"
  on-swatch-stage: "#D4D4D4"
  border: "#E5E5E5"
  status-todo-bg: "#F3F4F6"
  status-todo-text: "#525252"
  status-done-bg: "#DCFCE7"
  status-done-text: "#15803D"
  channel-red: "#B91C1C"
  channel-green: "#15803D"
  channel-blue: "#1D4ED8"
```

The palette is a disciplined monochrome neutral hierarchy plus three utilitarian pigment markers reserved strictly for the `R`, `G`, and `B` stripe channels:

- **Graphite Ink (`{colors.primary}`):** Primary ink for typography, active axis coordinates, outer grid frame, and the sole filled primary action (`Upload Image`). Softens to `{colors.primary-hover}` on hover, with crisp `{colors.on-primary}` labels (`17.9:1` AAA contrast).
- **Slate Muted (`{colors.secondary}`):** Secondary ink for progress counters (`0 / 2352 done`), setting labels, `ΔE` readouts, and legend descriptions (`7.9:1` AAA contrast on `{colors.surface}`).
- **Drafting Paper (`{colors.canvas}`):** The blank-canvas foundation (`#FAFAFA`) behind the centered pixel grid — softer than pure white so pure-white highlights in the artwork and the pure-white right sidebar read as distinct planes.
- **Gallery White (`{colors.surface}`):** Pure white for the unobstructed right inspector column and frosted floating controls (`{colors.surface-pill}`, `{colors.surface-popover}`).
- **Hairline Rule (`{colors.border}`):** `1px` architectural dividers separating the canvas stage from the inspector sidebar, outlining pill groups, and framing channel rows.
- **Darkroom Swatch Stage (`{colors.swatch-stage}`):** A deep neutral obsidian well inside the right sidebar that frames the 3 vertical RGB stripe bars and Target vs. Mix swatches so the simulated screen-glow contrast reads accurately against dark borders.
- **Completion Status (`{colors.status-done-bg}` / `{colors.status-done-text}`):** Quiet botanical green pill indicating a completed cell, paired with neutral `{colors.status-todo-bg}` / `{colors.status-todo-text}` for unfinished cells.
- **Channel Badges (`{colors.channel-red}`, `{colors.channel-green}`, `{colors.channel-blue}`):** High-contrast pigment badges (`>= 4.5:1` with `{colors.on-primary}` text) used exclusively on the `R`, `G`, and `B` square markers in the right inspector.

## Typography

```yaml
typography:
  coord:
    fontFamily: "JetBrains Mono"
    fontSize: 17px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.01em
  state-label:
    fontFamily: "Inter"
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.25
  control:
    fontFamily: "Inter"
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.2
  body-sm:
    fontFamily: "Inter"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.55
  mono-data:
    fontFamily: "JetBrains Mono"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.4
  eyebrow:
    fontFamily: "Inter"
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0.08em
  axis-tick:
    fontFamily: "JetBrains Mono"
    fontSize: 10px
    fontWeight: 500
    lineHeight: 1.0
```

A strict two-voice typographic pairing balances calm readability with drafting-table precision:

- **Inter** carries all human-readable UI labels: floating pill actions (`{typography.control}`), shading state names (`{typography.state-label}`), instructional copy (`{typography.body-sm}`), and uppercase tracked section eyebrows (`{typography.eyebrow}`).
- **JetBrains Mono** carries all tabular numeric and coordinate data: the active pixel coordinate header (`{typography.coord}`, e.g. `X24, Y18`), progress readouts, `ΔE` metrics, symbol sub-labels (`{typography.mono-data}`), and canvas X/Y axis numbers (`{typography.axis-tick}`). Fixed-width numerals guarantee zero horizontal jitter as the artist scrubs across a `56 × 42` grid.

## Layout

```yaml
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  sidebar-width: 256px
  popover-width: 260px
  pill-inset-top: 16px
  pill-inset-x: 20px
  axis-pad-left: 34px
  axis-pad-top: 28px
  touch-min: 44px
```

The application is a locked `100vw × 100vh` two-column studio shell on desktop (`>= 768px`):

- **Left Blank-Canvas Stage (`1fr`):** Centers the HiDPI `<canvas>` pixel grid with generous breathing room (`64px` top clearance for the floating pills, `24px` horizontal padding, `36px` bottom clearance). The grid auto-scales its cell size to fit the entire `56 × 42` (or user-selected `16–96 px` wide) grid plus X/Y axes inside the viewport without clipping.
- **Right Inspector Sidebar (`{spacing.sidebar-width}`):** Fixed `256px` column anchored to the right edge (`border-left: 1px solid {colors.border}`), vertically distributing the active inspector at the top and the quiet 5-state legend at the bottom. Zero inspector UI ever overlaps the pixel grid.
- **Mobile Breakpoint (`< 768px`):** Transitions to a single-column stacked layout where the grid stage occupies the upper area and the inspector docks as a compact bottom panel without covering grid cells. Interactive controls enforce a `{spacing.touch-min}` (`44px`) minimum touch target.

## Elevation & Depth

Depth is communicated almost entirely through **tonal plane separation** and **1px hairlines**, never heavy shadows:

- **Plane 0 — Canvas Substrate (`{colors.canvas}`):** Recessed `#FAFAFA` workspace holding the centered artwork grid.
- **Plane 1 — Instrument Column (`{colors.surface}`):** Pure white `#FFFFFF` right sidebar separated by a single `1px solid {colors.border}` vertical rule (zero drop shadow).
- **Plane 2 — Floating Pill Chrome (`{colors.surface-pill}`):** Translucent white with `backdrop-filter: blur(10px)`, `1px solid {colors.border}`, and a barely perceptible whisper shadow (`0 2px 12px rgba(0, 0, 0, 0.04)`).
- **Plane 3 — Settings Popover (`{colors.surface-popover}`):** Collapsed by default; opens with `backdrop-filter: blur(12px)`, `1px solid {colors.border}`, and a soft elevation shadow (`0 12px 36px rgba(0, 0, 0, 0.08)`) anchored cleanly to the canvas top-right.

## Shapes

```yaml
rounded:
  xs: 4px
  sm: 6px
  md: 9px
  lg: 12px
  xl: 14px
  full: 9999px
```

The shape language contrasts **razor-sharp artwork geometry** against **softly machined tool chrome**:

- **The Pixel Grid itself is strictly square (`0px` radius):** Crisp `1px` internal grid lines (`rgba(255, 255, 255, 0.2)`), emphasized 5-cell reference lines (`rgba(255, 255, 255, 0.45)`), and a `1.25px` `{colors.primary}` outer frame.
- **Floating Top Bar & Status Badges:** Full capsule pills (`{rounded.full}`) that feel light and unobtrusive over the blank canvas.
- **Inspector Cards & Popover:** Machined corners — `{rounded.xl}` (`14px`) for the Settings popover, `{rounded.lg}` (`12px`) for the darkroom 3-stripe swatch card, `{rounded.md}` (`9px`) for individual `R`/`G`/`B` channel rows, `{rounded.sm}` (`6px`) for channel square badges, and `{rounded.xs}` (`4px`) for individual vertical stripe bars and miniature swatches.

## Motion & Micro-interaction

Interactions are immediate, mechanical, and quiet — built for scrubbing across thousands of dense cells without visual fatigue:

- **Button & Pill Feedback:** `150ms ease` for background and text color shifts on hover and active states.
- **Stripe Bar Scrubbing:** `60ms linear` on the 3 vertical stripe preview bars in the right sidebar so sweeping the cursor across the grid feels fluid without lagging behind the pointer.
- **Canvas Direct Manipulation:** Zero animation delay (`0ms`) on `<canvas>` hover highlights, `crosshair` cursor switching (`crosshair` strictly over valid pixel cells, `default` over axis margins), and click/drag cell completion painting (immediate desaturation to muted gray + subtle diagonal hatch).
- **Reduced Motion:** Respect `prefers-reduced-motion: reduce` by collapsing all CSS transitions to `0ms`.

## Voice & Content Strategy

Microcopy is terse, matter-of-fact, and studio-oriented — zero marketing filler, zero exclamation marks, zero toast spam on routine clicks:

- **Actions:** `Upload Image`, `Reset`, `Pixel Grid`, `Stripes`, `Settings`.
- **Status & Coordinates:** `X24, Y18`, `To Do`, `Completed`, `12 / 2352 done`, `ΔE 4.2`.
- **Shading States (exact canonical vocabulary):** `□ White Paper`, `● Full Color`, `◐ Light Black`, `◑ Heavy Black`, `■ Solid Black`.
- **Contextual Hints:** `Click cell to mark done` / `Click cell to undo`, and quiet footer meta `56 × 42 grid (7,056 stripes) · Click (or drag) cells to mark done / undo · Drop any image`.

## Components

```yaml
components:
  canvas-stage:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.primary}"
    padding: "{spacing.lg}"
  inspector-sidebar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    width: "{spacing.sidebar-width}"
    padding: "{spacing.lg}"
  pill-bar:
    backgroundColor: "{colors.surface-pill}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: "{spacing.xs}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.control}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.control}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  button-ghost-hover:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.primary}"
  button-ghost-active:
    backgroundColor: "{colors.surface-active}"
    textColor: "{colors.primary}"
  settings-popover:
    backgroundColor: "{colors.surface-popover}"
    textColor: "{colors.primary}"
    width: "{spacing.popover-width}"
    rounded: "{rounded.xl}"
    padding: "{spacing.md}"
  stripe-swatch-card:
    backgroundColor: "{colors.swatch-stage}"
    textColor: "{colors.on-swatch-stage}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  channel-row:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.primary}"
    typography: "{typography.state-label}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm}"
  channel-badge-red:
    backgroundColor: "{colors.channel-red}"
    textColor: "{colors.on-primary}"
    typography: "{typography.mono-data}"
    rounded: "{rounded.sm}"
    size: 22px
  channel-badge-green:
    backgroundColor: "{colors.channel-green}"
    textColor: "{colors.on-primary}"
    typography: "{typography.mono-data}"
    rounded: "{rounded.sm}"
    size: 22px
  channel-badge-blue:
    backgroundColor: "{colors.channel-blue}"
    textColor: "{colors.on-primary}"
    typography: "{typography.mono-data}"
    rounded: "{rounded.sm}"
    size: 22px
  status-pill-todo:
    backgroundColor: "{colors.status-todo-bg}"
    textColor: "{colors.status-todo-text}"
    typography: "{typography.eyebrow}"
    rounded: "{rounded.full}"
    padding: "{spacing.xs}"
  status-pill-done:
    backgroundColor: "{colors.status-done-bg}"
    textColor: "{colors.status-done-text}"
    typography: "{typography.eyebrow}"
    rounded: "{rounded.full}"
    padding: "{spacing.xs}"
  sidebar-divider:
    backgroundColor: "{colors.border}"
    width: 1px
  inspector-caption:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.secondary}"
    typography: "{typography.body-sm}"
```

- **Minimal Top Bar (`pill-bar`, `button-primary`, `button-ghost`):** Two translucent capsule groups floating at top-left (`Upload Image`, `done / total`, `Reset`) and top-right (`Pixel Grid`, `Stripes`, `Settings`). Implemented in `src/ui/topBar.ts`.
- **Interactive Pixel Grid Canvas (`canvas-stage`):** HiDPI HTML5 `<canvas>` centered on `{colors.canvas}` with adaptive X/Y axis ticks, double-stroke hover ring (`2px #ffffff` + `1px #171717`), `crosshair` cursor on cells (`default` on margins), desaturated + hatched completed cells, and click-and-drag state painting. Implemented in `src/ui/gridCanvas.ts`.
- **Right Inspector Sidebar (`inspector-sidebar`, `stripe-swatch-card`, `channel-row`, `channel-badge-*`, `status-pill-*`):** Fixed `256px` right column displaying `(X, Y)` coordinate, status pill, 3 tall vertical RGB stripe bars on `{colors.swatch-stage}` with Target vs. Mix swatches, 3 bordered channel rows, `ΔE`, and the persistent bottom 5-state legend. Implemented in `src/ui/inspectorSidebar.ts`.
- **Settings Popover (`settings-popover`):** Collapsed by default; reveals sample scene chips (`Tree`, `Sunset`, `Orbs`), `Grid Width` (`16–96 px`, default `56 px`), `Contrast Boost` (`1.00×–2.30×`, default `1.45×`), `Pencil Palette`, and `Floyd–Steinberg Dithering`. Closes on outside click. Implemented in `src/ui/settingsPopover.ts`.
- **Reference Prototype:** Verified visual parity target at `@playgrounds/minimal_grid_playground.html`.

## Do's and Don'ts

- **Do** keep the pixel grid completely unobstructed — all hovered pixel information lives in the right-hand inspector column (or bottom panel on mobile).
- **Do** render the grid, grid lines, axis ticks, and hover ring on a single HiDPI `<canvas>` so `56 × 42` through `96 × 72` grids stay at 60fps.
- **Do** use `crosshair` cursor strictly over valid pixel cells and revert to `default` over axis margins.
- **Do** desaturate completed cells into muted gray with a subtle diagonal hatch so unfinished colored cells stand out immediately, and allow one-click undo.
- **Do** preserve visual parity with `playgrounds/minimal_grid_playground.html` at `1280×800` and bind all styles to CSS custom properties in `src/styles/tokens.css`.
- **Don't** place floating tooltips or pop-ups over the grid canvas — they cover neighboring cells the artist is actively referencing.
- **Don't** re-introduce multi-card dashboards, decorative gradients, drop-shadowed cards, or marketing hero banners onto the blank canvas.
- **Don't** render grid cells as thousands of DOM `<div>` or `<td>` elements.
- **Don't** show the Settings popover open by default on initial page load.
- **Don't** use red, green, or blue anywhere in UI chrome outside the three `R` / `G` / `B` channel badges and the artwork itself.
