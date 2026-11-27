# OpenCode Orchestration Handoff: OpenSpec Change 'out-of-focus-preview'

You are the orchestration agent for OpenSpec change 'out-of-focus-preview' running in OpenCode.
Your primary directive is to execute this change using the **`openspec-apply-sub`** skill, which delegates task implementation to the `spec-coder-sub` subagent.

## 1. Orchestration Directive
- **Change Name**: out-of-focus-preview
- **Target Skill**: `openspec-apply-sub` (or `/opsx:apply-sub out-of-focus-preview`)
- **Architecture Paradigm**: Vertical Slice Architecture (VSA). Keep the engine module pure and DOM-free; keep UI modules thin; no horizontal abstractions.
- **Change Directory**: `openspec/changes/out-of-focus-preview` (artifacts: `research.md`, `proposal.md`, `specs/{squint-preview,interactive-pixel-grid,design-language}/spec.md`, `architecture.md`, `design.md`, `tests.md`, `tasks.md`). Read all of them before delegating.

### 1a. Branch Setup (this change stacks on an OPEN PR)
PR #1 (`feat/multi-20261126-2351`, https://github.com/slowbutfast/rgb-pencil/pull/1) is still open at head `0374420` (PATCH-06 applied). The implementation this change modifies exists only on that branch, not on `master`.
1. `git fetch origin`
2. `git checkout -b feat/out-of-focus-preview origin/feat/multi-20261126-2351` (confirm `git rev-parse HEAD` starts with `0374420`; if PR #1 has since merged, branch from `origin/master` instead and say so in the final report).
3. Bring the planning artifacts and this handoff onto the branch: `git checkout master -- openspec/changes/out-of-focus-preview`, then commit them as `docs(openspec): record planning artifacts and handoff for out-of-focus-preview`.
4. **Git identity**: do NOT change git config. The existing commits use the GitHub noreply address `107519369+slowbutfast@users.noreply.github.com`; GitHub rejected a private address earlier (GH007). Verify `git log -1 --format=%ae` matches before your first commit.
5. Never push to or commit on `feat/multi-20261126-2351`; it belongs to PR #1.

## 2. Target Context Map
Line numbers are anchors at PR #1 head `0374420`; if PATCH-06 or later commits shifted them, locate by the named symbol.

| File Path (relative to repo root) | Target Lines | Modification Summary |
|---|---|---|
| `src/types/pipeline.ts` | `L206` (`ViewMode`), near `L71` (`DARK_BORDER_RATIO`) | Extend `ViewMode` to `'grid' \| 'stripes' \| 'squint'`; export `VIEW_MODE_ORDER`, `VIEW_MODE_LABELS`, `MIN_BLUR_CELLS = 0`, `MAX_BLUR_CELLS = 1.5`, `DEFAULT_BLUR_CELLS = 0.75`. Do not touch other contracts |
| `src/engine/opticalBlur.ts` | `[NEW]` | `buildLinearStripeRaster(grid)` (`3×3` isotropic `Float32Array`, `DARK_BORDER_RATIO` folded into coverage); continuous-coverage 3-pass box blur with bisection-solved real widths (variance `sigmaSubpx²/3` per pass, `sigmaSubpx = blurCells * 3`), interpolated prefix sums, linearized `#fafafa` padding; `blurLinearRasterToSrgb(raster, blurCells, paperRgb)` with a 4096-entry encode table. Reuse `srgbToLinear` / `linearToSrgb` from `src/engine/colorMath.ts`. Pure, no DOM |
| `src/engine/__tests__/opticalBlur.test.ts` | `[NEW]` | All math tests listed in `tests.md` |
| `src/store/gridStore.ts` | `GridStoreState` `L111-L136`, `GridStore` interface `L138-L180`, initial state `L263-L275`, `setViewMode` `L1118-L1121` | Add `blurCells`, `squintPeek`, `painting`, `setBlurCells`, `setSquintPeek`, `setPainting`, `effectiveMode` selector; `setViewMode` accepts `'squint'`. None of these dirty the project, schedule autosave, or are blocked by `readOnly` |
| `src/store/__tests__/gridStore.test.ts` | new cases | View-state tests per `tests.md` |
| `index.html` | `L26-L28` (the two mode buttons), `L16` (`#stage`), `L74` (`.corner-hint`) | Replace `#btnModeGrid` / `#btnModeStripes` with `.view-mode-menu` (`data-ui="view-mode-trigger"`, `view-mode-dropdown`, 3 fixed-order `role="menuitemradio"` `data-ui="view-mode-option"` items); add `#focusBar` (`data-ui="focus-bar"`, `focus-input`) inside `#stage`, `hidden` by default |
| `src/styles/main.css` | `.pill-group` `L71`, `.btn` `L84-L110`, `.corner-hint` `L232`, `.save-status` `L455`; append new rules | `.view-mode-menu`, JS-driven `.open` dropdown with chevron rotation and staggered options, `.focus-bar`, `>= 44px` touch targets, reduced-motion collapse. Use existing tokens only (`--surface-popover`, `--shadow-popover`, `--radius-lg`, `--surface-subtle`, `--surface-pill`, `--shadow-pill`, `--surface-active`, `--radius-full`, `--ink`, `--ink-muted`, `--line`) |
| `src/ui/topBar.ts` | element lookups `L49-L50`, render toggles `L264-L265`, `onReset` `L309`, listeners `L353-L359`, cleanup `L366-L372` | Replace the two mode buttons with the dropdown (hover/tap/keyboard, `aria-expanded`/`aria-checked` sync, `(hover: hover) and (pointer: fine)` with `change` listener, post-select blur, pointer-click blur when `event.detail > 0`, Settings-close focus to `document.body`); Focus slider with rAF coalescing and `aria-valuetext`; Spacebar peek per `architecture.md` Decision 6 |
| `src/ui/gridCanvas.ts` | `drawAxes` `L131`, `drawCell` `L194-L226` (`viewMode` at `L200`), `draw` `L227`, `onPointerMove` `L315`, `onPointerDown` `L334`, `onPointerLeave` `L354`, `onPointerUp` `L371`, listeners `L392-L395`, cleanup `L409-L412` | Render `effectiveMode`; in Squint skip axes, grid lines, 5-cell lines, hover ring; draw cached blur canvas over the grid footprint only (no layout change); `imageSmoothingEnabled = blurCells > 0`; single-entry caches (raster per `grid`, blur canvas per `(grid, blurCells)`); `default` cursor; ignore completion clicks/drags; keep hover/inspect live; no-op when `grid` is `null`; set store `painting` during drag-paint |
| `src/ui/inspectorSidebar.ts` | `markDone` button `L49-L60` and its render/update logic | Render `Mark Done / Undo` disabled and inert while `effectiveMode === 'squint'` |
| `src/ui/__tests__/ui.test.ts` | legacy `describe('Pixel Grid / Stripes view toggle')` `L296-L312`; new cases | Replace the legacy two-button assertions; add dropdown, Focus slider, Spacebar peek, activation-safety, and Squint canvas tests per `tests.md` (inject a fake `matchMedia`; jsdom has none) |

**Do NOT modify**: `src/engine/matcher.ts`, `pipeline.ts`, `pipelineClient.ts`, `src/workers/*`, `src/engine/pdfExporter.ts`, `guideBuilder.ts`, any `src/store/project*.ts`, `autosave.ts`, `legacyMigration.ts`, `imageCodec.ts`, `completedCodec.ts`, `playgrounds/*`, `DESIGN.md`, or other changes' artifacts.

## 3. Technical & Architectural Boundaries
- **In-Scope Decisions** (see `architecture.md`):
  1. `3×3` isotropic Linear RGB raster with the `0.15` dark border folded into coverage `(1 - b) * stripeLin + b * borderLin`; every cell's mean linear RGB must equal `buildComboLUT`'s `lin` within `1e-5`.
  2. Continuous-coverage 3-pass box blur with bisection-solved real widths (exact total variance `(blurCells * 3)²`, strictly monotonic in `blurCells`, O(N) via interpolated prefix sums). Do NOT use integer Kovesi `boxesForGauss` or `sqrt(4σ²+1)`.
  3. Two-stage single-entry caching; `requestAnimationFrame`-coalesced slider; nearest-neighbor at `blurCells = 0`.
  4. Store flags `squintPeek` and `painting` are transient, never persisted, never gated by read-only; `effectiveMode = squintPeek ? 'squint' : viewMode`.
  5. Space-key safety: `preventDefault()` on peek Space `keydown` and `keyup`; ignore the key when a natively Space-activated control (`BUTTON`, checkbox, radio, `SUMMARY`, `role="button"`, `role="menuitemradio"`) has focus; blur pointer-activated top-bar buttons (`click` with `detail > 0`); Settings close moves focus to `body`. **`Reset` clears progress immediately with no confirmation, so a regression here destroys user data. Write that test first and make sure it fails before implementing.**
  6. Squint is a non-mutating preview: inspector hover stays live; click, drag, and `Mark Done / Undo` change nothing; output footprint equals the grid (no outward bleed, no canvas resize).
- **Hard Exclusions / No-Go**:
  - Do NOT modify `.env`, `.env.*`, or credential files.
  - Do NOT introduce any new dependency (none are needed; `package.json` stays unchanged).
  - Do NOT use CSS `filter: blur()` or any canvas `ctx.filter` for the blur.
  - Do NOT start a public tunnel. Use `localhost` (reuse a dev server already on `5173` if present, otherwise `npx vite --port 5173`).
  - Do NOT modify files outside the Target Context Map without prior task coverage.
  - Do NOT touch `.playwright-mcp/` (untracked tool output; never commit it).
- **Baseline invariant**: PR #1 head reports 18 test files / 220 tests passing and a clean `npm run build` with the worker emitted as a separate chunk. Confirm this before editing (task 1.1) and keep every pre-existing test passing, except the legacy view-mode assertions that this change replaces on purpose.

## 4. Visual & UI Design Specifications & Vision Verification
- **Theme**: "Studio Draftboard — View Switcher & Squint Preview" (extends `DESIGN.md`; `design.md` is authoritative).
- **Key Tokens** (all already in `src/styles/tokens.css`; no new tokens):
  - Primary ink `--ink` `#171717` | Background `--bg` `#fafafa` | Surface `--surface` `#ffffff` / `--surface-popover` / `--surface-pill`
  - Text: Primary `#171717`, Muted `--ink-muted` `#525252`; hairline `--line` `#e5e5e5`; active fill `--surface-active` `#ececec`
- **Component Anatomy & States**:
  - `ViewModeMenu`: trigger `.btn.active.view-mode-trigger` (`12.5px`, weight `600`, label + `▾`); dropdown hidden by default (`opacity: 0; visibility: hidden; pointer-events: none; transform: translateY(-4px) scale(0.98)`), open via JS `.open` with `150ms cubic-bezier(0.2, 0, 0, 1)`, chevron `180deg`, options staggered `0/25/50ms`, `min-width: 136px`, `padding: 4px`, `var(--radius-lg)`, `6px` invisible hover bridge. Fixed order `Pixel Grid`, `Stripes`, `Squint` with a fixed-width `✓` slot. Focus: `outline: 2px solid var(--ink); outline-offset: 2px`.
  - `FocusBar`: bottom-center capsule (`bottom: 42px; left: 50%; transform: translateX(-50%); z-index: 35`), hidden unless explicit `viewMode === 'squint'` (never during a peek); range `min 0 max 1.5 step 0.05 value 0.75`, width `140px`, `accent-color: var(--ink)`, `aria-valuetext` like `0.75 cells`; endpoint labels `Sharp` / `Squint` at `11.5px`.
  - `Mark Done / Undo` disabled style while squinting; canvas `default` cursor, no ring, no axes/grid lines.
- **Responsive Layout**: `>= 768px` hover opens the menu; `< 768px` tap toggles; trigger and menu rows `min-height: 44px`; at `390×844` the top-right pill must stay on one row (no `Saved` wrap).
- **Reduced motion**: all dropdown, chevron, and option transitions and delays are `0ms` under `prefers-reduced-motion: reduce`.
- **Multi-Modal Vision Verification**:
  - `deepseek-flash` natively supports vision inputs. Capture screenshots with the Playwright CLI (for example `npx playwright screenshot <url> <output.png>`) at `1280×800` and `390×844`: the closed and open dropdown, `Squint` at `0.0`, `0.75`, and `1.5` on the Tree and Sunset samples, dithering on vs. off in Squint, and a dark-edge scene at `1.0` (clean footprint, no halo, no layout shift). Inspect the images directly.
  - Eye-ball judgments (how glowing the fusion looks) and the real-device touch feel stay marked for manual maintainer review while all automated code, test, and layout tasks are completed.

## 5. Test Scaffolding & Verification Commands
- **Primary Test Runner**: `npm test` (`vitest run`); build: `npm run build` (`tsc --noEmit && vite build`).
- **Targeted loop commands** (narrowest file only):
  - `npx vitest run src/engine/__tests__/opticalBlur.test.ts`
  - `npx vitest run src/store/__tests__/gridStore.test.ts`
  - `npx vitest run src/ui/__tests__/ui.test.ts`
- **Full verification** (documented host override for `safe-test`'s virtual-memory cap, which otherwise breaks Vitest 5 here):
  ```bash
  SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm test -- --maxWorkers=1
  SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm run build
  openspec validate out-of-focus-preview --strict
  ```
- **TDD Requirement**: Task group ## 1 MUST scaffold failing unit/UI tests before touching implementation code. Show them failing (module-resolution and assertion failures are acceptable) and record the red run in `verification.md`. The Space-key activation-safety tests must be among them.
- **Resource & Concurrency Rules**:
  - During task implementation, run ONLY the narrowest test file for the modified code. Do NOT run full discovery or browser captures on every checkbox.
  - Wrap full runs with `safe-test` and `--maxWorkers=1`.

## 6. Implementation Task Checklist
## 1. Test Scaffolding (TDD)

- [ ] 1.1 Branch from PR #1 head (`0374420`), run `npm test` and `npm run build` before any edit, and record the baseline (expected 18 files / 220 tests green) in `verification.md`
- [ ] 1.2 Write failing unit tests in `src/engine/__tests__/opticalBlur.test.ts` covering isotropic `3×3` raster dimensions, coverage-folded dark-border mean agreement with `buildComboLUT` within `1e-5` (all 125 combos), linear-mean sRGB encoding (`0.5` → `188`), impulse-response variance matching `(blurCells * 3)²` within `1%`, isotropy, strictly monotonic response across slider steps, `blurCells = 0` identity, paper-colored edge blending within the grid footprint, width-solver monotonicity and caching, and encode-table agreement with `linearToSrgb`
- [ ] 1.3 Add failing store tests in `src/store/__tests__/gridStore.test.ts` covering `viewMode: 'squint'`, `blurCells` clamping (`[0, 1.5]`, default `0.75`), transient `squintPeek` and `painting` independence from `viewMode`, `effectiveMode` resolution, read-only tabs, and zero dirty/autosave side effects
- [ ] 1.4 Update and add failing UI tests in `src/ui/__tests__/ui.test.ts` replacing the legacy two-button view-mode assertions (keep the Stripes-render and settings outside-click coverage) with tests for the single-button fixed-order 3-item `menuitemradio` dropdown (`aria-expanded`, `aria-checked`, fake-`matchMedia` hover vs. tap and `change` re-evaluation, roving arrow focus, `Escape` return-to-trigger, post-select `.blur()`), `[data-ui="focus-bar"]` visibility, `aria-valuetext`, rAF coalescing, Spacebar `squintPeek` lifecycle (`e.repeat`, modifiers, text inputs, `painting`, `window.blur`, `visibilitychange`, no-op in explicit Squint), **activation safety** (pointer-click `Reset` then Space → one reset; keyboard-focused `Reset` + Space → native activation, no peek; Space events default-prevented; Settings close focus), and Squint canvas behaviour (no axes/lines/ring, `default` cursor, ignored clicks, live inspector hover, disabled `Mark Done / Undo`, `grid === null`, nearest-neighbor at `0`, no recompute on completion changes)

## 2. Domain Contracts & Linear-Light Optical Blur Engine

- [ ] 2.1 Update `src/types/pipeline.ts` to extend `ViewMode` to `'grid' | 'stripes' | 'squint'` and export `VIEW_MODE_ORDER`, `VIEW_MODE_LABELS`, `MIN_BLUR_CELLS`, `MAX_BLUR_CELLS`, and `DEFAULT_BLUR_CELLS`
- [ ] 2.2 Implement `buildLinearStripeRaster(grid)` in `src/engine/opticalBlur.ts` (`3×3` isotropic `Float32Array`, `DARK_BORDER_RATIO` folded into coverage)
- [ ] 2.3 Implement the continuous-coverage box blur in `src/engine/opticalBlur.ts`: bisection width solver (variance `sigmaSubpx²/3` per pass, cached), interpolated prefix-sum window means, 3 horizontal + 3 vertical passes, linearized `#fafafa` padding, and `blurLinearRasterToSrgb(raster, blurCells, paperRgb)` with a 4096-entry encode table

## 3. Store State

- [ ] 3.1 Update `src/store/gridStore.ts` to add `blurCells`, `squintPeek`, `painting`, `setBlurCells(cells)`, `setSquintPeek(active)`, `setPainting(active)`, and an `effectiveMode` selector, none of which mark projects dirty, trigger persistence writes, or are blocked by read-only

## 4. Single-Button Animated Dropdown, Focus Slider & Squint Canvas

- [ ] 4.1 Update `index.html` replacing `#btnModeGrid` and `#btnModeStripes` with `.view-mode-menu` (`#btnViewMode` + 3 fixed-order `role="menuitemradio"` options) and adding the contextual `#focusBar` pill inside `#stage`
- [ ] 4.2 Update `src/styles/main.css` with `.view-mode-menu`, JS-driven `.open` animated dropdown (`150ms cubic-bezier(0.2, 0, 0, 1)`, `180deg` chevron rotation, staggered option reveals `0/25/50ms`, `0ms` under `prefers-reduced-motion: reduce`), `>= 44px` mobile touch targets, and `.focus-bar` bottom-center pill styling
- [ ] 4.3 Update `src/ui/topBar.ts` for JS-synchronized hover/tap/keyboard dropdown (`(hover: hover) and (pointer: fine)` with `change` listener), pointer-click blur (`event.detail > 0`), Settings-close focus to `body`, rAF-coalesced `#focusBar` slider with `aria-valuetext`, and the Spacebar peek (preventDefault on keydown/keyup, focused-activatable-control rule, `painting`/`blur`/`visibilitychange` guards)
- [ ] 4.4 Update `src/ui/gridCanvas.ts` for single-entry two-stage caching (raster per `grid`, blur canvas per `(grid, blurCells)`), render `effectiveMode` without axes/grid lines/hover ring, `imageSmoothingEnabled = blurCells > 0`, ignore completion clicks and drags in Squint, keep inspector hover live, null-grid no-op, and set the store `painting` flag during drag-paint
- [ ] 4.5 Update `src/ui/inspectorSidebar.ts` so `Mark Done / Undo` renders disabled and inert while `effectiveMode === 'squint'`

## 5. Verification & Empirical Audit

- [ ] 5.1 Run full regression test suite (`npm test`) and production build (`npm run build`), verifying all unit and UI tests pass with zero TypeScript or bundle errors
- [ ] 5.2 Populate `verification.md` with the Requirement Adherence Audit Matrix, resolved assumptions, manual visual verification (desktop `1280×800` animated dropdown + Squint preview + Spacebar peek after `Reset` click, and mobile `390×844` single-row pill), and verbatim execution logs

## 7. Post-Implementation & Verification Obligations
When `spec-coder-sub` finishes:
1. Verify all checkboxes in `tasks.md` are marked `- [x]`. Only tick boxes that genuinely ran and passed.
2. Confirm no pre-existing behaviour regressed: full suite count is at least the 220 baseline plus the new tests, minus only the replaced legacy view-mode assertions (state exactly how many were replaced).
3. Ensure `openspec/changes/out-of-focus-preview/verification.md` is populated with:
   - Executive Summary & Environment (base commit `0374420`, runner versions)
   - Requirement Adherence Audit Matrix mapping every scenario in `specs/squint-preview`, `specs/interactive-pixel-grid`, and `specs/design-language` to its verifying test (or a marked manual/browser check)
   - Resolved Assumptions & Empirical Proof, including: Space keyup activation and `preventDefault` cancellation checked in a real browser (Chromium and, if available, Firefox); the `Reset`-then-Space scenario run in the browser with completed cells intact; measured raster+blur+encode time at `56×42` and `96×72` (soft budget, report only); screenshots of the cases in Section 4
   - Nomenclature & Code Symbol Audit (`squint` vs. "Out of Focus" naming; `blurCells`, `squintPeek`, `painting`, `effectiveMode`)
   - Verbatim Execution Logs (red run, green run, build, `openspec validate --strict`)
4. Automatically run verification via `openspec-verify-change`.

## 8. Verification Review & Single-Pass Automated Repair (Max Retries = 1)
- **If verification succeeds with zero critical issues**:
  1. Sync delta specs via the `openspec-sync-specs` skill for `out-of-focus-preview`. Check the result: the `Whisper-quiet floating pill controls…` requirement must still contain its "Outside click closes settings popover" scenario, and `Pixel Grid and Stripes view mode toggle` must still contain "Switching to Stripes view renders RGB subpixels". Do not alter the persistence requirement PATCH-06 rewrote in `interactive-pixel-grid`.
  2. **Open a Pull Request**:
     - Work stays on `feat/out-of-focus-preview` (created in Section 1a).
     - Stage and commit all implementation code and every artifact in the change directory (`git add openspec/changes/out-of-focus-preview openspec/specs <implementation-files>`), push with `git push -u origin HEAD`.
     - Open the PR **stacked on PR #1**: `gh pr create --base feat/multi-20261126-2351 --head feat/out-of-focus-preview --title "feat: Squint preview and single-button view switcher" --body "<summary of proposal.md and verification.md; note this stacks on #1 and must be retargeted to master after #1 merges>"`. If PR #1 has already merged, use `--base master`. Report the PR URL.
- **If CRITICAL issues or failed test verification errors are detected on initial pass**:
  1. Announce: "Verification failed on initial pass. Attempting a single bounded repair pass via subagent..."
  2. Delegate a single-pass repair task to `spec-coder-sub` with the verification failure context:
     > "Fix the specific verification failures and test errors reported for change 'out-of-focus-preview'. Refer to the error log, make minimal targeted patches to resolve the failures, run verification commands, and update tasks.md."
  3. Re-run verification via `openspec-verify-change`.
  4. **If verification passes after repair**: sync delta specs (with the scenario-retention check above), stage, commit, push, and open the stacked PR as above.
  5. **If verification STILL fails after the single repair pass**: **HALT**. Do NOT loop or re-run. Present the Verification Report and remaining blockers to the user for manual guidance.
