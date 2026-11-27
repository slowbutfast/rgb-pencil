---
name: "Minimalist Studio Blank-Canvas"
colors:
  primary: "#171717"
  secondary: "#404040"
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
  channels:
    red: "#dc2626"
    green: "#16a34a"
    blue: "#2563eb"
  swatchStage: "#141414"
typography:
  fontFamily:
    sans: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
    mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace"
  scale:
    coord: "1.05rem (16.8px), weight 600, mono"
    label: "0.82rem (13px), weight 600, sans"
    control: "0.78rem (12.5px), weight 500, sans"
    caption: "0.72rem (11.5px), weight 500, mono/sans"
    axis: "9.5px–10px, weight 500–700, mono"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  sidebarWidth: "256px"
rounded:
  sm: "4px"
  md: "9px"
  lg: "14px"
  full: "9999px"
---

## 1. Visual Overview & Philosophy

- **Aesthetic Tone**: Ultra-minimalist, museum-grade studio blank canvas. The artwork's contrast-boosted RGB pixel grid is the sole visual focal point; all application chrome recedes into crisp monochrome neutrals (`#fafafa`, `#ffffff`, `#171717`, `#e5e5e5`) with zero decorative gradients, zero shadows except subtle elevation on floating pills/popovers, and zero visual overlap over the grid.
- **Target Surfaces**: Desktop web browser (`>= 768px` two-column unobstructed workspace) and mobile web viewport (`< 768px` stacked canvas + bottom inspector sheet).
- **Visual References**: Approved interactive prototype at `playgrounds/minimal_grid_playground.html`.

---

## 2. Color System & Contrast Rationale

| Token Name | Hex Value | Semantic Role | Background Pair | Contrast Ratio | WCAG Compliance |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `--ink` (`text.primary`) | `#171717` | Primary text, active axis labels, primary button fill | `--surface` (`#ffffff`) | `17.9:1` | **PASS (AAA)** |
| `--ink` (`text.primary`) | `#171717` | Primary text & active ticks on canvas | `--bg` (`#fafafa`) | `17.1:1` | **PASS (AAA)** |
| `--ink-muted` (`text.muted`) | `#525252` | Secondary labels, progress counter, legend descriptions | `--surface` (`#ffffff`) | `7.9:1` | **PASS (AAA)** |
| `--surface` on `--ink` | `#ffffff` | Primary CTA button label (`Upload Image`) | `--ink` (`#171717`) | `17.9:1` | **PASS (AAA)** |
| `--status-success` | `#15803d` | `Completed` status pill text | `#dcfce7` | `4.9:1` | **PASS (AA)** |
| `--ch-red` / `--ch-green` / `--ch-blue` | `#dc2626` / `#16a34a` / `#2563eb` | Channel badges (`R`, `G`, `B`) | `#ffffff` text | `4.8:1` / `3.3:1` (bold badge) / `5.1:1` | **PASS (AA UI)** |
| `--line` (`border`) | `#e5e5e5` | Hairline sidebar divider, card borders, pill borders | `--surface` (`#ffffff`) | Decorative hairline | N/A (non-text) |

---

## 3. Typography Hierarchy

| Level | Font Family | Size | Weight | Line Height | Intended Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Coordinate` | Mono (`JetBrains Mono`) | `16.8px` | `600` | `1.2` | Active `X24, Y18` coordinate header in right sidebar |
| `State Label` | Sans (`Inter`) | `13px` | `600` | `1.25` | Shading state name (`Full Color`, `Light Black`, etc.) |
| `Control / Pill` | Sans (`Inter`) | `12.5px` | `500` | `1.2` | Top-bar buttons (`Upload Image`, `Pixel Grid`, `Stripes`, `Settings`) |
| `Data / Sub` | Mono (`JetBrains Mono`) | `11.5px` | `500` | `1.4` | Progress readout (`12 / 2352 done`), `ΔE 4.2`, `● Red Stripe` |
| `Section Eyebrow` | Sans (`Inter`) | `11px` | `600` | `1.2` | Uppercase `0.08em` tracked labels (`PIXEL INSPECTOR`, `5 SHADING STATES`) |
| `Axis Tick` | Mono (`JetBrains Mono`) | `9–10px` | `500` (`700` active) | `1.0` | X and Y axis coordinates rendered directly on the grid canvas |

---

## 4. Component Anatomy & States

### Component: `MinimalTopBar` (Floating Pill Groups)
- **Visual Hierarchy & Placement**: Positioned absolutely at the top-left and top-right of the left canvas stage (`top: 16px; left/right: 20px`), `pointer-events: none` on the wrapper bar and `pointer-events: auto` on the two pill containers so the blank canvas remains uncluttered.
- **Component States**:
  - **Default / Idle**: `background: rgba(255, 255, 255, 0.9)`, `backdrop-filter: blur(10px)`, `border: 1px solid var(--line)`, `border-radius: 9999px`, `box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04)`.
  - **Hover**: Button background shifts to `#f0f0f0` (`#333333` for primary `Upload Image` button).
  - **Active / Selected** (`Pixel Grid`, `Stripes`, open `Settings`): `background: #ececec; font-weight: 600`.
  - **Focus**: `outline: 2px solid var(--ink); outline-offset: 2px`.

