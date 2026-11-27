## Source material

### 2026-11-27 — Squint colour-cast report and request (User)
> "the website looks great, but the outputs are looking a little off in terms of color due to the natural effects of color. could we test out some of these optional filters based on this assessment? ff the artifacts, then write the subagent handoff prompt."

The assessment the user pasted (author unstated; reproduced in full for auditability). It describes the two squinted outputs and proposes corrections:

> In the squinted outputs, the blur filter averages the discrete red, green, and blue vertical bars with the surrounding off-white background—exposing color casts that are masked when the individual stripes are sharp.
> White Cat Squinted Output
> - Pale green cast across the muzzle and cheeks: In the sharp RGB grid, the midtones across the center of the cat's face have dense green bars alongside red bars. When blurred, those green bars bleed into the off-white background, creating a faint mint-green patch in the middle of the face.
> - Cool blue-grey fringing on the plate and shadows: Isolated blue vertical stripes along the left rim of the plate, the upper-left background, and the bottom-right corner smear into a cool slate-blue haze instead of neutral grey.
> - Softened contrast in the salad and background: The dark vertical gaps between stripes blend into the colored bars, lifting the blacks into a dark charcoal and muting the greens and yellows on the plate.
> Orange Cat Squinted Output
> - Mint-green highlights on the face: In the sharp RGB grid, the bright fur on the left cheek, chin, and above the eyes is rendered with green stripes alone on off-white paper (with red stripes omitted). Averaging those stripes turns warm cream highlights into a noticeable pale green tint.
> - Muddy olive-brown fur instead of orange: The main coat is built from alternating red and green stripes of similar visual weight separated by dark gaps. When blurred together, red and green average into a dull, desaturated olive-tan rather than vibrant ginger-orange.
> - Pinkish-grey cast in the background: Sparse red bars scattered across the off-white upper-right background blend into a faint warm grey.
>
> To eliminate the green and blue cast ... apply color corrections before uploading—or directly inside your pixel-to-stripe conversion pipeline—to compensate for how reflective paper and human vision weight green and blue much more heavily than red.
>
> 1. Pre-Processing Filters (Before Uploading): Temperature +15 to +25 (warmer); Tint +10 to +20 toward magenta; Red curve midtones 128 -> 145-155; Green curve midtones 128 -> 100-110; Blue curve: inputs below 40 -> 0 and 128 -> 105-115; raise the black point 0 -> 15-25; Vibrance/Saturation +15 to +25 ("Boosting saturation beforehand forces stronger separation between the dominant channel (Red) and the secondary channels (Green/Blue)").
> 2. Per-Image Adjustments: white cat: neutralize shadows (R ≈ G ≈ B); orange cat: hue shift on yellows/oranges (-5 to -10 toward red) and lower green brightness ("reduced to 25–35%").
> 3. Algorithmic Fix: "R' = min(255, R × 1.15), G' = G × 0.80, B' = B × 0.85" and a "Shadow Noise Gate (Deadzone)": "if channel < 25: channel = 0".

Test photos: `evidence/white_cat.jpg` (640×638) and `evidence/cat_face.jpg` (about 735×736), supplied by the user in `screenshots/pr2/` together with sharp, stripes, and squint screenshots of both. The screenshots were viewed: the white-cat Stripes view has a near-black background, an off-white plate and fur with scattered vivid red/green/blue stripes, and a salad built from red/green stripes; the orange-cat Stripes view is almost entirely alternating vivid red and green stripes with no blue, over dark gaps, with off-white stripes only in the brightest areas.

### Raised but not acted on

