## Overview

**Status: Non-visual / Backend change.**
No user-facing components, layout, or styling affected.

### Inherited UI surface (no new visual decisions)

The persistence features surface through existing components using existing tokens from `design-language-and-ui-ux/design.md`. No new colors, type sizes, or layouts are introduced; the visual treatment of each item is deferred to that document.

- **Save status** is one quiet caption in the top bar (`Saving…`, `Saved`, or a persistent warning). It reuses the progress-readout caption style and the existing status warning/error colours. It never moves other controls.
- **Projects section** is a new section inside the existing Settings popover: a list of rows (thumbnail, name, `done / total`, updated time) with open, rename, and delete, plus `Export project`, `Import project`, and `Start new drawing from this image`.
- **Confirmations** (delete, contrast/dither change while cells are done, `Resume existing` vs `Start new copy`) are small inline confirmation rows inside the popover or pill, not full-screen modals.
- **Locked controls** (width, palette) use the existing disabled style plus a one-line muted caption.
- **Banners** (read-only in another tab, memory-only warning, backup nudge, pipeline-version notice, reload prompt) are single dismissible lines below the top pills, styled as the existing quiet status line. They never overlay the grid.