### Component: `InteractiveGridCanvas`
- **Visual Hierarchy & Placement**: Centered vertically and horizontally inside the blank canvas stage (`#fafafa`).
- **Component States**:
  - **Idle Cell**: Filled with contrast-boosted source RGB (or 3 vertical RGB stripes in `Stripes` mode). Separated by `rgba(255, 255, 255, 0.2)` `1px` grid lines and `rgba(255, 255, 255, 0.45)` major 5-cell reference lines.
  - **Hovered Cell**: Canvas cursor switches to `crosshair` (reverts to `default` over axis margins). Active cell receives a high-contrast double-stroke ring (`2px #ffffff` inner + `1px #171717` outer). Corresponding X and Y axis numbers bold to `#171717` with `1.5px` darker tick marks.
  - **Completed Cell**: Heavily desaturated muted gray (`gray = round(lum * 0.42 + 132)`) overlaid with a faint `rgba(255, 255, 255, 0.42)` diagonal hatch line so unfinished cells pop vividly. Re-clicking restores full color.
  - **Drag-Over File Drop**: Full-stage dashed `#171717` drop overlay (`rgba(250, 250, 250, 0.94)`) with centered `"Drop image to load grid"` prompt.

### Component: `PixelInspectorSidebar`
- **Visual Hierarchy & Placement**: Fixed `256px` right-hand column (`background: #ffffff`, `border-left: 1px solid #e5e5e5`) occupying `100vh` with zero overlap over the grid canvas.
- **Component States**:
  - **Empty (Pre-Hover)**: Quiet instructional copy (`"Hover over any cell on the grid to inspect its three RGB stripe values without covering the image."`) above the persistent bottom `5 Shading States` legend.
  - **Active (Hovered/Selected Cell)**:
    - Header row: `X<col+1>, Y<row+1>` in `JetBrains Mono` + status pill (`To Do` neutral `#f3f4f6` or `Completed` green `#dcfce7` / `#15803d`).
    - Dark Swatch Card (`#141414`, `border-radius: 12px`): 3 tall vertical stripe bars (`height: 84px`, `gap: 4px`) + bottom comparison row showing `Target` vs. `Mix` `14×14px` swatches.
    - 3 Channel Rows (`R`, `G`, `B`): `background: #fafafa`, `border: 1px solid #e5e5e5`, `border-radius: 9px`, colored channel square badge + bold state name + monospace symbol sublabel (`● Red Stripe`).
    - Footer row: Contextual hint (`Click cell to mark done` / `Click cell to undo`) + `ΔE` value.

### Component: `SettingsPopover`
- **Visual Hierarchy & Placement**: Collapsed by default; opens anchored below the top-right pill (`top: 62px; right: 20px; width: 260px`) with `rgba(255, 255, 255, 0.97)` frosted backdrop and `14px` radius. Contains Sample Scene chips (`Tree`, `Sunset`, `Orbs`), `Grid Width` range (`16–96 px`, default `56 px`), `Contrast Boost` range (`1.00×–2.30×`, default `1.45×`), `Pencil Palette` select, and `Floyd–Steinberg Dithering` toggle.

---

## 5. Responsive Layout & Breakpoints

| Viewport | Breakpoint | Layout Pattern | Navigation / Sizing Rules |
| :--- | :--- | :--- | :--- |
| **Desktop / Tablet Landscape** | `>= 768px` | Two-column CSS Grid (`1fr 256px`), `100vh` locked shell | Grid auto-fits canvas stage; sidebar stays fixed on right with zero grid overlap |
| **Mobile / Narrow Portrait** | `< 768px` | Single-column flex stack (`canvas` flex-1 + compact bottom inspector bar/sheet) | Interactive pill buttons and mobile toggle controls enforce minimum `44×44px` tap targets; inspector never covers grid cells |

---

## 6. Interaction, Motion & Sound

- **Transitions**: Subtle, crisp state changes only (`transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease`). Stripe preview bars update in `60ms linear` for responsive scrubbing across dense grids.
- **Feedback**: Immediate visual response on pointerdown/drag (cell desaturates + hatch appears + progress counter increments + sidebar pill turns green). No noisy toast spam during routine pixel clicking.
- **Audio Affordance**: Silent by default to match a calm drawing studio environment.

---

## 7. Do's and Don'ts

- **DO** keep all colors, spacing, and typography bound to CSS custom properties in `src/styles/tokens.css`.
- **DO** keep the right inspector sidebar strictly outside the grid stage so zero information ever covers neighboring pixels.
- **DO** preserve the `crosshair` cursor exclusively over active pixel cells and `default` over axis margins.
- **DON'T** add floating tooltips over the grid canvas or re-introduce multi-card dashboards on the main screen.
- **DON'T** render thousands of DOM `<div>` cells for the grid; always render cells, axes, and grid lines on the HiDPI `<canvas>`.
- **DON'T** use low-contrast body text (`< 4.5:1`) on `#ffffff` or `#fafafa` surfaces.