- **Pre-upload photo edits in external editors** (white balance, curves, vibrance): out of scope for the app. The same operations are available here only as the optional in-pipeline filters below, so they can be compared on identical input.
- **Per-image hue shifts (orange cat) and shadow neutralisation (white cat)**: image-specific edits that cannot be a general default. The `chromaScale`, `gains`, and `blackPoint` controls let the user reproduce the effect per session, but no per-image presets are built.
- **A CIE94 or shortlist-based approximation of CIEDE2000**: measured and rejected (see Verified facts); only the exact full-search CIEDE2000 is offered.
- **Persisting filter settings, and changing defaults**: deferred. The experiment decides what, if anything, becomes a default; adopting a winner is a follow-up change that bumps `PIPELINE_VERSION`.
- **Calibrated real-pencil palettes** (Phase 2): a likely larger lever for hue accuracy, still out of scope.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| Gamut limit | The set of colours the 125 stripe combinations can actually produce (for example reflective palette: L* 9.7 to 89.4, and no bright saturated orange) | A bug in the blur or the matcher |
| Out-of-gamut target | A target colour whose best achievable combo is still far away (CIEDE2000 above about 10) | A pixel outside sRGB |
| Error runaway | Floyd-Steinberg residuals that never shrink because the target is unreachable, so neighbours inherit ever larger corrections and are pushed to saturated combos | Ordinary dithering noise |
| Error limit | `errorLimit` L: the matching value of a cell may deviate from its own (post-filter, pre-diffusion) target by at most L per linear channel | A cap on the dither strength slider |
| Chroma scale | Multiplier applied to Lab a\* and b\* of the target before matching (`1` = unchanged), L\* untouched | Saturation in HSV, or a photo-editor "vibrance" |
| Channel gains | Per-channel multipliers on the 8-bit sRGB target values after contrast (the assessment's "R'=R×1.15, G'=G×0.80, B'=B×0.85") | A white-balance in linear light |
| Black point (gate) | Target channel values strictly below `blackPoint` (0-255 scale) are set to 0 after contrast | The S-curve contrast boost |
| Match metric | The colour-difference formula used to choose the nearest of 125 combos: `de76` (current Euclidean CIELAB) or `de2000` (CIEDE2000, full search) | The `ΔE` number the inspector shows |
| Squint score | The harness measurement: matched mix blurred at `1.0` cell, compared per cell with the unfiltered contrast-boosted target | The visual Squint view itself |
| Experimental filters | The five optional controls above, transient and never saved | Persisted project settings |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| Sharma, Wu, Dalal (2005), *The CIEDE2000 Color-Difference Formula: Implementation Notes, Supplementary Test Data, and Mathematical Observations* | Reference pairs used as test vectors; the in-repo evidence implementation reproduces six of them exactly (2.0425, 2.8615, 3.4412, 1.0000, 4.3065, 1.2644) | Published paper | 2026-11-27 (values recalled and checked against our implementation; the paper itself was not re-fetched) |
| CIE 15 / CIEDE2000 (ISO/CIE 11664-6) | Definition of ΔE00 | Public standard | 2026-11-27 |
| Floyd & Steinberg (1976) | Error-diffusion kernel already used; the standard algorithm does not bound accumulated error | Public algorithm | 2026-11-27 |

Failed lookups: none attempted; no network sources were needed.

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| Exact full-search CIEDE2000 over 125 combos | Adopted (option `metric: 'de2000'`) | Shortlisting by ΔE76 and CIE94 both disagree with it too often (see Verified facts) | 2026-11-27 |
| ΔE76 shortlist (K = 8-24) then CIEDE2000 | Rejected | Only 82.7% (K=8) to 89.5% (K=24) agreement with full search on the reflective palette; worst needed rank 81 | 2026-11-27 |
| CIE94 as a cheap CIEDE2000 stand-in | Rejected | Picks the same combo as CIEDE2000 only 51.6% (reflective) and 62.0% (vibrant) of the time | 2026-11-27 |
| `jpeg-js` (dev dependency, tests only) | Adopted | Pure-JS JPEG decoder so Vitest can load the two real photos without a canvas; version `0.4.4`, BSD-3-Clause | 2026-11-27 |
| `sharp` / `canvas` / Playwright fixture export | Rejected | Native or browser dependencies for a one-off decode | 2026-11-27 |
| Error limit as a bounded deviation from the cell's own target | Adopted | One parameter, trivially testable bound | 2026-11-27 |
| Scaling or skipping diffusion by a reachability test | Rejected | More parameters and a heuristic threshold for the same effect | 2026-11-27 |
| Persisting filters in project settings | Rejected for now | Needs schema, import validation, lock and confirmation rules; the experiment does not need it | 2026-11-27 |

## Patterns adopted

- **Filters beside settings, not inside**: `PipelineRequest { image, settings, filters? }`, so the persisted `PipelineSettings` / `StoredSettings` shape and the `.rgbpencil.json` format are untouched. Lands in `src/types/pipeline.ts`.
- **Identity by construction**: every filter has an identity value, and when all are at identity the stage code is skipped, so default output is byte-identical to today. Lands in `src/engine/matcher.ts`.
- **Evaluate before adopting**: a pure harness scores each candidate on fixed fixtures with fixed metrics. Lands in `src/engine/evaluation/filterEval.ts`.
- **Reuse existing completion gating**: the Squint preview already blocks every completion path through one selector; experimental filters join that gate. Lands in `src/store/gridStore.ts`.

## Verified facts

All numbers below come from `evidence/gamut.py` and `evidence/bench.mjs` (re-runnable; they re-implement the 125-combo LUT, ΔE76, and CIEDE2000 from `src/engine/palettes.ts` and `colorMath.ts`).

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| Achievable lightness range of the 125 mixes | reflective L\* 9.7 to 89.4 (darkest mix sRGB 27,27,29; brightest 227,224,218); vibrant 6.3 to 91.6 | `gamut.py` output | 2026-11-27 | stable until palettes change |
| Neutrals and shadows are well represented | grey 128 and 200, plate shadow, white fur: best-pick ΔE00 3.0 to 4.5 (reflective, before dithering) | `gamut.py` output | 2026-11-27 | stable |
| Warm saturated colours are not | bright orange (237,145,33): ΔE76 pick ●●■ mix (115,90,47) with ΔE00 31.2; CIEDE2000 pick ●●□ mix (175,159,139) with ΔE00 21.1; ginger (222,150,90): ΔE00 15.9 (reflective) | `gamut.py` output | 2026-11-27 | stable |
| Metric changes the pick substantially on the vibrant palette | ginger: ΔE76 pick ΔE00 23.1 vs CIEDE2000 pick ΔE00 13.6 | `gamut.py` output | 2026-11-27 | stable |
| ΔE76 and CIEDE2000 pick the same combo rarely on random/warm targets | 44.1% (reflective), 43.1% (vibrant), 2,000 targets | `gamut.py`-derived script run in this session | 2026-11-27 | stable |
| Shortlist coverage is poor | ΔE76 top-K contains the CIEDE2000 argmin: K=8 82.7%, K=24 89.5% (reflective); emissive K=24 99.2%; worst rank 81 | same | 2026-11-27 | stable |
| Full 125-combo CIEDE2000 search cost | 485 ms for 6,912 cells (96×72); about 165 ms at 56×42 | `bench.mjs` on Node 22.23.2 | 2026-11-27 | depends on host |
| In-repo CIEDE2000 matches published data | 6 of 6 Sharma pairs to 4 decimals | evidence script comparison | 2026-11-27 | stable |
| The matcher never limits accumulated diffusion error | `matchGrid` clamps each cell's target to [0,1] only; error `(target - combo.lin) * ditherStrength` is added to 4 neighbours unbounded | read `src/engine/matcher.ts` L219-L252 on `master` (`0994d96`) | 2026-11-27 | decays |
| `PipelineRequest` is `{ image, settings }` and `recordFromState` takes only `settings` | so a sibling `filters` field cannot reach the persisted record | read `src/types/pipeline.ts` L173-L176 and `gridStore.ts` L449 | 2026-11-27 | decays |
| Export button gating point | `exportButton.disabled = busy \|\| !grid \|\| pending` at `src/ui/topBar.ts:492` | read file | 2026-11-27 | decays |
| `jpeg-js` | `0.4.4`, BSD-3-Clause | `npm view jpeg-js version license` | 2026-11-27 | decays |

## Unverified assumptions

Hypotheses the experiment exists to test (each stated so it can fail):

- **H1**: Limiting diffusion error (`errorLimit`, about 0.05 to 0.10) reduces the vivid red/green speckle on out-of-gamut areas (cream, orange) and lowers mean squint ΔE00 on both photos. Check: harness sweep.
- **H2**: `metric: 'de2000'` gives paler, less olive warm tones and lowers `warmDE00`, with no worse neutral cast. Check: harness sweep.
- **H3**: Mild `chromaScale` below 1 (0.8 to 0.9) beats `chromaScale` above 1, because unreachable chroma is what drives runaway; the assessment's saturation boost will worsen `meanDE00`. Check: harness sweep over 0.7 to 1.3.
- **H4**: The assessment's channel gains (1.15, 0.80, 0.85) move colour toward a warm tint and raise `meanDE00` against the unfiltered target by construction, so they cannot be scored as "fixing" a cast; they may still be preferred by eye. Check: harness, plus user's visual judgement.
- **H5**: A black point of 15 to 25 removes dark-area speckle (`darkSpeckle` falls) at negligible cost to `meanDE00`. Check: harness sweep.
- **Assumption**: results on two JPEG-compressed photos generalise only loosely; the harness also uses synthetic patches. Checking cost: more fixtures later.
- **Assumption**: a 165 to 485 ms CIEDE2000 run in the worker is acceptable for an experimental control (coalescing means at most one extra run). Checking cost: browser measurement during verification.

## Superseded claims

- **"The blur averages stripes with the surrounding off-white background, exposing casts"** (assessment): not what the code does. The Squint blur pads with paper only beyond the grid edge (`opticalBlur.ts`); interior cells mix only with neighbouring cells. The visible casts come from the matched stripe pattern itself (gamut limit plus error runaway), which Stripes view merely masks by being sharp. The assessment's observations of the images are still useful evidence.
- **"Green and blue are weighted too heavily by the pipeline; scale channels (R×1.15, G×0.8, B×0.85)"** (assessment): the matcher is channel-symmetric in linear light, and neutrals match well (ΔE00 3 to 4.5). Fixed gains would tint every image warm rather than correct a measured bias. Kept only as one tested preset.
- **"Boost saturation beforehand"** (assessment): moves more targets out of gamut, which the evidence suggests increases runaway. Included in the sweep to test, expected to lose (H3).

## Links out

- [matcher.ts](../../../src/engine/matcher.ts), [palettes.ts](../../../src/engine/palettes.ts), [colorMath.ts](../../../src/engine/colorMath.ts): current engine.
- [out-of-focus-preview](../out-of-focus-preview/proposal.md): the Squint preview this experiment is evaluated through.
- [project-persistence](../project-persistence/architecture.md): why filters are kept out of persisted settings.
