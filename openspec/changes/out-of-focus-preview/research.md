## Source material

### 2026-11-27 — Out of Focus / Squinting Effect Request (User)
> "can you propose a feature that previews an "out of focus" view, based on the effect from the video: 3. The "Out of Focus" or Squinting View
>
>     Natural spatial blurring: When you squint, unfocus your eyes, or view the drawing from across the room, your eyes act like a low-pass filter that blurs fine, high-frequency details.
>
>     Erasing the grid lines: In sharp focus, your eyes resolve the thin dark dividers between every red, green, and blue stripe, reminding your brain that you are looking at lines on graph paper. Blurring or squinting smears adjacent RGB stripes together on your retina, hiding the vertical grid lines and merging the colors into smooth, continuous tones that look much closer to a real illuminated screen."

### 2026-11-27 — Single-Button Hover Dropdown Request (User)
> "instead of having three separate buttons, can you suggest how we can collapse this into one button, when when you hover over the current view, it displays the other two views as a dropdown?"

### 2026-11-27 — Dropdown Animation & Spacebar Approval (User)
> "[out_of_focus_plan.md]
> L7: can you animate the drop down options appearing during hover?
> L9: this is a good feature"

### 2026-11-27 — Technical Review & Corrections (Assistant review, adopted by the User)
The user asked for technical feedback on the draft plan and then for it to be turned into this change. The review text below is the assistant's, quoted for traceability, not the user's words:
> "The linear-light approach is the right call, and the plan holds up against the code. `MatchedGrid` already carries `palette`, so `renderOpticalBlur(grid, blurAmount)` needs nothing extra. The tokens it names exist in `tokens.css`, and `setViewMode` isn't gated by read-only, so squinting still works in a read-only tab. A few things in the blur math will bite, though.
>
> 1. The blur is anisotropic by 3×... Either rasterize at 6×6, or use σ_y = σ_x / 3.
> 2. There's no room for the dark border in a 6-subpixel cell... Fix: fold the border into coverage. Each stripe subpixel becomes `(1−b)·stripeLin + b·borderLin`, with `b = DARK_BORDER_RATIO`. Invariant to test: at large σ the per-cell mean must equal the LUT entry's `lin`.
> 3. The `<5 ms` claim won't survive the fixes... Cache the unblurred linear raster per grid separately from the blurred result... Coalesce slider events through `requestAnimationFrame`. Consider three running-sum box passes instead of a true Gaussian. That's O(N) regardless of σ and visually near-identical.
> 4. `blur = 0` will look mushy. Use nearest-neighbor at 0, or make the slider's minimum hand off to Stripes mode.
> 5. Define σ in cells, not subpixels. Resolution-independent units (for example 0 to 1.5 cells) make the slider meaningful.
> 6. Edge padding. Clamp-to-edge makes a dark image edge stay dark. The drawing sits on white paper, so padding with the page background is closer to what a viewer sees.
> 7. Tests and wording. The R+G test should assert exact values: linear 0.5 encodes to sRGB 188, versus 127/128 from naive sRGB averaging. And 'physically accurate' overclaims. It's a Gaussian, not a real defocus PSF, with no glare. Call it a linear-light approximation in the spec and copy.
>
> Spacebar peek:
> - Excluding BUTTON targets makes it fail silently. Blur the trigger after a menu selection, and treat only editable inputs and selects as excluded.
> - Model the peek as a transient `peek` flag, not a swapped `viewMode`. Use `effectiveMode = peek ? 'out-of-focus' : viewMode`.
> - Guard `e.repeat`, modifier keys and `preventDefault`. Also release the peek on window `blur` and `visibilitychange`.
> - Define peek during a drag.
>
> Dropdown:
> - Show all three views in a fixed order, with the active one checked. Use `menuitemradio` and `aria-checked`.
> - Hover-open plus click-toggle conflicts on desktop. Don't toggle on click when `(hover: hover)` matches.
> - `aria-expanded` is stale with CSS-only hover. It also needs roving focus and Escape returning focus to the trigger.
>
> 1. Label: I'd use **Squint**. It's the artist's word, and it keeps the trigger narrow.
> 2. Spacebar: yes, with the fixes above.
> 3. Branch: make it a **new OpenSpec change** (for example `out-of-focus-preview`), stacked after PATCH-06 and PR #1 lands."

