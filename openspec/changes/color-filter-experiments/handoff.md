# OpenCode Orchestration Handoff: OpenSpec Change 'color-filter-experiments'

You are the orchestration agent for OpenSpec change 'color-filter-experiments' running in OpenCode.
Your primary directive is to execute this change using the **`openspec-apply-sub`** skill, which delegates task implementation to the `spec-coder-sub` subagent.

## 1. Orchestration Directive
- **Change Name**: color-filter-experiments
- **Target Skill**: `openspec-apply-sub` (or `/opsx:apply-sub color-filter-experiments`)
- **Architecture Paradigm**: Vertical Slice Architecture (VSA). Keep the engine pure and DOM-free; keep UI modules thin; no horizontal abstractions.
- **Change Directory**: `openspec/changes/color-filter-experiments` (`research.md`, `proposal.md`, `specs/{color-filter-pipeline,filter-experiments-ui,filter-evaluation}/spec.md`, `architecture.md`, `design.md`, `tests.md`, `tasks.md`, `evidence/`). Read all of them before delegating. `research.md` explains the measurements the design rests on; `evidence/gamut.py` and `evidence/bench.mjs` reproduce them.
- **What this is**: an **experiment**, not a fix. Five optional filters, default off, plus an evaluation harness and a decision record. Do NOT change any default, do NOT bump `PIPELINE_VERSION`, and do NOT declare a winner on your own: the sweep numbers and screenshots go in `verification.md` for the maintainer to judge.

