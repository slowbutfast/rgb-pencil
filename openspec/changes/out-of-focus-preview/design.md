---
name: "Studio Draftboard — View Switcher & Squint Preview"
colors:
  primary: "#171717"
  secondary: "#525252"
  background: "#fafafa"
  surface: "#ffffff"
  text:
    primary: "#171717"
    muted: "#525252"
  border: "#e5e5e5"
  status:
    success: "#15803d"
    warning: "#a16207"
    error: "#b91c1c"
typography:
  fontFamily:
    sans: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
    mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace"
  scale:
    h1: "1.05rem (16.8px), weight 600"
    h2: "0.82rem (13px), weight 600"
    body: "0.78rem (12.5px), weight 500"
    caption: "0.72rem (11.5px), weight 500"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
rounded:
  sm: "6px"
  md: "9px"
  lg: "12px"
  full: "9999px"
---

## 1. Visual Overview & Philosophy

- **Aesthetic Tone**: Extends the monochrome Studio Draftboard (`DESIGN.md`) with even quieter top-bar chrome. Collapsing the view switcher into a single compact dropdown button (`Pixel Grid ▾` / `Stripes ▾` / `Squint ▾`) reduces horizontal pill clutter on both desktop and `390px` mobile viewports. In `Squint` mode, all graph-paper UI cues disappear so the softly fused RGB stripes read like an illuminated image on neutral gallery paper (`#fafafa`).
- **Target Surfaces**: Desktop (`>= 768px`) and mobile (`< 768px`) web viewports.
- **Visual References**: Project root `DESIGN.md` and `src/styles/tokens.css`.

---

## 2. Color System & Contrast Rationale

All tokens reuse existing CSS custom properties from `src/styles/tokens.css`:

| Token Name | Hex Value | Semantic Role | Background Pair | Contrast Ratio | WCAG Compliance |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `--ink` (`text.primary`) | `#171717` | View trigger label, dropdown menu items, active checkmark, slider thumb | `--surface-popover` (`#ffffff`) | `17.9:1` | **PASS (AAA)** |
| `--ink-muted` (`text.muted`) | `#525252` | Focus pill `Sharp` / `Squint` endpoint labels, subtle chevron | `--surface-pill` (`#ffffff`) | `7.9:1` | **PASS (AAA)** |
| `--surface-active` | `#ececec` | Active trigger pill fill & active `menuitemradio` hover fill | `--ink` (`#171717`) | `15.2:1` | **PASS (AAA)** |
| `--line` (`border`) | `#e5e5e5` | Dropdown card border and Focus pill hairline border | `--bg` (`#fafafa`) | Decorative hairline | N/A (non-text) |

---

## 3. Typography Hierarchy

| Level | Font Family | Size | Weight | Line Height | Intended Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `View Trigger` | Sans (`Inter`) | `12.5px` | `600` | `1.2` | Active mode label (`Pixel Grid`, `Stripes`, `Squint`) + `▾` |
| `Menu Option` | Sans (`Inter`) | `12.5px` | `500` (`600` checked) | `1.2` | Fixed-order `menuitemradio` rows inside dropdown |
| `Focus Endpoint` | Sans (`Inter`) | `11.5px` | `500` | `1.2` | `Sharp` and `Squint` labels flanking the contextual Focus slider |

---

## 4. Component Anatomy & States

### Component: `ViewModeMenu` (`[data-ui="view-mode-menu"]`)
- **Visual Hierarchy & Placement**: Leftmost control inside the top-right `.pill-group` (followed by `.divider`, `Settings`, `Export PDF`, and `save-status`).
- **Component States**:
  - **Default / Closed**: Single capsule `.btn.active.view-mode-trigger` displaying active mode name + downward chevron (`▾`). Dropdown is hidden (`opacity: 0; visibility: hidden; pointer-events: none; transform: translateY(-4px) scale(0.98)`).
  - **Hover (Desktop `(hover: hover)`) / Open (`.open`)**: Chevron rotates `180deg`; frosted dropdown (`min-width: 136px`, `padding: 4px`, `border-radius: var(--radius-lg)`, `background: var(--surface-popover)`, `border: 1px solid var(--line)`, `box-shadow: var(--shadow-popover)`) sits below an invisible `6px` top hover bridge and animates smoothly to `opacity: 1; transform: translateY(0) scale(1)`.
  - **Menu Options (`role="menuitemradio"`)**: Always rendered in fixed order (`Pixel Grid`, `Stripes`, `Squint`) with a fixed-width leading checkmark slot (`✓` visible when `aria-checked="true"`). Hover/focus shifts background to `var(--surface-subtle)`.
  - **Focus**: `outline: 2px solid var(--ink); outline-offset: 2px` on both trigger and focused `menuitemradio` item.

