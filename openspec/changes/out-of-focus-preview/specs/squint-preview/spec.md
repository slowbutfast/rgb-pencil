## ADDED Requirements

### Requirement: Isotropic linear-light stripe raster with coverage-folded dark border
The optical blur engine SHALL rasterize a `MatchedGrid` into an isotropic `3×3` subpixel-per-cell Linear RGB buffer (`width = cols * 3`, `height = rows * 3`) where each stripe subpixel folds `DARK_BORDER_RATIO` (`b = 0.15`) directly into linear coverage via `(1 - b) * stripeLin + b * borderLin`, so that every logical cell's mean linear RGB matches `buildComboLUT`'s `lin` entry within `1e-5`.

#### Scenario: Uniform cell linear mean matches buildComboLUT
- **WHEN** `buildLinearStripeRaster` rasterizes a uniform grid whose cells all share a single `(ri, gi, bi)` combination from `grid.palette`
- **THEN** the mean linear `(r, g, b)` across the 9 subpixels of any cell SHALL equal the corresponding `buildComboLUT` entry's `lin` triple within `1e-5`

#### Scenario: Raster dimensions are isotropic
- **WHEN** a `56 × 42` grid is rasterized
- **THEN** the raster SHALL be `168 × 126` subpixels with 3 channels

### Requirement: Continuous-radius linear-light Gaussian approximation
The engine SHALL approximate an isotropic Gaussian low-pass filter with 3 separable (horizontal then vertical) box passes in linear RGB, driven by a resolution-independent radius `blurCells` in `[0.0, 1.5]` logical cells (`sigmaSubpx = blurCells * 3`). Each box SHALL be a continuous-coverage box whose real-valued width is solved numerically so that one pass has variance `sigmaSubpx² / 3`; the three passes therefore sum to a total variance of `sigmaSubpx²`. Window sums SHALL use interpolated prefix sums so runtime is O(N) independent of `blurCells`, and the output SHALL change continuously and strictly monotonically with `blurCells`. Out-of-bounds samples SHALL be the linearized paper colour (`#fafafa`).

#### Scenario: Blur radius of 0.0 is an exact sharp identity
- **WHEN** `blurLinearRasterToSrgb` is called with `blurCells = 0`
- **THEN** every output subpixel SHALL equal the direct sRGB encoding of the unblurred linear raster without spatial smearing

#### Scenario: Impulse response variance matches the requested sigma
- **WHEN** a single bright subpixel in the interior of a large dark raster is blurred with `blurCells = 0.75`
- **THEN** the second moment of the horizontal impulse response SHALL equal `(0.75 * 3)²` within `1%`, and the vertical second moment SHALL equal the horizontal one within `1e-4` relative

#### Scenario: Slider steps never collapse to identical output
- **WHEN** the same raster is blurred at `blurCells` values `0.05`, `0.10`, `0.15`, … `1.5`
- **THEN** the peak of the impulse response SHALL strictly decrease at every step

#### Scenario: Linear-light averaging beats naive sRGB averaging
- **WHEN** a raster of alternating linear `1.0` and `0.0` columns is blurred with a radius large enough to average them, and an interior sample is encoded
- **THEN** the sRGB channel SHALL equal `linearToSrgb` of the linear mean (`188` for a mean of `0.5`) rather than naive sRGB `127` or `128`

#### Scenario: Dark artwork edges blend toward paper inside the grid footprint
- **WHEN** a solid black grid is blurred with `blurCells = 1.0`
- **THEN** subpixels at the grid boundary SHALL brighten toward `#fafafa` rather than staying solid black, and the rendered output SHALL remain exactly the grid footprint (no pixels are drawn outside it)

### Requirement: Contextual Focus slider with rAF coalescing and nearest-neighbor sharp mode
When explicit `Squint` mode is active (`viewMode === 'squint'` and not transient `squintPeek`), the application SHALL display a contextual floating Focus pill (`Sharp` `0.0` to `Squint` `1.5` cells, `step 0.05`, `aria-valuetext` of the form `0.75 cells`) at the bottom-center of the stage, coalescing slider `input` events through `requestAnimationFrame`, using nearest-neighbor (`imageSmoothingEnabled = false`) at `0.0` and smooth scaling above `0.0`.

#### Scenario: Focus slider appears only in explicit Squint mode
- **WHEN** `viewMode` is `'grid'` or `'stripes'`, or during a transient Spacebar `squintPeek`
- **THEN** the `[data-ui="focus-bar"]` pill SHALL remain hidden
- **WHEN** `viewMode` is explicitly set to `'squint'`
- **THEN** `[data-ui="focus-bar"]` SHALL become visible and scrubbing its slider SHALL update `blurCells` without marking the project dirty

