# Patch Ledger: worker-pipeline-and-pdf-export

## Patch Ledger

| Patch ID | Date | Trigger / Feedback Source | Target Files | Status |
| :--- | :--- | :--- | :--- | :--- |
| `PATCH-01` | 2026-11-27 | Orchestrator browser verification (C1) | `src/ui/inspectorSidebar.ts`, `src/styles/main.css`, `src/ui/__tests__/touchAndExport.test.ts`, `src/engine/pipeline.ts`, `src/engine/__tests__/engine.test.ts` | APPLIED |
| `PATCH-02` | 2026-11-27 | Verification Audit follow-ups (W3, W1, S1, S6) | `src/ui/topBar.ts`, `src/ui/__tests__/touchAndExport.test.ts`, `src/ui/inspectorSidebar.ts`, `src/styles/main.css`, `src/engine/pdfExporter.ts`, `src/engine/__tests__/pdfExporter.test.ts` | APPLIED |

---

### [PATCH-01] Hide Mark Done / Undo for mouse users; make PIPELINE_VERSION an integer

- **Date**: 2026-11-27 01:09 UTC
- **Feedback Source**: Orchestrator browser verification (C1)
- **Reported Issue (verbatim)**:
  ```
  CRITICAL — Mark Done / Undo is visible for mouse users. In a real Chromium run at 1280×800, after hovering a cell with the mouse the inspector panel is visible and the button reports `hidden: true`, but computed `display: flex` and occupies `215×44` at `(1045, 452)`. The author rule `.btn { display: inline-flex }` overrides the UA `[hidden] { display: none }` rule. This violates `touch-interaction`: "Button is absent for mouse use" and "not rendered when no cell is inspected". jsdom tests only asserted the `hidden` property, so they missed it.
  ```
  Secondary finding (WARNING): `src/engine/pipeline.ts` exported `PIPELINE_VERSION = '1.0.0'`, while `project-persistence/architecture.md` §11 requires an integer `PIPELINE_VERSION`.
- **Root Cause**:
  1. The button is hidden with the `hidden` attribute, but the author rule `.btn { display: inline-flex }` has higher precedence than the user-agent `[hidden] { display: none }` rule. The element therefore stayed laid out and visible for mouse users even though `element.hidden === true`.
  2. The pipeline version was authored as a semantic-version string, mismatching the integer contract required by the dependent persistence change.
- **Target Files**: `src/ui/inspectorSidebar.ts`, `src/styles/main.css`, `src/ui/__tests__/touchAndExport.test.ts`, `src/engine/pipeline.ts`, `src/engine/__tests__/engine.test.ts`.
- **Expected Resolution**:
  - Mouse/no-inspection: the `Mark Done / Undo` button is genuinely unrendered (`hidden` and computed `display: none`) and takes no layout space.
  - Touch inspection: the button is rendered again and remains at least 44×44 px inside the inspector.
  - `PIPELINE_VERSION` is the exported integer `1`; the PDF legend reads `Pipeline v1`.
- **Resolution**:
  - `inspectorSidebar.ts`: added `setMarkDoneVisible(visible)` which sets both `markDone.hidden` and an inline `markDone.style.display` (`'none'` hidden, `''` shown); used it in every render branch and initialised the button to `display: none`.
  - `main.css`: added `[hidden] { display: none !important; }` so dynamic `hidden` controls cannot be kept rendered by author display rules.
  - `touchAndExport.test.ts`: mouse/no-inspection assertions now check both `button.hidden` and `button.style.display === 'none'`; the touch-tap assertions require a non-`none` display. No assertions were removed or weakened.
  - `pipeline.ts`: `export const PIPELINE_VERSION = 1;`.
  - `engine.test.ts`: asserts `Number.isInteger(PIPELINE_VERSION)` and `PIPELINE_VERSION === 1`.
- **Verification Command**:
  ```bash
  npx vitest run src/ui/__tests__/touchAndExport.test.ts
  npx vitest run src/engine/__tests__/engine.test.ts
  SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm test -- --maxWorkers=1
  SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm run build
  ```
- **Verification Proof**:
  - `touchAndExport.test.ts` → **1 file / 13 tests passed**, including the new `display` assertions.
  - `engine.test.ts` → **1 file / 24 tests passed**, including "exposes an integer pipeline version".
  - Full suite at the time of PATCH-01 → **11 files / 143 tests passed** (later 145 after PATCH-02).
  - Build → `tsc --noEmit` clean, **347 modules transformed**, worker emitted separately, `✓ built`.
  - The pre-fix browser run observed `hidden: true` with computed `display: flex` at `215×44`; after the fix the automated assertions confirm `hidden === true` and inline `display: none` for mouse/no-inspection. Final Chromium re-confirmation of the repaired computed style is the only open browser check (see `verification.md` §12.1).
