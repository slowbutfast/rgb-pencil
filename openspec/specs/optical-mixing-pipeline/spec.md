# optical-mixing-pipeline Specification

## Purpose
Defines client-side image ingestion, S-curve contrast pre-processing, 125-combo linear-RGB optical matching, CIELAB error, Floyd–Steinberg dithering, and built-in sample scenes.

## Requirements

### Requirement: Image upload, full-canvas drag-and-drop, and built-in sample scenes
The application SHALL allow loading any browser-supported image (`image/*`) via the `Upload Image` button or by dragging and dropping a file onto the canvas stage, and SHALL ship with 3 procedural sample scenes (`Tree`, `Sunset`, `Orbs`) accessible from the Settings popover so the workspace is immediately interactive on first load.

#### Scenario: Uploading an image replaces the grid and resets completed cells
- **WHEN** the user selects or drops a valid image file onto the canvas stage
- **THEN** the application SHALL downsample and match the uploaded image at the active grid width, preserve its aspect ratio, and clear previous completed cells

#### Scenario: Dropping a non-image file is safely ignored
- **WHEN** the user drops a non-image file (e.g. `.txt` or `.pdf`) onto the canvas stage
- **THEN** the application SHALL ignore the file without crashing or clearing the current grid

### Requirement: S-curve contrast boost pre-processing
Before optical matching, each downsampled pixel channel SHALL pass through a configurable sigmoidal S-curve (`1.0×` to `2.3×`, default `1.45×`) centered at `0.46` luminance so dark regions crush deeper and bright RGB stripes produce a stronger screen-glow illusion.

#### Scenario: Contrast boost of 1.0x is an identity pass-through
- **WHEN** contrast boost is set to `1.0`
- **THEN** pixel RGB values SHALL pass through unmodified

#### Scenario: Contrast boost above 1.0x increases dynamic separation
- **WHEN** contrast boost is set to `1.45`
- **THEN** dark midtones below `0.46` SHALL darken and bright midtones above `0.46` SHALL lift while remaining clamped to `[0, 255]`

### Requirement: 125-combo linear-RGB optical averaging LUT and CIELAB matching
For any selected pencil palette (`Reflective Colored Pencils`, `Vibrant Wax Pencils`, `Ideal Screen RGB`), the engine SHALL precompute all `5 × 5 × 5 = 125` stripe combinations by averaging the 3 stripe colors and the dark border ratio (`0.15`) in **Linear RGB**, converting each optical average to **CIELAB**, and matching every target pixel to the combination with minimum Euclidean CIELAB ΔE.

#### Scenario: LUT contains exactly 125 valid entries
- **WHEN** `buildComboLUT` is invoked for any preset palette
- **THEN** it SHALL return exactly `125` entries covering every `(ri, gi, bi)` triple in `[0..4]^3` with valid linear RGB, sRGB, and CIELAB coordinates

#### Scenario: Red + Green full stripes optically average toward yellow
- **WHEN** evaluating the combo `(R: Full Color, G: Full Color, B: Solid Black)` in the LUT
- **THEN** its optical average in CIELAB SHALL have positive `b*` (yellow axis) and higher luminance than any single-channel stripe

### Requirement: Optional Floyd-Steinberg error diffusion in linear RGB
When dithering is enabled (default `on`, strength `0.85`), the matcher SHALL propagate each pixel's linear-RGB quantization residual (`targetLin - chosenLin`) to neighboring pixels using Floyd–Steinberg weights (`7/16`, `3/16`, `5/16`, `1/16`) so smooth gradients avoid harsh banding.

#### Scenario: Toggling dithering produces deterministic quantized output
- **WHEN** dithering is disabled (`false`) and two identical pixels are matched
- **THEN** both pixels SHALL deterministically map to the exact same `(ri, gi, bi)` combination

#### Scenario: Grid width adjustment recalculates cleanly within 16–96 px
- **WHEN** the user drags the Grid Width slider in the Settings popover between `16` and `96`
- **THEN** the pipeline SHALL recompute the grid with aspect-preserving rows and prune any out-of-bounds completed cell coordinates