#### Scenario: Slider events within one frame produce one render
- **WHEN** 10 `input` events fire before the next animation frame
- **THEN** exactly one blur render SHALL occur, using the last value

### Requirement: Squint is a non-mutating preview
While `effectiveMode === 'squint'` the application SHALL keep inspection live but block every completion path. Pointer hover and touch taps SHALL continue to update the inspector (the hover ring stays hidden); click, drag-paint, and the touch `Mark Done / Undo` button SHALL NOT change completed cells, and `Mark Done / Undo` SHALL render disabled. The unblurred raster and blurred canvas caches SHALL be single-entry, keyed by the current `MatchedGrid` reference, and SHALL NOT be invalidated by completed-cell changes.

#### Scenario: Hover still inspects in Squint
- **WHEN** `effectiveMode` is `'squint'` and the pointer moves over cell `(12, 8)`
- **THEN** the inspector SHALL show `X12, Y8` and no hover ring SHALL be drawn

#### Scenario: Mark Done is disabled in Squint
- **WHEN** a cell was inspected by touch and `effectiveMode` is `'squint'`
- **THEN** the `Mark Done / Undo` button SHALL be disabled and pressing it SHALL NOT change the completed count

#### Scenario: Completion changes do not re-run the blur
- **WHEN** completed cells change while Squint is active
- **THEN** neither the raster nor the blur SHALL be recomputed

#### Scenario: No grid yet renders nothing
- **WHEN** `effectiveMode` is `'squint'` and `grid` is `null`
- **THEN** the canvas SHALL draw nothing and SHALL NOT throw

### Requirement: Transient Hold Spacebar to Squint peek
Holding `Space` while in `Pixel Grid` or `Stripes` mode SHALL activate a transient `squintPeek` boolean flag (`effectiveMode = squintPeek ? 'squint' : viewMode`) without mutating `viewMode`. The peek SHALL ignore `e.repeat`, modifier keys (`Ctrl`/`Meta`/`Alt`), text-entry controls (`INPUT` of a text-like type, `TEXTAREA`, `SELECT`, `contenteditable`), and an active drag-paint (store flag `painting`). While engaging, the handler SHALL call `preventDefault()` on both the `Space` `keydown` and `keyup` so no focused control is activated by the key release. If `document.activeElement` is a natively Space-activated control (`BUTTON`, checkbox, radio, `SUMMARY`, or an element with `role="button"` or `role="menuitemradio"`), the peek SHALL NOT engage and native activation SHALL win. Top-bar buttons activated by pointer (`click` with `event.detail > 0`) SHALL be blurred, and closing the Settings popover SHALL move focus to `document.body`, so mouse users keep the peek. The peek SHALL release on `keyup`, `window` `blur`, and `document` `visibilitychange`.

#### Scenario: Holding and releasing Spacebar peeks Squint without mutating viewMode
- **WHEN** `viewMode` is `'grid'` and the user presses and holds `Space` (no text control focused, no drag active)
- **THEN** `squintPeek` SHALL become `true`, the canvas SHALL render the Squint preview, and `viewMode` SHALL remain `'grid'`
- **WHEN** the user releases `Space` (or the tab loses visibility or the window loses focus)
- **THEN** `squintPeek` SHALL reset to `false` and the canvas SHALL return to `'grid'`

#### Scenario: Peek after a pointer click never re-activates the clicked button
- **WHEN** the user clicks `Reset` with the mouse and then presses and releases `Space`
- **THEN** the `Reset` button SHALL have been blurred by the click, the peek SHALL engage, both `Space` events SHALL be default-prevented, and `resetCompleted` SHALL have been called exactly once (by the click)

#### Scenario: Keyboard focus on a button keeps native Space activation
- **WHEN** `Reset` is focused by keyboard and the user presses `Space`
- **THEN** `squintPeek` SHALL remain `false` and the button SHALL activate natively exactly once

#### Scenario: Spacebar is ignored while typing or mid-drag-paint
- **WHEN** focus is inside a text input or `<select>`, or `painting` is `true`, and `Space` is pressed
- **THEN** `squintPeek` SHALL remain `false` and the ongoing edit or drag-paint SHALL NOT be interrupted

#### Scenario: Space is a no-op in explicit Squint mode
- **WHEN** `viewMode` is `'squint'` and `Space` is held
- **THEN** the view SHALL not change and `squintPeek` SHALL remain `false`
