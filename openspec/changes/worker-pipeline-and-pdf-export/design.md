## Overview

**Status: Non-visual / Backend change.**
No user-facing components, layout, or styling affected.

### Inherited UI surface (no new visual decisions)

This change adds three small interaction affordances that reuse existing tokens and components from `design-language-and-ui-ux/design.md`; no new colors, type sizes, or layout patterns are introduced.

- **Export PDF** is one more button inside the existing top-right pill. States follow that pill's button states (default, hover, focus, active); disabled uses reduced opacity and `cursor: not-allowed`; busy shows the label `Exporting…` in place of `Export PDF`.
- **Export options** (page size, `Include faint template`, template cell size) are three rows inside the existing Settings popover, styled with the existing control scale.
- **Export error** is a single dismissible inline line in the existing muted/error status colours near the pill; no modal.
- **Mark Done / Undo** is one button in the inspector, `>= 44 × 44px`, using the inspector's existing control styling. It never overlays the grid.
- **Pipeline pending** is indicated only by the existing progress readout area (a quiet `Updating…` caption); the previous grid stays visible and interactive.