### Raised but not acted on

- **Outward blur bleed beyond the grid footprint**: Physically, a dark edge bleeds onto surrounding paper. The canvas is sized to the grid plus axis padding, so drawing past it would mean resizing the canvas (layout shift on every peek). Deferred; the preview keeps a clean footprint.
- **Renaming the requirement "Pixel Grid and Stripes view mode toggle"**: Now covers three views. A RENAMED delta was left out to avoid churn; consider it when the change is archived.

- **"Progress Only" Squint Mode**: A future toggle rendering completed cells in color and uncompleted cells as blank paper (showing what the physical sheet looks like from across the room right now). Deliberately deferred to a follow-up change; this change keeps the default full-artwork squint preview so users can validate grid density, contrast, and dithering before committing.
- **Physical Defocus PSF / Lens Glare Model**: Modeling true circular bokeh PSF, pupil diffraction, or glare is out of scope; this change intentionally uses a fast O(N) 3-pass linear-light Gaussian approximation.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| Squint view (`'squint'`) | The third view mode rendering a linear-light Gaussian approximation of the matched RGB stripes with UI grid lines and X/Y axes hidden | A CSS `filter: blur()` over gamma-encoded sRGB or a true optical lens PSF simulation |
| Linear-light Gaussian approximation | 3-pass separable running-sum box blur executed in linear RGB `[0, 1]` space and re-encoded to sRGB, approximating a Gaussian low-pass filter | Exact optical defocus PSF with spherical aberration or glare |
| Isotropic `3×3` raster | One logical pixel rasterized as `3` horizontal subpixels (`R`, `G`, `B`) × `3` identical vertical subpixel rows so each subpixel is square (`cell/3 × cell/3`) | An anisotropic `6×2` raster where vertical σ is 3× larger than horizontal σ |
| Coverage-folded dark border | Blending `DARK_BORDER_RATIO` (`b = 0.15`) directly into each stripe subpixel's linear color via `(1 - b) * stripeLin + b * borderLin` so cell means match `buildComboLUT` | Drawing separate black divider pixels between stripes |
| Transient `squintPeek` | A boolean store flag active only while Spacebar is held (`effectiveMode = squintPeek ? 'squint' : viewMode`), never mutating persisted `viewMode` | Swapping `viewMode` to `'squint'` and restoring a cached previous mode on `keyup` |
| Fixed-order `menuitemradio` dropdown | A single-button view switcher whose dropdown always lists `Pixel Grid`, `Stripes`, and `Squint` in fixed order with `aria-checked="true"` on the active view | A dynamic 2-item list that omits the active view and shifts item positions |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| Kovesi, P. (2010), *Fast Almost-Gaussian Filtering*, DICTA 2010 | That `n = 3` box passes approximate a Gaussian in O(N). Its integer-width `boxesForGauss` is NOT used (see Superseded claims); variance additivity of convolved boxes is | Academic / public algorithm | 2026-11-27 |
| IEC 61966-2-1 (sRGB Transfer Function) | Linear `0.5` encodes to sRGB `Math.round((1.055 * Math.pow(0.5, 1/2.4) - 0.055) * 255) === 188`, proving linear-light mixing produces brighter yellows than naive sRGB `127`/`128` | Public standard | 2026-11-27 |
| WAI-ARIA Authoring Practices — Menu Button (`menuitemradio`) | `aria-haspopup="menu"`, synchronized `aria-expanded`, `role="menu"`, `role="menuitemradio"`, `aria-checked`, ArrowUp/ArrowDown roving focus, and `Escape` returning focus to trigger | W3C public spec | 2026-11-27 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| 3-pass O(N) continuous-coverage box blur in Linear RGB with moment-matched real widths | Adopted | O(N) independent of σ, continuous slider response, exact effective sigma; ~1–3 ms on `3×3` rasters (`21k–62k` subpixels) | 2026-11-27 |
| Direct separable Gaussian convolution | Rejected | O(N·σ) grows to ~15M+ MACs at large σ on dense grids, causing main-thread stutter during 60 Hz slider scrubbing | 2026-11-27 |
| CSS `filter: blur()` | Rejected | Blurs in gamma-encoded sRGB, producing dark muddy olive instead of glowing yellow when R and G stripes mix | 2026-11-27 |
| `3×3` isotropic subpixel raster with coverage-folded border | Adopted | Square subpixels (`cell/3 × cell/3`) guarantee isotropic blur, 4× fewer pixels than `6×6`, and exact linear mean agreement with `buildComboLUT` | 2026-11-27 |
| `6×2` subpixel raster | Rejected | 3× anisotropic (smears vertically while staying blocky horizontally) and leaves no integer room for a 15% dark border | 2026-11-27 |
| JS-controlled `.open` dropdown with `matchMedia('(hover: hover)')` | Adopted | Keeps `aria-expanded` always accurate, avoids desktop hover-vs-click conflict, and supports touch tap + keyboard roving focus cleanly | 2026-11-27 |
| CSS-only `:hover` dropdown | Rejected | Leaves `aria-expanded` stale and conflicts with click-toggle on desktop pointer devices | 2026-11-27 |