### 1a. Branch Setup
PR #1 and PR #2 are merged. Implement on top of `origin/master`.
1. `git fetch origin`
2. `git checkout -b feat/color-filter-experiments origin/master` (confirm `git log -1` shows the PR #2 merge, `0994d96`, or later).
3. Bring the planning artifacts and this handoff onto the branch: `git checkout master -- openspec/changes/color-filter-experiments` (local `master` holds them at `6dd037c` plus the handoff commit), then commit as `docs(openspec): record planning artifacts and handoff for color-filter-experiments`.
4. **Git identity**: do NOT change git config. Existing commits use the GitHub noreply address `107519369+slowbutfast@users.noreply.github.com` (a private address was rejected earlier, GH007). Verify `git log -1 --format=%ae` before your first commit.
5. Do not touch or push `master`. `screenshots/` and `.playwright-mcp/` at the repo root are untracked tool output: never commit them.

## 2. Target Context Map
Line numbers are anchors on `master` at `0994d96`; locate by symbol if they shift.

| File Path (relative to repo root) | Target Lines | Modification Summary |
|---|---|---|
| `package.json`, `package-lock.json` | `devDependencies` | Add `jpeg-js@^0.4.4` as a **dev** dependency only (tests). No other dependency changes |
| `src/engine/__tests__/fixtures/white_cat.jpg`, `cat_face.jpg` | `[NEW]` | Copy from `openspec/changes/color-filter-experiments/evidence/` (640×638 and about 735×736) |
| `src/types/pipeline.ts` | `PipelineSettings` `L59-L65`, `DEFAULT_SETTINGS` `L74`, `PipelineRequest` `L173-L176` | Add `ColorFilters`, `DEFAULT_FILTERS`, `isDefaultFilters`, bound constants (`blackPoint` 0-40, gains 0.6-1.4, `chromaScale` 0.5-1.5, `errorLimit` null or 0.02-0.5), and `filters?: ColorFilters` on `PipelineRequest`. Do NOT change `PipelineSettings`, `StoredSettings`, or `PIPELINE_VERSION` |
| `src/engine/colorMath.ts` | after `deltaE76Squared` `L58` | Add `deltaE2000(lab1, lab2)` and `labToLinearRgb(l, a, b)` (inverse of `linearRgbToLab` at `L46`, same D65 matrices). Reuse `srgbToLinear` / `linearToSrgb` |
| `src/engine/matcher.ts` | `assertSettings` `L113`, `nearestComboIndex` `L126-L145`, `matchGrid` `L182-L262` (contrast stage `L195-L208`, matching loop `L219-L250`) | `matchGrid(image, settings, filters?, hooks?)`: validate filters (`RangeError`); black-point gate, channel gains, chroma scale after the contrast stage, each skipped at identity; filtered 8-bit `target`; error-limit clamp using a pre-diffusion copy of the post-filter linear target; add `nearestComboIndex2000` full-search CIEDE2000; `hooks.onCell(index, used, original)`; `deltaE` stays ΔE76. Default path must stay byte-identical |
| `src/engine/pipeline.ts` | `runPipeline` `L19-L21` | Forward `request.filters` (and no hooks) to `matchGrid` |
| `src/engine/engineClient.ts`, `src/engine/pipelineClient.ts`, `src/workers/pipeline.worker.ts` | `process` / `handlePipelineJob` | Verify-only: they already pass the whole request through. Change only if a test proves `filters` is dropped |
| `src/engine/evaluation/filterEval.ts` | `[NEW]` | `evaluate`, `sweep`, fixture helpers, markdown table formatter; reuse `buildLinearStripeRaster` and `blurLinearRaster` from `src/engine/opticalBlur.ts` and `downsampleAreaAverage` from `matcher.ts`. Pure, no DOM |
| `src/engine/__tests__/{colorFilters,filterEval,filterSweep}.test.ts` | `[NEW]` | Per `tests.md` |
| `src/engine/__tests__/colorMath.test.ts` | new cases | `deltaE2000` Sharma pairs, `labToLinearRgb` round trip |
| `src/store/gridStore.ts` | `GridStoreState` `L114`, `GridStore` `L147`, `computeBanners` `L311`, `resetProjectFlags` `L396`, `recompute` `L426`, `applyLoadedProject` `L628`, delete-fallback `L734` and `L903`, `loadImage` `L751`, `startNewDrawingFromImage` `L910`, `importProject` `L998`, `toggleCell` `L1187`, `paintCell` `L1201` | Transient `filters`, `filtersActive` selector, `setFilters(patch)` (returns `{ ok: false, reason: 'locked' }` while any cell is done; allowed in read-only tabs), `resetFilters`, reset to defaults on every image/project replacement path, pass `filters` into `client.process` in `recompute`, store-level block of `toggleCell`/`paintCell` while active, a `filters` banner id. Filters must NOT reach `recordFromState` (`L449`), autosave, or export, and must NOT call `autosave.schedule()` |
| `src/ui/settingsPopover.ts` | inside `mountSettingsPopover` `L50-L592`; `index.html` popover `L55` only if a static container is needed | `Color filters (experimental)` collapsed `<details>` section: preset select, metric select, error-limit select, chroma, R/G/B gains, black point, Reset filters, lock caption. Use existing tokens and helpers; build in code like the existing import controls |
| `src/ui/topBar.ts` | export gating `L492-L494`, export click handler, `renderBanners` `L169` | Disable Export PDF with an explanatory `title` while `filtersActive` (also guard the click handler); banner rendering needs no new styling |
| `src/ui/gridCanvas.ts` | draw `L303-L306`, pointer handlers `L399-L405` and `L421-L422` | Block click/drag completion while `filtersActive` (alongside the existing `readOnly` and Squint checks); Pixel Grid must draw `MatchedGrid.target` (the post-filter target) |
| `src/ui/inspectorSidebar.ts` | `L82`, hint `L130`, `markDone.disabled` `L144` | `Mark Done / Undo` disabled while `filtersActive`; hint `Experimental filters — clicks inspect only` |
| `src/store/__tests__/gridStore.test.ts`, `src/ui/__tests__/ui.test.ts`, `src/ui/__tests__/filtersUi.test.ts` | new cases / `[NEW]` | Per `tests.md` |
| `src/styles/main.css` | append only if existing classes are insufficient | No new tokens or colours; reuse existing control, disabled, and status-line styles |

**Do NOT modify**: `src/store/project*.ts`, `autosave.ts`, `legacyMigration.ts`, `imageCodec.ts`, `completedCodec.ts`, `src/engine/pdfExporter.ts`, `guideBuilder.ts`, `opticalBlur.ts` (reuse only), `src/ui/topBar.ts` Space-peek and view-menu code, `playgrounds/*`, `DESIGN.md`, other changes' artifacts.

## 3. Technical & Architectural Boundaries
- **In-Scope Decisions** (see `architecture.md`):
  1. `filters` is a sibling of `settings` in `PipelineRequest`; persisted shapes and `PIPELINE_VERSION` are untouched.
  2. Fixed stage order: downsample, contrast, black-point gate (8-bit), channel gains (8-bit sRGB), chroma scale (Lab a\*,b\*), linearize, match. A stage at identity is skipped, so default output is **byte-identical** to today (regression test on every fixture, dither on and off).
  3. Error limit: `used = clamp01(clamp(adjusted, orig - L, orig + L))`; residual computed from `used`; `null` or `L >= 1` equals current behaviour.
  4. `metric: 'de2000'` evaluates **all 125 combos** with exact CIEDE2000. Do NOT shortlist or substitute CIE94: measured agreement with the exact answer was only 82.7-89.5% (top-K shortlist) and 52-62% (CIE94), and the misses are the out-of-gamut warm colours under study. Expect about 165 ms at 56×42 and 485 ms at 96×72; it runs in the worker with latest-wins coalescing.
  5. Filters are session-only, preview-only (completion and Export PDF blocked, store-enforced), locked while any cell is done, and reset on every image or project change and on reload.
  6. The harness scores through the same Squint renderer the UI uses and **does not assert improvement**; hypotheses H1-H5 in `research.md` are decided from the printed numbers.
- **Hard Exclusions / No-Go**:
  - Do NOT modify `.env`, `.env.*`, or credential files.
  - Do NOT introduce any dependency other than dev-only `jpeg-js@^0.4.4`.
  - Do NOT change defaults, persist filters, or bump `PIPELINE_VERSION`.
  - Do NOT tune presets or thresholds to make a candidate "win"; report the numbers as they come out.
  - Do NOT start a public tunnel; use `localhost` only (reuse a dev server on `5173`, otherwise `npx vite --port 5173`).
  - Do NOT modify files outside the Target Context Map without prior task coverage.
- **Baseline invariant**: run `npm test` and `npm run build` before editing (task 1.1) and keep every pre-existing test passing unchanged.

## 4. Visual & UI Design Specifications & Vision Verification
- **Theme**: "Studio Draftboard — Experimental Colour Filters": existing chrome, **no new tokens, colours, fonts, or layouts** (`design.md`).
- **Key Tokens** (all existing in `src/styles/tokens.css`): Primary ink `--ink` `#171717` | Background `--bg` `#fafafa` | Surface `--surface-popover` / `--surface` `#ffffff`; Text primary `#171717`, muted `--ink-muted` `#525252`; hairline `--line` `#e5e5e5`; `--surface-subtle`, `--surface-active`, `--status-warning`.
- **Component Anatomy & States**:
  - `FiltersSection` (`[data-ui="filters-section"]`): `<details>` at the bottom of the Settings popover, closed by default; summary shows the eyebrow label (`11px`, `600`, `0.08em` tracked, uppercase) and the preset name or `Custom`. Rows: preset select; `Match metric` select; `Error limit` select (`Off`, `0.20`, `0.10`, `0.05`, `0.02`); `Chroma` range (`0.5-1.5`, step `0.05`); `R`/`G`/`B` gains (`0.6-1.4`, step `0.01`); `Black point` (`0-40`, step `1`); `Reset filters` secondary button. Each range shows its value in mono `11.5px`. States: default; hover `--surface-subtle`; focus `outline: 2px solid var(--ink); outline-offset: 2px`; locked (`doneCount > 0`) existing disabled style (`opacity: 0.45; cursor: not-allowed`) plus one caption line.
  - `FiltersBanner` (`[data-ui="filters-banner"]`): one dismissible line in the existing banner stack, text `Experimental colour filters are on: preview only. Marking cells and PDF export are disabled; filters reset on reload.`; hidden when filters are default; dismiss hides it until the next filter change. Never overlays the grid.
  - Presets: `None (baseline)`; `Assessment: warm bias` (gains `[1.15, 0.80, 0.85]`, black point `25`, chroma `1.2`); `Gamut-soft` (chroma `0.85`, error limit `0.10`, `de2000`); `CIEDE2000 only`; `Error limit only` (`0.10`). Selecting a preset sets every control; editing any control shows `Custom`.
- **Responsive Layout**: desktop `>= 768px` section inside the popover (label `56px`, range flexible, value `36px`); mobile `< 768px` selects, `Reset filters`, and range thumbs `>= 44px` touch height.
- **Multi-Modal Vision Verification**:
  - `deepseek-flash` natively supports vision inputs. Capture screenshots with the Playwright CLI (`localhost` only). Load each photo through the upload input (`page.setInputFiles` on the file input) and, in **Squint at `1.0` cells**, capture every preset for both photos at `1280×800`, plus the open filters section and the banner at `390×844`. Inspect the images directly and describe, per preset, the mint tint on cream fur, olive ginger, and dark-area speckle.
  - Judging which result looks best is a subjective call: record your observations beside the numeric table and leave the final visual verdict marked for manual maintainer review.

## 5. Test Scaffolding & Verification Commands
- **Primary Test Runner**: `npm test` (`vitest run`); build `npm run build` (`tsc --noEmit && vite build`).
- **Targeted loop commands** (narrowest file only):
  - `npx vitest run src/engine/__tests__/colorMath.test.ts`
  - `npx vitest run src/engine/__tests__/colorFilters.test.ts`
  - `npx vitest run src/engine/__tests__/filterEval.test.ts`
  - `npx vitest run src/engine/__tests__/filterSweep.test.ts` (prints the markdown table; slow because of CIEDE2000)
  - `npx vitest run src/ui/__tests__/filtersUi.test.ts`
- **Full verification** (documented host override for `safe-test`'s virtual-memory cap, which otherwise breaks Vitest 5 here):
  ```bash
  SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm test -- --maxWorkers=1
  SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm run build
  openspec validate color-filter-experiments --strict
  ```
  Also re-run the main-spec validation command recorded in earlier `verification.md` files.
- **TDD Requirement**: Task group ## 1 MUST scaffold failing tests before touching implementation. Show them failing (module-resolution and assertion failures are acceptable) and record the red run in `verification.md`. Write the byte-identical-defaults test first.
- **Resource & Concurrency Rules**:
  - During task implementation run ONLY the narrowest test file. Do NOT run the sweep or browser captures on every checkbox.
  - Wrap full runs with `safe-test` and `--maxWorkers=1`.

## 6. Implementation Task Checklist
## 1. Test Scaffolding (TDD)

- [ ] 1.1 Branch from `origin/master` (PR #2 merged), run `npm test` and `npm run build` before any edit, and record the baseline file and test counts in `verification.md`
- [ ] 1.2 Write failing tests in `src/engine/__tests__/colorMath.test.ts` for `deltaE2000` (six Sharma pairs within `1e-4`, symmetry) and `labToLinearRgb` (round trip within `1e-4`)
- [ ] 1.3 Write failing tests in `src/engine/__tests__/colorFilters.test.ts` for identity (byte-identical defaults), range validation, black-point gate, channel gains, chroma scale, filtered `target`, error-limit bound via `onCell`, exact full-search CIEDE2000 (orange picks `(1,1,4)` vs `(1,1,0)`; brute-force equality), `deltaE` staying ΔE76, `sourceHash` stability, worker-handler equality, and stale-result discard
- [ ] 1.4 Write failing tests in `src/engine/__tests__/filterEval.test.ts` (zero score for perfect rendering, signed `+3 a*` shift, border exclusion, determinism, fixture dimensions) and the `filterSweep.test.ts` skeleton (table printed, baseline row equals unfiltered evaluation, no improvement assertion)
- [ ] 1.5 Write failing store and UI tests (`gridStore.test.ts`, `ui.test.ts`, new `filtersUi.test.ts`) for the collapsed section, presets, `Custom`, reset, transient lifecycle and non-persistence, preview-only gating (click, drag, `Mark Done`, store-level block, Export PDF), banner, inspector hint, filtered target in Pixel Grid, lock while cells are done, and read-only tabs

## 2. Dependencies, Fixtures & Contracts

- [ ] 2.1 Add `jpeg-js@^0.4.4` as a **dev** dependency (tests only) and copy `evidence/white_cat.jpg` and `evidence/cat_face.jpg` to `src/engine/__tests__/fixtures/`
- [ ] 2.2 Add `ColorFilters`, `DEFAULT_FILTERS`, `isDefaultFilters`, filter bounds constants, and `filters?` on `PipelineRequest` in `src/types/pipeline.ts` (no change to `PipelineSettings` or `StoredSettings`)
- [ ] 2.3 Add `deltaE2000` and `labToLinearRgb` to `src/engine/colorMath.ts`

## 3. Engine

- [ ] 3.1 Extend `matchGrid(image, settings, filters?, hooks?)` in `src/engine/matcher.ts`: validation, black-point gate, channel gains, chroma scale (each skipped at identity), filtered `target`, and the `hooks.onCell` test hook; confirm byte-identical defaults
- [ ] 3.2 Implement the bounded-error clamp (`errorLimit`) in the matching loop, using a pre-diffusion copy of the post-filter linear target
- [ ] 3.3 Implement the exact full-search CIEDE2000 option (`metric: 'de2000'`) with ΔE76 still reported in `deltaE`
- [ ] 3.4 Forward `filters` through `runPipeline` (`src/engine/pipeline.ts`), `engineClient.ts`, `pipelineClient.ts`, and the worker adapter without changing message shapes or `PIPELINE_VERSION`

## 4. Store & UI

- [ ] 4.1 Update `src/store/gridStore.ts`: transient `filters`, `filtersActive` selector, `setFilters` (locked while cells are done), `resetFilters`, reset on every image/project replacement path, store-level completion block, `filters` banner, and keep filters out of `recordFromState` and autosave
- [ ] 4.2 Add the `Color filters (experimental)` section to `src/ui/settingsPopover.ts` (presets, metric, error limit, chroma, gains, black point, Reset filters, lock caption), using existing tokens only
- [ ] 4.3 Update `src/ui/topBar.ts` (Export PDF disabled and title while active, banner line), `src/ui/gridCanvas.ts` (completion blocked and filtered target in Pixel Grid), and `src/ui/inspectorSidebar.ts` (`Mark Done / Undo` disabled, hint text)

## 5. Evaluation Harness

- [ ] 5.1 Implement `src/engine/evaluation/filterEval.ts` (fixtures loader helpers, Squint-score metrics, `evaluate`, `sweep`, markdown table formatter) reusing `buildLinearStripeRaster` and `blurLinearRaster`
- [ ] 5.2 Implement the sweep configurations and printing in `src/engine/__tests__/filterSweep.test.ts`

## 6. Verification & Empirical Audit

- [ ] 6.1 Run full regression (`npm test`) and `npm run build`; verify clean passes, byte-identical defaults, and the worker chunk still separate
- [ ] 6.2 Run the sweep, paste the table into `verification.md`, give each hypothesis H1 to H5 a numeric verdict, state the recommendation using the adoption criteria, and record CIEDE2000 timings at `56` and `96` columns
- [ ] 6.3 Capture Squint screenshots of both photos for each preset (desktop and `390×844`) and note observations beside the numbers; mark the final visual judgement for maintainer review
- [ ] 6.4 Populate `verification.md` with the Requirement Adherence Audit Matrix, resolved assumptions, and verbatim execution logs

## 7. Post-Implementation & Verification Obligations
When `spec-coder-sub` finishes:
1. Verify all checkboxes in `tasks.md` are marked `- [x]`. Only tick boxes that genuinely ran and passed.
2. Confirm no regression: the full suite is at least the recorded baseline plus the new tests, with every pre-existing test unchanged, and default-filter output is byte-identical (state the test that proves it).
3. Ensure `openspec/changes/color-filter-experiments/verification.md` is populated with:
   - Executive Summary & Environment (base commit, runner versions, Node version)
   - Requirement Adherence Audit Matrix mapping every scenario in the three specs to its verifying test or marked manual check
   - **Decision record**: the sweep table verbatim, a numeric verdict (`supported` / `not supported` / `inconclusive`) for each hypothesis H1-H5 citing sweep values, and a recommendation applying the adoption criteria in `specs/filter-evaluation` (at least 5% lower `meanDE00` on both photos, no more than 0.5 increase in `|neutralDa|` or `|neutralDb|`, no rise in `warmDE00`); if nothing qualifies, say so
   - Resolved Assumptions & Empirical Proof, including measured CIEDE2000 run times at 56 and 96 columns (soft budget, report only) and the screenshots from Section 4
   - Nomenclature & Code Symbol Audit (`filters`, `ColorFilters`, `filtersActive`, `errorLimit`, `chromaScale`, `metric`)
   - Verbatim Execution Logs (red run, green run, sweep, build, `openspec validate --strict`)
4. Automatically run verification via `openspec-verify-change`.

## 8. Verification Review & Single-Pass Automated Repair (Max Retries = 1)
- **If verification succeeds with zero critical issues**:
  1. Sync delta specs via the `openspec-sync-specs` skill for `color-filter-experiments` (all three specs are ADDED; no MODIFIED requirements).
  2. **Open a Pull Request**:
     - Work stays on `feat/color-filter-experiments` (Section 1a).
     - Stage and commit all implementation code and every artifact in the change directory (`git add openspec/changes/color-filter-experiments openspec/specs <implementation-files>`), push with `git push -u origin HEAD`.
     - Open the PR against `master`: `gh pr create --base master --head feat/color-filter-experiments --title "feat: experimental colour filters and evaluation harness" --body "<summary of proposal.md and verification.md, including the sweep table and the recommendation>"`. State plainly in the body that no defaults changed. Report the PR URL.
- **If CRITICAL issues or failed test verification errors are detected on initial pass**:
  1. Announce: "Verification failed on initial pass. Attempting a single bounded repair pass via subagent..."
  2. Delegate a single-pass repair task to `spec-coder-sub` with the verification failure context:
     > "Fix the specific verification failures and test errors reported for change 'color-filter-experiments'. Refer to the error log, make minimal targeted patches to resolve the failures, run verification commands, and update tasks.md."
  3. Re-run verification via `openspec-verify-change`.
  4. **If verification passes after repair**: sync delta specs, stage, commit, push, and open the PR against `master` as above.
  5. **If verification STILL fails after the single repair pass**: **HALT**. Do NOT loop or re-run. Present the Verification Report and remaining blockers to the user for manual guidance.
