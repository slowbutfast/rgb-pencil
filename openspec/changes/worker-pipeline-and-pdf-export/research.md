## Source material

### 2026-11-26 — Technical Implementation Plan (User)
> "a change covering the technical details behind the project. i've finalized the design which i've wrote into @openspec/changes/design-language-and-ui-ux/"

The user then pasted the full "RGB Colored Pencil Optical Mixing Guide — Implementation Plan". Load-bearing excerpts, quoted verbatim:

> "Run matching + Floyd–Steinberg linear-RGB error diffusion in src/workers/pipeline.worker.ts so resizing the grid or adjusting contrast never blocks pointer hover/click responsiveness."

> "Implement the 5-state × 3-channel (125-combo) linear-RGB optical averaging LUT and CIELAB ΔE matcher using culori."

> "Accessible from a single unobtrusive Export PDF action in the top-right pill. Generates a multi-page pdf-lib document with legend, tiled symbol charts, column-by-column RLE checklist, and optional true-to-scale faint printable template."

> "Partitive RGB mixing is computed in Linear RGB (with configurable dark border weighting) before converting to CIELAB for 125-combo perceptual matching, and Floyd–Steinberg error diffusion runs in Linear RGB."

> "Printable 15-patch swatch card + photo uploader to replace default reflective presets with the user's real measured pencils." (labelled *Component 4 (Phase 2)*)

> Verification Plan: "Verify 125-combo LUT generation, optical R+G=yellow averaging in CIELAB, Floyd–Steinberg luminance preservation, RLE completeness, and valid %PDF- output."

Target Context Map files this change owns (all `[NEW]`, with line budgets from the plan): `src/types/pipeline.ts` (L1-L85), `src/engine/guideBuilder.ts` (L1-L90), `src/engine/pdfExporter.ts` (L1-L200), `src/workers/pipeline.worker.ts` (L1-L50), `src/engine/__tests__/engine.test.ts` (L1-L130).

Open Questions posed in the plan, and how this change resolves them (the user has not answered; defaults taken to keep momentum, each is reversible):

| # | Question (from plan) | Default taken here | Where it lands |
| :--- | :--- | :--- | :--- |
| 1 | Touch: tap opens inspector + "Mark Done / Undo" button, double-tap toggles? | **Tap = inspect only; completion toggles via an explicit button in the mobile bottom inspector.** Double-tap is rejected (see below). | `design.md`, `specs/touch-interaction` |
| 2 | Keep Printable PDF Export in MVP via "Export PDF" in top-right pill? | **Yes.** | `specs/pdf-export` |
| 3 | Stack: Vite + React + TypeScript (culori + pdf-lib)? | **Yes for Vite + TypeScript, but without React**: the first change now refactors the prototype into vanilla TS modules (see `design-language-and-ui-ux/research.md`). `culori` caveat in "Superseded claims" still applies. | `architecture.md` |

### Prior change (read from disk 2026-11-26)
`openspec/changes/design-language-and-ui-ux/` already specifies the UI, the synchronous engine (`contrast.ts`, `colorMath.ts`, `matcher.ts`), `gridStore`, and localStorage persistence. Its `research.md` and `architecture.md` explicitly defer three things this change now owns: the Web Worker, `pdf-lib` export, and the RLE checklist. Its `architecture.md` Non-Goals: "No PDF generation (`pdf-lib`) in this change … `MatchedGrid` data contract is designed so PDF export plugs in cleanly later."

### Raised but not acted on