## Patterns adopted

- **Two-Stage Memoization + `rAF` Slider Coalescing**: Separate cache for `buildLinearStripeRaster(grid)` (per `grid` reference) and `blurLinearRasterToSrgb(raster, blurCells)` (per `(grid, blurCells)`), paired with `requestAnimationFrame` coalescing on `#focusBar` `input` events. Lands in `src/ui/gridCanvas.ts` and `src/ui/topBar.ts`.
- **Transient Peek Overlay Pattern**: `effectiveMode = state.squintPeek ? 'squint' : state.viewMode` prevents stale mode restoration if the user changes `viewMode` while holding Spacebar. Lands in `src/store/gridStore.ts` and `src/ui/gridCanvas.ts`.
- **Fixed-Order Accessible Menu Button**: Single trigger button with JS-managed `.open` class, `aria-expanded`, `role="menu"`, and 3 `role="menuitemradio"` options with `aria-checked` and animated `150ms` reveal (`0ms` under `prefers-reduced-motion`). Lands in `index.html`, `src/styles/main.css`, and `src/ui/topBar.ts`.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| PR #1 state | OPEN, head `0374420` (`fix(project-persistence): apply PR review patch 06`), base `master`; 18 files / 220 tests pass and strict build clean, as reported by that PR's orchestrator (not re-run here) | `gh pr view 1 --json state,headRefOid` and `git log origin/feat/multi-20261126-2351` | 2026-11-27 | decays |
| `MatchedGrid` already carries `palette: PencilPalette` | Present at `src/types/pipeline.ts:115` | Direct file read of the PR #1 branch (re-checked at `0374420`) | 2026-11-27 | stable |
| `setViewMode` is not gated by `readOnly` | Confirmed in `src/store/gridStore.ts` | Direct code inspection (`git show` of the PR #1 branch) | 2026-11-27 | stable |
| `DARK_BORDER_RATIO` constant is exported | `0.15` at `src/types/pipeline.ts:71` | Direct file read | 2026-11-27 | stable |
| Existing view-mode tests | `describe('Pixel Grid / Stripes view toggle')` at `src/ui/__tests__/ui.test.ts:296-312` queries `[data-ui="mode-grid"]` / `[data-ui="mode-stripes"]` | `grep` of the PR #1 branch at `0374420` | 2026-11-27 | decays upon this change |
| Existing view-mode buttons in `index.html` | `#btnModeGrid` (`data-ui="mode-grid"`) and `#btnModeStripes` (`data-ui="mode-stripes"`) at `index.html:27-28` | Direct file read | 2026-11-27 | decays upon this change |
| Linear `0.5` encodes to sRGB `188` | `Math.round((1.055 * 0.5**(1/2.4) - 0.055) * 255) = 188` | IEC 61966-2-1 formula | 2026-11-27 | stable |
| `Reset` runs immediately with no confirmation | `onReset = store.resetCompleted()` at `src/ui/topBar.ts:309` | Direct file read of the PR #1 branch | 2026-11-27 | decays |
| Canvas is sized to exactly the grid plus axis padding | `cssWidth = AXIS_PAD_LEFT + cols*cellSize + 2` (`gridCanvas.ts:118-119`) | Direct file read | 2026-11-27 | decays |
| Tokens named in `design.md` exist | `--surface-subtle`, `--surface-pill`, `--shadow-pill`, `--surface-active`, `--radius-full`, `--surface-popover`, `--shadow-popover`, `--radius-lg` | `grep` of `src/styles/tokens.css` on the PR #1 branch | 2026-11-27 | decays |
| The original MODIFIED targets each had a second scenario the first draft dropped | "Outside click closes settings popover" (`design-language`) and "Switching to Stripes view renders RGB subpixels" (`interactive-pixel-grid`) | Read both main specs on the PR #1 branch | 2026-11-27 | stable |
| `3×3` subpixel counts for `56×42` and `96×72` | `168×126 = 21,168` and `288×216 = 62,208` subpixels | Arithmetic | 2026-11-27 | stable |

## Unverified assumptions

- **Space keyup activates a focused button, and `preventDefault()` on the key events cancels it**: standard browser behaviour relied on by `architecture.md` Decision 6, not exercised here. Checking cost: one Playwright run in Chromium and Firefox during verification (listed in `tests.md` manual steps).
- **Strict validation cannot check MODIFIED headers on `master`**: `openspec/specs/` is empty there (PR #1 not merged), so the two MODIFIED deltas were checked by hand against the PR #1 branch's main specs. PATCH-06 rewrote a different requirement in `openspec/specs/interactive-pixel-grid/spec.md` ("Local persistence of completed cell progress"), so it does not overlap this change's MODIFIED "Pixel Grid and Stripes view mode toggle". Re-run `openspec validate --strict` on the implementation branch, where the main specs exist.

- **Mobile touch tap feel on `#btnViewMode` at `390×844`**: Collapsing two view buttons into one narrower `Pixel Grid ▾` / `Squint ▾` trigger is expected to eliminate the second-line wrap of `Saved` observed during PR #1 visual review. Checking cost: visual inspection in a `390×844` Playwright viewport during verification.

## Superseded claims

- **`6×2` subpixel raster with single subpixel σ** (2026-11-27): Initially proposed in the first draft of `out_of_focus_plan.md`. Superseded because it produced 3× vertical anisotropy and had no clean representation for the 15% dark border; replaced with `3×3` isotropic subpixels + coverage-folded dark border.
- **2-item dynamic dropdown showing "only the other two views"** (2026-11-27): Initially proposed to hide the active view from the dropdown. Superseded because shifting menu positions hurts muscle memory; replaced with a fixed-order 3-item `menuitemradio` list with `aria-checked`.
- **CSS-only `:hover` dropdown + click-toggle** (2026-11-27): Superseded because it leaves `aria-expanded` stale and creates a desktop hover-vs-click conflict; replaced with JS-synchronized `.open` state using `matchMedia('(hover: hover)')`.
- **Swapping `viewMode` on Spacebar `keydown` / restoring on `keyup`** (2026-11-27): Superseded because switching modes mid-hold restores a stale mode and excluding `BUTTON` targets broke peek after clicking UI buttons; replaced with transient `squintPeek` flag and `.blur()` after menu selection.

- **Integer Kovesi box widths (`boxesForGauss`)** (2026-11-27, review of this change): Adopted in the first draft. At `3` subpixels per cell the odd-integer widths give a dead zone below `blurCells ≈ 0.3` and coarse stepping above it. Replaced by continuous-coverage boxes with moment-matched real widths.
- **Closed form `w = sqrt(4σ²+1)` for equal boxes** (2026-11-27): Only exact for integer odd widths; about 40% sigma error near `w = 2`. Replaced by the bisection solve.
- **`stage.dataset.dragging` as the drag signal** (2026-11-27): Hidden coupling between two UI modules. Replaced by a store `painting` flag.
- **Peek ignores editable controls only** (2026-11-27): Left `Space` keyup free to re-activate a focused `Reset` or `Export PDF` button. Replaced by default-prevention plus a focused-control rule.

## Links out

- [DESIGN.md](../../../DESIGN.md) — Studio Draftboard design system tokens and motion guardrails.
- [design-language-and-ui-ux](../design-language-and-ui-ux/proposal.md) — Base UI/UX change whose view-mode toggle and pill wording this change modifies.
