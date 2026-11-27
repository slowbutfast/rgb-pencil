# Patch Ledger: design-language-and-ui-ux

## Patch Ledger
| Patch ID | Date | Trigger / Feedback Source | Target Files | Status |
| :--- | :--- | :--- | :--- | :--- |
| `PATCH-01` | 2026-11-27 | Verification Audit | `src/ui/gridCanvas.ts`, `src/ui/__tests__/ui.test.ts` | APPLIED |

---

### [PATCH-01] Retain the inspected cell after a touch tap

- **Date**: 2026-11-27 00:31:00 UTC
- **Feedback Source**: Verification Audit
- **Reported Issue**:
  ```
  Touch tap updates the inspector and then immediately hides it — the "tapped on touchscreens" requirement is not met.
  Where: `src/ui/gridCanvas.ts:316-329` (`onPointerDown` calls `store.setHovered(hit)`; `onPointerLeave` calls `store.setHovered(null)`), `src/ui/inspectorSidebar.ts:47-61` (null hover hides `[data-ui="inspector-active"]`).
  Evidence: on 390×844 with `hasTouch`, a tap produces `pointerdown → pointerup → pointerout → pointerleave`. Afterwards progress is `1 / 2352 done` and `[data-ui="coord"]` text is `X11, Y11`, but `[data-ui="inspector-active"]` `isVisible = false` and the empty state is shown. The user never sees the readout.
  Requirement: `pixel-inspector-sidebar` — the sidebar must display the readout when a cell is "hovered (or tapped on touchscreens)".
  ```
- **Root Cause**: A touch tap ends with the finger lifting, which the browser reports as `pointerup` followed by `pointerout`/`pointerleave`. The canvas treated every `pointerleave` as a mouse exit and cleared `hoveredCell`, so the sidebar immediately reverted to its empty state. The canvas did not distinguish pointer types.
- **Target Files**: `src/ui/gridCanvas.ts`, `src/ui/__tests__/ui.test.ts`
- **Expected Resolution**: After a `pointerType === 'touch'` tap sequence, the hover ring and sidebar readout remain visible for the tapped `(col,row)`. Mouse and pen behaviour is unchanged: `pointerleave` still clears the hover and resets the cursor. A later mouse interaction resumes normal clearing. Tap still toggles completion in this change (Change 2 intentionally replaces that with inspect-only + `Mark Done`).
- **Resolution**:
  - Added a local `lastPointerType` tracked from `pointermove` / `pointerdown` / `pointerup` / `pointerleave` (no store state added; Change 2 owns `lastPointerType` in the store).
  - `onPointerLeave` now returns early when the last interaction was a touch, preserving `hoveredCell` (and therefore the ring + inspector readout). Mouse/pen leaves keep the previous clear-and-reset path.
  - Geometry fitting no longer requires a 2D context, so jsdom regression tests exercise real hit-testing deterministically.
  - Added two jsdom regression tests dispatching the real touch sequence (`pointerdown → pointerup → pointerleave`) and a mouse-only leave.
- **Verification Command**:
  ```
  npx vitest run src/ui/__tests__/ui.test.ts
  SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm test -- --maxWorkers=1
  SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm run build
  ```
- **Verification Proof**:
  - `npx vitest run src/ui/__tests__/ui.test.ts` → **Test Files 1 passed, Tests 16 passed** (14 prior + 2 new: "keeps the sidebar readout visible after a touch tap, then clears on mouse leave" and "still clears the hover on a mouse-only pointerleave").
  - Full suite → **Test Files 6 passed, Tests 60 passed**.
  - Production build → `tsc --noEmit` clean, **19 modules transformed**, `✓ built`.
- **Status**: APPLIED
