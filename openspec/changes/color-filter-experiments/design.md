---
name: "Studio Draftboard — Experimental Colour Filters"
colors:
  primary: "#171717"
  background: "#fafafa"
  surface: "#ffffff"
  text:
    primary: "#171717"
    muted: "#525252"
  border: "#e5e5e5"
  status:
    warning: "#a16207"
typography:
  fontFamily:
    sans: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
    mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace"
  scale:
    control: "0.78rem (12.5px), weight 500"
    caption: "0.72rem (11.5px), weight 500, mono for values"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
rounded:
  md: "9px"
  lg: "12px"
---

## 1. Visual Overview & Philosophy

- **Aesthetic Tone**: Reuses the existing Studio Draftboard chrome. The filters live in one collapsed section inside the Settings popover so the blank canvas stays quiet; nothing new appears on the stage except one dismissible status line when a filter is active.
- **Target Surfaces**: Desktop (`>= 768px`) and mobile (`< 768px`) web viewports.
- **Visual References**: `DESIGN.md`, `src/styles/tokens.css`, and the existing Settings popover and status-line components. No new tokens, colours, fonts, or layouts are introduced.

---

## 2. Color System & Contrast Rationale

All colours reuse existing tokens (`--ink`, `--ink-muted`, `--line`, `--surface-popover`, `--surface-subtle`, `--surface-active`, `--status-warning`). The banner text uses the existing quiet status-line colour pair; control labels use `--ink` on `--surface-popover` (`17.9:1`, AAA) and values/captions use `--ink-muted` (`7.9:1`, AAA).

---

## 3. Typography Hierarchy

| Level | Font Family | Size | Weight | Intended Usage |
| :--- | :--- | :--- | :--- | :--- |
| `Section eyebrow` | Sans | `11px` | `600`, `0.08em` tracked, uppercase | `COLOR FILTERS (EXPERIMENTAL)` summary |
| `Control label` | Sans | `12.5px` | `500` | `Chroma`, `R`, `G`, `B`, `Black point`, `Match metric`, `Error limit` |
| `Value readout` | Mono | `11.5px` | `500` | Current range values (`0.85`, `1.15`, `25`) |
| `Caption` | Sans | `11.5px` | `500` | Lock caption and banner text |

---

## 4. Component Anatomy & States

### Component: `FiltersSection` (`[data-ui="filters-section"]`)
- **Visual Hierarchy & Placement**: A `<details>` block at the bottom of the existing Settings popover, closed by default, separated by the existing `1px var(--line)` hairline. Summary row shows the eyebrow label plus a small `Custom` / preset name on the right.
- **Rows**: preset select; `Match metric` select; `Error limit` select; `Chroma` range; `R`, `G`, `B` gain ranges; `Black point` range; `Reset filters` button (existing secondary `.btn`). Each range row is label, range, value readout.
- **Component States**:
  - **Default / Idle**: neutral values, preset reads `None (baseline)`.
  - **Hover / Focus**: existing control hover (`--surface-subtle`) and focus (`outline: 2px solid var(--ink); outline-offset: 2px`).
  - **Active (any non-default)**: summary shows the preset name or `Custom`; `Reset filters` enabled.
  - **Disabled / Locked** (`doneCount > 0`): controls use the existing disabled style (`opacity: 0.45; cursor: not-allowed`) with one `Caption` line explaining the lock.

### Component: `FiltersBanner` (`[data-ui="filters-banner"]`)
- **Placement**: One dismissible line in the existing banner stack below the top pills (same component and stagger as the read-only and pipeline-notice lines); never overlays the grid.
- **Text**: `Experimental colour filters are on: preview only. Marking cells and PDF export are disabled; filters reset on reload.`
- **States**: Visible while filters are active; dismiss hides it until the next filter change; hidden when filters return to defaults.

### Existing components touched (behaviour only, no new styling)
- **`Export PDF`**: existing disabled style, `title` explains `Disabled while experimental colour filters are active`.
- **`Mark Done / Undo`**: existing disabled style while filters are active.
- **Inspector hint**: text becomes `Experimental filters — clicks inspect only`.

---

## 5. Responsive Layout & Breakpoints

| Viewport | Breakpoint | Layout Pattern | Sizing Rules |
| :--- | :--- | :--- | :--- |
| **Desktop** | `>= 768px` | Section inside the `260px` popover | Range rows fit one line: label `56px`, range flexible, value `36px` |
| **Mobile** | `< 768px` | Same section, popover width per existing rules | Selects, `Reset filters`, and range thumbs have `>= 44px` touch height |

---

## 6. Interaction, Motion & Sound

- **Transitions**: existing `150ms` control transitions only; the `<details>` open/close is not animated.
- **Feedback**: moving a range recomputes the grid through the existing latest-wins path; the existing `Updating…` caption shows while a run is pending (relevant for `CIEDE2000`).
- **Audio Affordance**: Silent.

---

## 7. Do's and Don'ts

- **DO** keep the section collapsed by default and keep the stage free of new controls.
- **DO** show the current value of every range.
- **DO** use only existing tokens and component styles.
- **DON'T** add presets, controls, or colours that are not in the specs.
- **DON'T** present the filters as a recommended fix; the label stays `experimental`.