### Component: `FocusBar` (`[data-ui="focus-bar"]`)
- **Visual Hierarchy & Placement**: Floating translucent capsule centered near the bottom of `#stage` (`position: absolute; bottom: 42px; left: 50%; transform: translateX(-50%); z-index: 35`). Hidden unless explicit `viewMode === 'squint'` (remains hidden during transient Spacebar `squintPeek`).
- **Component States**:
  - **Value text**: the range input exposes `aria-valuetext="0.75 cells"` (value plus unit).
  - **Visible**: `display: inline-flex; align-items: center; gap: 10px; padding: 6px 14px; border-radius: var(--radius-full); background: var(--surface-pill); backdrop-filter: blur(10px); border: 1px solid var(--line); box-shadow: var(--shadow-pill)`.
  - **Range Slider (`[data-ui="focus-input"]`)**: `width: 140px`, `accent-color: var(--ink)`, `min="0" max="1.5" step="0.05" value="0.75"`.

---

### Component: Squint-state side effects on existing controls
- **`Mark Done / Undo` (touch inspector button)**: rendered disabled (existing disabled style, `opacity` reduced, `cursor: not-allowed`) while `effectiveMode === 'squint'`.
- **Canvas**: `default` cursor, no hover ring, no axes or grid lines; the grid footprint is unchanged so layout never shifts when Squint is entered or a peek starts.

## 5. Responsive Layout & Breakpoints

| Viewport | Breakpoint | Layout Pattern | Navigation / Sizing Rules |
| :--- | :--- | :--- | :--- |
| **Desktop** | `>= 768px` | Two-column shell (`1fr 256px`) | Hover opens/closes `ViewModeMenu`; Focus pill floats cleanly above `.corner-hint` |
| **Mobile** | `< 768px` | Stacked canvas + bottom inspector | Tap toggles `ViewModeMenu`; trigger and `menuitemradio` rows enforce `min-height: 44px`; single narrow trigger keeps top-right pill single-row at `390px` |

---

## 6. Interaction, Motion & Sound

- **Dropdown Entrance/Exit**: `150ms cubic-bezier(0.2, 0, 0, 1)` on `opacity` and `transform` (`translateY(-4px) scale(0.98) → translateY(0) scale(1)`), with `180deg` chevron rotation over `150ms`.
- **Staggered Option Reveal**: `.view-mode-option` transitions `opacity` and `translateY(-3px) → 0` over `140ms ease-out` with `0ms`, `25ms`, and `50ms` stagger delays on items 1, 2, and 3.
- **Reduced Motion**: `@media (prefers-reduced-motion: reduce)` collapses all dropdown, chevron, and option transition durations and delays to `0ms`.
- **Audio Affordance**: Silent.

---

## 7. Do's and Don'ts

- **DO** keep all three view options in fixed order (`Pixel Grid`, `Stripes`, `Squint`) with `aria-checked` so muscle memory never shifts.
- **DO** use a single JS-managed `.open` class synchronized with `aria-expanded` instead of CSS-only `:hover`.
- **DO** hide the contextual Focus slider pill during transient Spacebar `squintPeek` so quick peeks never flash extra UI.
- **DON'T** show white UI grid lines, 5-cell reference lines, or X/Y axis ticks while in `Squint` mode.
- **DON'T** let the Squint peek activate a focused control: the handler must `preventDefault()` its Space events and defer to native activation for focused buttons.
- **DON'T** use CSS `filter: blur()` for the Squint preview; always use the linear-light Gaussian approximation in `src/engine/opticalBlur.ts`.