- **Phase 2 pencil calibration (`src/engine/calibration.ts`, 15-patch swatch card + photo sampler)**: In the plan, but explicitly labelled Phase 2. Needs camera/photo colour-constancy research (white balance, lighting normalisation) that would double this change. This change only guarantees `PencilPalette` is a plain serialisable value so calibration can later swap it in.
- **Double-tap to toggle completion on touch**: Raised in Open Question 1. Rejected: double-tap collides with browser double-tap-to-zoom, and drag-painting plus an accidental double-tap would silently mark cells done. An explicit button is unambiguous.
- **`<PixelStripePopover>` floating hover pop-up**: Appears in the plan's "User Review Required" note and flow diagram. Superseded by the approved right sidebar in `design-language-and-ui-ux`. Not built.
- **"Distance blur" view mode**: Mentioned in the plan's top-bar description. Existing change scopes view modes to `Pixel Grid` / `Stripes`. Left out here; it is a pure render-layer addition later.
- **Faint-template tiling beyond A4/Letter**: Only A4 and US Letter are supported. Custom page sizes add layout cases with no stated user need.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| Stripe column | One of the `3 × cols` vertical lines in the full drawing: for logical column `c`, stripe columns `3c` (R), `3c+1` (G), `3c+2` (B) | A logical pixel column (there are `cols` of those) |
| Run (RLE run) | A maximal sequence of vertically adjacent rows in one stripe column that share the same shading state, encoded `{ state, startRow, length }` | A horizontal run, or a run across stripe columns |
| Column instruction | The ordered list of runs for one stripe column, top to bottom; the unit an artist ticks off while drawing | A UI column of the grid; a CSS column |
| Chart tile | One PDF page showing a rectangular window of the symbol grid with overlapping row/column indices so tiles can be aligned | A UI "tile" or a texture tile |
| Symbol chart | A grid where each cell shows `R G B` state symbols (`□ ● ◐ ◑ ■`) as printable glyphs/shapes | The colour preview grid |
| Faint template | A true-to-scale printable sheet of light-grey stripe-column guides and a dark border so the artist can draw directly on it | A pre-coloured print of the answer |
| Pipeline run | One execution of downsample → contrast → match → dither for a given `(image, params)` | A single pixel's match |
| Job id | Monotonic integer attached to each worker request; the main thread discards any response whose id is not the latest | A persistent identifier or database id |
| Pencil palette | `PencilPalette`: the five state colours per channel plus dark-border ratio, as plain data | A named brand of pencil |
| ΔE | CIE76 Euclidean distance in CIELAB (as in the existing change) | CIEDE2000 |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| `pdf-lib` on npm (`npm view pdf-lib version license`) | Current release `1.17.1`, MIT. Pure JS, runs in browser and Node, so exporter is unit-testable in Vitest | MIT | 2026-11-26 |
| `culori` on npm (`npm view culori version license`) | Current release `4.0.2`, MIT | MIT | 2026-11-26 |
| PDF 1.7 / ISO 32000-1 §7.5.2 | A PDF file begins with the `%PDF-` header; basis for the "valid `%PDF-` output" check | Public standard | 2026-11-26 |
| pdf-lib `StandardFonts` | The 14 standard PDF fonts (Helvetica etc.) use WinAnsi encoding; glyphs outside it (`□ ● ◐ ◑ ■`) cannot be drawn with them | MIT | 2026-11-26 (see Unverified) |
| MDN: Web Workers, `Transferable` objects | `ArrayBuffer`s can be transferred zero-copy via `postMessage(msg, [buf])`; module workers via `new Worker(new URL(...), { type: 'module' })` | CC-BY-SA | 2026-11-26 |
| Floyd & Steinberg (1976) | Kernel `7/16, 3/16, 5/16, 1/16` (already adopted in prior change) | Public algorithm | 2026-11-26 |

Failed lookups: none.

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| `pdf-lib` | Adopted | Pure JS, MIT, browser + Node, no server. Explicitly named in plan | 2026-11-26 |
| `jsPDF` | Rejected | Works, but plan names `pdf-lib`; `pdf-lib` gives lower-level page/graphics control needed for true-to-scale templates | 2026-11-26 |
| Server-side PDF rendering | Rejected | Violates the project's zero-backend constraint | 2026-11-26 |
| Native module Web Worker (Vite `new Worker(new URL(...), {type:'module'})`) | Adopted | Bundled by Vite with no extra plugin; keeps engine importable from both worker and Node tests | 2026-11-26 |
| `comlink` for worker RPC | Rejected | One message type in, one out; a ~30-line typed request/response protocol is smaller than the dependency | 2026-11-26 |
| `culori` for the 125-entry LUT build only | Adopted | Plan names it; building 125 entries once per palette is not a hot loop, so allocation cost is irrelevant and it cross-checks our hand-rolled maths | 2026-11-26 |
| `culori` inside the per-pixel matching loop | Rejected | Per-call object allocation; the existing change already decided the hot loop uses typed arrays and a precomputed Lab table | 2026-11-26 |
| Embedding a TTF (e.g. via `@pdf-lib/fontkit`) for symbol glyphs | Rejected | Adds a dependency plus a font file and its licence; shapes drawn as vector paths need neither | 2026-11-26 |
| Draw state symbols as vector shapes (square outline, filled circle, half-filled circle, etc.) | Adopted | Font-independent, crisp at any zoom, works with the 14 standard fonts | 2026-11-26 |
| `OffscreenCanvas` rendering inside the worker | Rejected | Rendering stays on the main thread; only numeric matching moves off-thread | 2026-11-26 |

## Patterns adopted

