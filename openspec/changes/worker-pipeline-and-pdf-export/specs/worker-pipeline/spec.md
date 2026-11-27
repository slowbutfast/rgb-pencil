## ADDED Requirements

### Requirement: Shared serialisable pipeline data contracts
The application SHALL define all pipeline data shapes in `src/types/pipeline.ts` as plain, structured-clone-safe values: `ShadingStateId` (`0 | 1 | 2 | 3 | 4`, mapping to `□ White Paper`, `● Full Color`, `◐ Light Black`, `◑ Heavy Black`, `■ Solid Black`), `PencilPalette`, `ComboLUTEntry`, `MatchedCell`, `MatchedGrid`, and `ColumnInstruction`. `MatchedGrid` SHALL store per-cell data as flat typed arrays of length `cols × rows` (`ri`, `gi`, `bi` as `Uint8Array`, `deltaE` as `Float32Array`, `target` as `Uint8ClampedArray` of length `3 × cols × rows`) in row-major order. These contracts SHALL contain no functions, class instances, or DOM references.

#### Scenario: A MatchedGrid survives a structured clone unchanged
- **WHEN** a `MatchedGrid` is passed through `structuredClone`
- **THEN** the clone SHALL deep-equal the original, including every typed array

#### Scenario: Flat arrays are row-major
- **WHEN** the cell at column `c` and row `r` is read from a `MatchedGrid` of width `cols`
- **THEN** its stripe states SHALL be `ri[r * cols + c]`, `gi[r * cols + c]`, and `bi[r * cols + c]`

### Requirement: Pipeline runs off the main thread in a module Web Worker
The downsample, S-curve contrast, 125-combo CIELAB match, and Floyd–Steinberg linear-RGB dithering steps SHALL execute inside `src/workers/pipeline.worker.ts` when `Worker` is available. The worker body SHALL be a thin adapter over a pure `runPipeline(request)` function exported from `src/engine/`, so the same code path is callable synchronously in Node.

#### Scenario: Slider scrubbing does not block pointer handling
- **WHEN** the user drags the Grid Width or Contrast slider while the pointer is simultaneously used to hover cells
- **THEN** hover updates and click toggles on the already-rendered grid SHALL continue to be processed without waiting for the pipeline run to finish

#### Scenario: Worker unavailable falls back to synchronous execution
- **WHEN** `Worker` is undefined or worker construction throws
- **THEN** the client SHALL run `runPipeline` synchronously on the main thread and the application SHALL still produce a correct grid

### Requirement: Latest-job-wins request handling
Every pipeline request SHALL carry a monotonically increasing integer `jobId`, and the worker SHALL echo it in its response. The client SHALL apply a response only if its `jobId` equals the most recently issued `jobId`, and SHALL discard all others. The client SHALL keep at most one request in flight plus one pending (latest) request, replacing any older pending request, so a burst of slider events never builds an unbounded queue.

#### Scenario: Stale response is discarded
- **WHEN** requests `jobId = 4` and `jobId = 5` are issued and the response for `4` arrives after `5` was issued
- **THEN** the client SHALL ignore the response for `4` and SHALL NOT update the displayed grid with it

#### Scenario: Burst of requests collapses to in-flight plus latest
- **WHEN** 30 slider events are issued while one request is in flight
- **THEN** at most one further request (carrying the parameters of the 30th event) SHALL be sent after the in-flight request completes

### Requirement: Zero-copy typed-array results
The worker SHALL return the `MatchedGrid` typed arrays as `Transferable` buffers rather than structured-cloning them. The client SHALL send each request using a bounded working bitmap (longest edge at most `512` px) prepared once per loaded image, so the full-resolution source is never re-sent per run.

#### Scenario: Result buffers are transferred
- **WHEN** the worker posts a successful result
- **THEN** the `ri`, `gi`, `bi`, `deltaE`, and `target` buffers SHALL be listed in the `postMessage` transfer list

#### Scenario: Large photo does not inflate per-run cost
- **WHEN** a `4032 × 3024` photo is loaded
- **THEN** the working bitmap sent to the worker SHALL have its longest edge at most `512` px and the same aspect ratio

### Requirement: Source fingerprint independent of tunable parameters
Each result SHALL include a `sourceHash` (32-bit FNV-1a, hex) computed over the pre-contrast downsampled RGB bytes plus `cols` and `rows`. It SHALL NOT depend on contrast, dithering, or palette, so changing those settings keeps the same completed-cell progress key.

#### Scenario: Contrast change preserves progress key
- **WHEN** the same image is processed twice at the same grid width with contrast `1.45` and `2.0`
- **THEN** both results SHALL have identical `sourceHash`

#### Scenario: Grid width change changes progress key
- **WHEN** the same image is processed at width `56` and at width `64`
- **THEN** the two results SHALL have different `sourceHash` values

### Requirement: Pipeline failures never corrupt the displayed grid
If the worker throws, posts an error response, or emits an `error` event, the client SHALL keep the last successfully applied `MatchedGrid`, SHALL surface a non-modal error state, and SHALL recreate the worker for the next request. A pipeline run with an unsupported grid width (outside `16–96`) SHALL be rejected with an error response rather than clamped silently.

#### Scenario: Worker crash keeps the previous grid
- **WHEN** the worker raises an unhandled error while processing a request
- **THEN** the previously displayed grid and completed cells SHALL remain unchanged and the next request SHALL be served by a fresh worker

#### Scenario: Out-of-range width is rejected
- **WHEN** a request is sent with `cols = 8`
- **THEN** the worker SHALL respond with an error and SHALL NOT post a `MatchedGrid`

### Requirement: Palette data drives the 125-combo LUT
`buildComboLUT(palette)` SHALL return exactly `125` `ComboLUTEntry` values (one per `(ri, gi, bi) ∈ [0..4]³`), computing each optical average in Linear RGB and converting to CIELAB. `culori` MAY be used here and in tests, but the per-pixel matching loop SHALL use the precomputed Lab table and typed arrays with no `culori` calls.

#### Scenario: LUT is complete and unique
- **WHEN** `buildComboLUT` is called for each preset palette
- **THEN** it SHALL return `125` entries with no duplicate `(ri, gi, bi)` triple

#### Scenario: Hand-rolled Lab agrees with culori
- **WHEN** the Lab value of each of the 125 entries is compared with `culori`'s conversion of the same sRGB colour
- **THEN** every `L*`, `a*`, `b*` component SHALL agree within `0.5`