- **Status**: APPLIED

---

### [PATCH-02] Surface pipeline errors; mobile Mark Done placement; disabled styling; exporter clamp

- **Date**: 2026-11-27 01:32 UTC
- **Feedback Source**: Verification Audit follow-ups (W3, W1, S1, S6)
- **Reported Issues**:
  - **W3 (spec gap)**: `gridStore` set `status: 'error'`/`error`, but no UI read that state, so the `worker-pipeline` requirement to “surface a non-modal error state” was not user-visible.
  - **W1 (mobile UX)**: the `Mark Done / Undo` button sat just above the meta footer inside the scrollable inspector, so at 390×844 it could require scrolling into view.
  - **S1 (design adherence)**: `.btn:disabled` had no rule; the disabled Export PDF button did not match `design.md`’s reduced-opacity / `not-allowed` treatment.
  - **S6 (robustness)**: `exportGuidePdf` trusted the UI-side 4–12 mm clamp; a direct caller could pass 20 mm or 1 mm.
- **Root Causes**:
  - W3: only `exportError` (a locally generated PDF failure in `topBar`) had an inline line; the store’s pipeline status had no view binding.
  - W1: the button was inserted relative to `.meta-footer` at the bottom of the inspector’s flex column.
  - S1: no author rule existed for the disabled pseudo-class.
  - S6: clamping lived only in `gridStore.setExportOptions`, not at the exporter boundary.
- **Target Files**: `src/ui/topBar.ts`, `src/ui/__tests__/touchAndExport.test.ts`, `src/ui/inspectorSidebar.ts`, `src/styles/main.css`, `src/engine/pdfExporter.ts`, `src/engine/__tests__/pdfExporter.test.ts`.
- **Expected Resolution**:
  - A failed pipeline run shows one quiet, dismissible `[data-ui="pipeline-error"]` line with `state.error`; it clears on the next pending/successful run and on dismissal; the last good grid and progress remain untouched.
  - On mobile the Mark Done button is visible immediately below the coordinate/status header without scrolling, still ≥44×44 and touch-only.
  - Disabled buttons render at 45% opacity with `not-allowed`.
  - Direct exporter calls clamp the template cell size to 4–12 mm.
- **Resolution**:
  - `topBar.ts`: factored the inline status line into a helper and added a second `[data-ui="pipeline-error"]` line (text via `textContent`, dismiss button) in a non-overlapping stack below the pill. It shows only for `state.status === 'error'`, tracks dismissal, and re-arms on a new error transition.
  - `touchAndExport.test.ts`: new "Pipeline error line" test drives a rejecting client through `store.setCols`, asserts the line appears with the message, hides after a successful run, re-appears on the next failure, dismisses on click, and that grid/progress are unchanged.
  - `inspectorSidebar.ts`: inserts Mark Done directly after the `.coord-row` header (above the stripe card) instead of before the meta footer.
  - `main.css`: added `.btn:disabled { opacity: 0.45; cursor: not-allowed; }` (in addition to PATCH-01’s `[hidden]` rule; these are the only two rules added).
  - `pdfExporter.ts`: `templateCellMm` is clamped to `[4, 12]` inside `exportGuidePdf`; `pdfExporter.test.ts` checks 20 mm → `12 mm cells` and 1 mm → `4 mm cells`.
- **Verification Command**:
  ```bash
  npx vitest run src/ui/__tests__/touchAndExport.test.ts
  npx vitest run src/engine/__tests__/pdfExporter.test.ts
  SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm test -- --maxWorkers=1
  SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm run build
  ```
- **Verification Proof**:
  - `touchAndExport.test.ts` → **1 file / 14 tests passed** (13 prior + the pipeline-error line test).
  - `pdfExporter.test.ts` → **1 file / 16 tests passed** (15 prior + the clamp test).
  - Full suite → **11 files / 145 tests passed** (29.71s).
  - Build → `tsc --noEmit` clean, **347 modules transformed**, `✓ built in 266ms`; worker emitted separately (`pipeline.worker-C01QtuUB.js`, 46.50 kB).
- **Status**: APPLIED