- **Latest-job-wins worker protocol**: Each request carries a monotonic `jobId`; the worker echoes it; the client drops stale responses. A slider scrub emits many requests, only the newest result is applied. Lands in `src/workers/pipeline.worker.ts` and a small `src/engine/pipelineClient.ts`.
- **Typed-array transfer**: Matched grid is returned as flat `Uint8Array`s (`ri`, `gi`, `bi`) and `Float32Array` (ΔE) transferred rather than cloned. Lands in `src/types/pipeline.ts` (`MatchedGrid`) and the worker.
- **Pure engine, thin adapters**: `guideBuilder.ts` and `pdfExporter.ts` take plain data (`MatchedGrid`, `PencilPalette`) and return plain data / `Uint8Array`; no DOM access, so Vitest in Node covers them. Same principle as the prior change's engine.
- **Vector-drawn glyphs for print**: Shading symbols are drawn with pdf-lib path/ellipse operators, not text. Lands in `src/engine/pdfExporter.ts`.
- **Overlapping tile indices**: Multi-page charts repeat one boundary row/column on adjacent pages with absolute index labels, so tiles can be re-aligned. Lands in `src/engine/guideBuilder.ts` (`paginateChart`).

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| `pdf-lib` latest version and licence | `1.17.1`, MIT | `npm view pdf-lib version license` exited 0 with that output | 2026-11-26 | decays |
| `culori` latest version and licence | `4.0.2`, MIT | `npm view culori version license` | 2026-11-26 | decays |
| `react`, `vite`, `vitest` latest versions | `19.3.1`, `8.4.0`, `5.1.2` (all MIT) | `npm view <pkg> version license` | 2026-11-26 | decays |
| Repo state: no `package.json` or `src/` yet | Only `openspec/` and `playgrounds/` | `ls` at project root | 2026-11-26 | decays once scaffolded |
| Prior change defers worker, PDF, and RLE | Stated in its `research.md` "Raised but not acted on" and `architecture.md` Non-Goals | Read both files from disk | 2026-11-26 | stable |
| Prior change's engine files are `contrast.ts`, `colorMath.ts`, `matcher.ts` and it specifies no worker | Yes | Read its `architecture.md` diagram and Technical Decisions | 2026-11-26 | stable |
| Prototype `rgb_pencil_playground.html` contains an RLE "Column-by-Column Guide" with per-channel `R`/`G`/`B` column cards | Yes | `grep -n -i "rle\|column"` hit `.rle-card`, `.rle-col-tag.R/G/B`, `tab-rle` | 2026-11-26 | stable |
| Default grid `56 × 42` gives `168` stripe columns of `42` rows | `3 × 56 = 168`; worst-case RLE run count `168 × 42 = 7,056` | Arithmetic | 2026-11-26 | stable |

## Unverified assumptions

- **Standard-font glyph coverage**: Assumed `□ ● ◐ ◑ ■` are not encodable in WinAnsi, hence vector shapes. Checking cost: one Vitest case calling `font.encodeText('◐')` and asserting it throws. Done in `tests.md`; if it unexpectedly succeeds the vector approach is still valid, just not required.
- **Worker bundling under Vitest**: Assumed unit tests import the engine function directly rather than spawning a worker, so Node needs no `Worker`. Checking cost: first test run.
- **Worker latency**: Assumed a `96 × 72` run (`6,912 × 125 ≈ 864k` ΔE checks) finishes in under ~100 ms on a mid-range laptop. Not measured; the prior change claims `< 20ms` for `56 × 42`. Checking cost: a timing assertion in `tests.md` as a soft budget, not a hard gate.
- **Print scale**: Assumed PDF user units (1/72 inch) print 1:1 when the viewer's "actual size" is chosen. Checking cost: print one sheet and measure with a ruler.
- **localStorage keys survive the move to the worker**: Fingerprint hashing stays on the main thread (needs the downsampled bytes); assumed the worker response includes them. Checking cost: unit test.
- **Open Questions 1 to 3 defaults** (see Source material) are unconfirmed by the user.

## Superseded claims

- **"Use `culori` for the matcher"** (plan, Component 1) vs. **"pure typed-array math, no heavy dependency"** (`design-language-and-ui-ux/architecture.md` Decision 2). Both are right for different code. Resolution: `culori` builds the 125-entry LUT and serves as an independent cross-check in tests; the per-pixel loop uses the precomputed Lab table with no `culori` calls. The prior change's text is not edited.
- **`<PixelStripePopover>` hover pop-up** (plan) superseded by the approved right inspector sidebar (see prior change).
- **"Distance blur peek" view mode** (plan) not carried over; see "Raised but not acted on".

## Links out

- [Design Language & UI/UX change](../design-language-and-ui-ux/proposal.md): UI, synchronous engine, store, persistence this change builds on.
- [Prior architecture](../design-language-and-ui-ux/architecture.md): engine and store contracts this change must not break.
- [Minimalist Grid Prototype](../../../playgrounds/minimal_grid_playground.html)
- [Original Pipeline Explorer Prototype](../../../playgrounds/rgb_pencil_playground.html): source of the RLE column-card concept.
