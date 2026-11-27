# Patch Ledger: project-persistence

## Patch Ledger

| Patch ID | Date | Trigger / Feedback Source | Target Files | Status |
| :--- | :--- | :--- | :--- | :--- |
| `PATCH-01` | 2026-11-27 | Orchestrator browser verification | `src/store/gridStore.ts`, `src/ui/settingsPopover.ts`, `src/store/__tests__/projectLifecycle.test.ts`, `src/ui/__tests__/persistenceUi.test.ts` | APPLIED |
| `PATCH-02` | 2026-11-27 | Orchestrator browser re-test after PATCH-01 | `src/ui/settingsPopover.ts`, `src/ui/topBar.ts`, `src/ui/__tests__/persistenceUi.test.ts`, `src/ui/__tests__/touchAndExport.test.ts` | APPLIED |
| `PATCH-03` | 2026-11-27 | Orchestrator Chromium layout measurement | `src/ui/topBar.ts`, `src/ui/gridCanvas.ts`, `src/styles/main.css`, `src/ui/__tests__/persistenceUi.test.ts` | APPLIED |
| `PATCH-04` | 2026-11-27 | Independent verification (C1, W1, W3, W4, S2, S3, S7, W2, W5/S1) | `src/store/projectLock.ts`, `src/store/gridStore.ts`, `src/ui/topBar.ts`, `src/ui/settingsPopover.ts`, `src/main.ts`, `src/styles/main.css`, `src/store/__tests__/projectLock.test.ts`, `src/store/__tests__/projectLifecycle.test.ts`, `src/store/__tests__/projectFile.test.ts`, `src/ui/__tests__/persistenceUi.test.ts` | APPLIED |
| `PATCH-05` | 2026-11-27 | Follow-up hardening | `src/store/projectLock.ts`, `src/store/gridStore.ts`, `src/store/projectManager.ts`, `src/store/__tests__/projectLock.test.ts`, `src/store/__tests__/projectLifecycle.test.ts`, `src/ui/__tests__/persistenceUi.test.ts` | APPLIED |
| `PATCH-06` | 2026-11-27 | PR #1 code review | `openspec/specs/interactive-pixel-grid/spec.md`, `openspec/changes/project-persistence/specs/interactive-pixel-grid/spec.md`, `src/store/projectFile.ts`, `src/store/projectLock.ts`, `src/store/autosave.ts`, `src/store/gridStore.ts`, `src/store/__tests__/projectFile.test.ts`, `src/store/__tests__/projectLock.test.ts`, `src/store/__tests__/autosave.test.ts`, `src/store/__tests__/projectLifecycle.test.ts`, `src/store/__tests__/support.ts` | APPLIED |

No defect was found in Change 1 or Change 2 implementation; their suites remain
unchanged by this patch. The only removed behaviour is the superseded
`rgb-pencil:v1:*` write path, as designed.

---

### [PATCH-01] Keep fast edits during first project creation; keep Settings open across row actions

- **Date**: 2026-11-27 02:28 UTC
- **Feedback Source**: Orchestrator browser verification (Chromium, 1280×800)
- **Reported Issues (verbatim summary)**:
  1. **CRITICAL — first-project fast edits lost.** Load the sample (no project
     yet), then click 4 distinct cells rapidly (~0 ms apart). Progress advances
     `1 → 2 → 3 → 4`, but ~800 ms later it resets to `1 / 2352 done` and
     IndexedDB `doneCount` is 1. With 250 ms between clicks the count stays 4.
  2. **CRITICAL — project row actions close Settings.** Open Settings → click
     Rename (or Delete, or Export project). The action re-renders the project
     list, detaching the clicked button; the document click handler's
     `popover.contains(target)` then returns false and closes the popover, so
     the rename input / delete confirmation is invisible and the user must
     reopen Settings.
- **Root Causes**:
  1. `ensureProject()` snapshotted `state.completedCells` **before** awaiting
     `imageRecordFor(id)` / `db.putWithImage(...)`, then committed that stale
     `completed` set. Any cells toggled during image encoding or the DB write
     were removed from the UI and omitted from the first record. The stale
     commit also defeated the follow-up autosave, which persisted the truncated
     set.
  2. `onDocumentClick` checked `event.target` with `popover.contains()`. Row
     actions call the local `render()` synchronously, so the clicked node is
     detached by the time the bubbling document handler runs and `contains`
     returns false even though the interaction originated inside the popover.
- **Target Files**: `src/store/gridStore.ts`, `src/ui/settingsPopover.ts`,
  `src/store/__tests__/projectLifecycle.test.ts`,
  `src/ui/__tests__/persistenceUi.test.ts`.
- **Resolution**:
  1. `ensureProject()` now performs the async image encode **first**, then reads
     `state.completedCells`, unions the adopted legacy cells, and builds the
     record. After the write/lock awaits it commits a fresh union of the current
     `state.completedCells` + adopted cells instead of the stale snapshot. Any
     edit landing after the record write is picked up by the scheduled autosave
     that follows project creation.
  2. `onDocumentClick` uses `event.composedPath()` and treats the click as
     inside when the path contains `popover` or `trigger`; the original
     `contains` check remains as a fallback for browsers without
     `composedPath`.
- **Regression Tests Added**:
  - `projectLifecycle.test.ts` › "keeps fast edits made while the first project is being created":
    injects a `PngCodec` whose `encode` blocks on a deferred promise, triggers
    project creation with the first toggle, applies three more toggles while the
    encoder is blocked, releases it, then asserts four cells in the UI and
    `doneCount === 4` plus a four-cell bitset in IndexedDB.
  - `persistenceUi.test.ts` › "keeps the Settings popover open across project row
    actions": opens the popover, clicks Rename, asserts `open` is still present
    and the rename input is populated/usable (renames through Save), then clicks
    Delete and asserts the confirmation row is reachable and stays open through
    Cancel.
- **Verification Commands**:
  ```bash
  npx vitest run src/store/__tests__/projectLifecycle.test.ts src/ui/__tests__/persistenceUi.test.ts
  SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm test -- --maxWorkers=1
  SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm run build
  ```
- **Verification Proof**:
  - Targeted: **2 files / 18 tests passed** (12 lifecycle + 6 UI).
  - Full suite: **18 files / 202 tests passed** (35.36 s) — the previous 200
    plus the two new regression tests.
  - Build: `tsc --noEmit` clean, **355 modules transformed**,
    `dist/assets/index-gpQlCpjz.js` 537.78 kB, `✓ built in 296ms`; worker still
    emitted separately (`pipeline.worker-C01QtuUB.js`, 46.50 kB).
- **Status**: APPLIED

---

### [PATCH-02] Keep Settings open when exporting a project (same family as PATCH-01 DEFECT 2)

- **Date**: 2026-11-27 02:33 UTC
- **Feedback Source**: Orchestrator browser re-test after PATCH-01 (Chromium, 1280×800)
- **Reported Issue**: Rename and Delete now keep Settings open and usable, but
  **Export project still closes the popover**. The temporary `<a>` created by
  `downloadText()` is appended to `document.body`; its synthetic `click()`
  bubbles to the document outside-click handler, whose composed path contains
  only the detached anchor, so the popover closes.
- **Root Cause**: The download anchor is outside the popover DOM, and its
  bubbling click was never stopped. PATCH-01's `composedPath()` fix cannot help
  because the click genuinely originates outside the popover.
- **Target Files**: `src/ui/settingsPopover.ts`, `src/ui/topBar.ts`,
  `src/ui/__tests__/persistenceUi.test.ts`,
  `src/ui/__tests__/touchAndExport.test.ts`.
- **Expected Resolution**: The synthetic download click must not reach document
  handlers, while the download still fires and the popover remains open.
- **Resolution**:
  - `downloadText()` attaches a `click` listener to the anchor that calls
    `event.stopPropagation()` before `anchor.click()`; the listener is discarded
    with the anchor (removed immediately after the click).
  - `downloadPdf()` in `topBar.ts` gets the same guard for consistency, since it
    uses the identical append/click/remove pattern.
- **Regression Tests Added**:
  - `persistenceUi.test.ts` › "keeps the Settings popover open while exporting a
    project": opens Settings, spies `store.exportProject`, mocks the anchor click
    to dispatch a real bubbling event, clicks `Export project`, and asserts the
    popover still has `open`.
  - `touchAndExport.test.ts` › "stops the synthetic download click from reaching
    document handlers": dispatches a bubbling synthetic click from the download
    anchor and asserts a document-level listener is never invoked.
- **Browser Evidence**: Orchestrator re-test confirmed the PATCH-01 fixes for
  Rename/Delete and reported Export project as the remaining close trigger;
  after PATCH-02 the same interaction is covered by the two jsdom tests above.
- **Verification Commands**:
  ```bash
  npx vitest run src/ui/__tests__/persistenceUi.test.ts src/ui/__tests__/touchAndExport.test.ts
  SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm test -- --maxWorkers=1
  SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm run build
  ```
- **Verification Proof**:
  - Targeted: **2 files / 22 tests passed** (7 persistence UI + 15 touch/export).
  - Full suite: **18 files / 204 tests passed** (35.64 s) — the previous 202
    plus the two new propagation tests.
  - Build: `tsc --noEmit` clean, **355 modules transformed**,
    `dist/assets/index-CQty-oss.js` 537.88 kB, `✓ built in 294ms`; worker still
    emitted separately (`pipeline.worker-C01QtuUB.js`, 46.50 kB).
- **Status**: APPLIED

---

### [PATCH-03] Put banners in the stage flow so they never overlay the grid

- **Date**: 2026-11-27 02:36 UTC
- **Feedback Source**: Orchestrator Chromium measurement at 1280×800
- **Reported Issue (verbatim measurements)**: With memory-only + backup banners
  (two lines), `banner-list` bottom was `119.81`, grid canvas top `84`, and grid
  cells started at `112`; the second banner covered grid cells. `design.md` and
  the handoff require banners to be single dismissible lines below the pills
  that **never overlay the grid**.
- **Root Cause**: `banner-stack` was appended inside `.top-bar`, which is
  absolutely positioned with no layout relationship to `.grid-frame`. The stack
  floated over the stage, so it could only be moved visually, never reserve
  space.
- **Target Files**: `src/ui/topBar.ts`, `src/ui/gridCanvas.ts`,
  `src/styles/main.css`, `src/ui/__tests__/persistenceUi.test.ts`.
- **Expected Resolution**:
  - `[data-ui="banner-stack"]` is a child of `.stage`, immediately before
    `.grid-frame`, in normal flow.
  - With no banners the stack has zero height and the grid sits exactly where it
    did before.
  - With 1–3 banners the stack sits below the pills and above the canvas; the
    canvas shifts/shrinks, and no banner overlaps it.
  - Save status stays in the top-right pill; pills/popover keep their z-order;
    banners stay right-aligned within the stage and remain interactive.
  - Mobile keeps the inspector below the stage.
- **Resolution**:
  - `topBar.ts`: inserts `bannerStack` into `.stage` before `.grid-frame`
    (falls back to the top bar only if the shell lacks those hooks) and
    dispatches a `resize` when the measured stack height changes so the canvas
    re-fits.
  - `main.css`: `.stage` is now `flex-direction: column`; `.banner-stack` is
    `position: static; width: 100%` with right-aligned children (absolute
    top/left/right removed). Pills are untouched.
  - `gridCanvas.ts`: `fit()` measures `[data-ui="banner-stack"]` and subtracts
    its height plus a 12 px gap from `maxHeight`, so the grid shrinks instead of
    colliding. With no banners the reserve is 0 and the cell layout is unchanged.
  - `persistenceUi.test.ts`: now asserts the stack's parent is `[data-ui="stage"]`,
    its `closest('[data-ui="top-bar"]')` is null, it is immediately before
    `.grid-frame`, the banner renders, and the no-banner case has zero banner
    children.
- **Verification Commands**:
  ```bash
  npx vitest run src/ui/__tests__/persistenceUi.test.ts src/ui/__tests__/touchAndExport.test.ts src/ui/__tests__/ui.test.ts
  SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm test -- --maxWorkers=1
  SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm run build
  ```
- **Verification Proof**:
  - Targeted UI suites: **3 files / 38 tests passed**.
  - Full suite: **18 files / 204 tests passed** (34.93 s).
  - Build: `tsc --noEmit` clean, **355 modules transformed**,
    `dist/assets/index-CzDlN5jy.js` 538.34 kB, `✓ built in 293ms`; worker still
    emitted separately (`pipeline.worker-C01QtuUB.js`, 46.50 kB).
  - Geometry itself is orchestrator-verified in Chromium (jsdom has no layout).
- **Status**: APPLIED

---

### [PATCH-04] Hold a stolen lock, surface save failures, and close remaining verification gaps

- **Date**: 2026-11-27 03:11 UTC
- **Feedback Source**: Independent verification of `project-persistence`
- **Reported Issues**:
  - **C1 (CRITICAL)**: `Take over` released the stolen Web Lock immediately. A
    read-only handle resolved `held` at acquisition (`if (!granted) markHeld()`),
    so the `{steal:true}` callback awaited an already-resolved promise and
    returned at once; a third tab could then open read-write concurrently.
  - **W1**: quota/write warning was clipped at 220 px and omitted the required
    "Delete a project or export a backup." suggestion from the visible UI.
  - **W3**: a pending/in-flight autosave could recreate a project after delete
    or after another tab deleted it.
  - **W4**: memory-only import did not set/surface the pipeline-version notice.
  - **S2**: the same-image offer was hidden beneath an open Settings popover.
  - **S3**: dismissing the read-only banner removed the only `Take over` control.
  - **S7**: `pagehide` did not dispose the store.
  - **W2**: real browser PNG evidence remained pending.
  - **W5/S1**: scope exceptions for `dropZone.ts` and prior test edits were not
    recorded, and the CSS exception wording over-claimed token-only values.
- **Root Causes**:
  - C1: one hold promise was reused for the initial `ifAvailable` request and
    later `steal` requests; a denied acquisition resolved it.
  - W1: only the narrow top-bar caption rendered `saveError`; no banner carried
    the full text.
  - W3: deletion did not suppress queued writes or wait for an in-flight write.
  - W4: the memory-only import branch never assigned `pipelineMismatch`.
  - S2: Settings did not react to `sameImageOffer`.
  - S3: the banner renderer attached a dismiss button to every banner.
  - S7: the `pagehide` listener only flushed and disposed the worker.
- **Resolution**:
  - `projectLock.ts`: each actual ownership grant creates a **fresh** hold.
    A denied `ifAvailable` request resolves no hold. `takeOver()` creates a new
    hold, waits for the steal callback to be entered (or a 250 ms denial/timeout,
    which resolves the unused hold and returns `false` with `readOnly` still
    true), then sets `readOnly=false` and posts `lock-taken` while the callback
    stays pending on the new hold. Losing the lock or `release()` resolves the
    current hold.
  - `gridStore.ts`: added banner id `save-error` that renders the full
    `state.saveError` (including the backup suggestion) and re-arms on a new
    failure; added `suppressedProjectIds` so `persistCurrent` ignores deleted
    ids; local delete suppresses, flushes the pending write, then removes;
    external deletion suppresses, waits out in-flight writes, removes again,
    then falls back normally; memory-only import sets `pipelineMismatch`.
  - `topBar.ts`: read-only banners omit the dismiss control, keeping `Take over`.
  - `settingsPopover.ts`: closes the popover whenever `sameImageOffer` is set.
  - `main.ts`: `pagehide` now awaits `flushNow()`, then `store.dispose()` and
    `client.dispose()`.
  - `gridCanvas.ts`: unchanged in PATCH-04 beyond PATCH-03's banner reserve.
- **Regression Tests Added/Updated**:
  - `projectLock.test.ts`: take-over now asserts `locks.held(...) === true` and
    that a third opener is read-only and cannot write.
  - `persistenceUi.test.ts`: full quota banner text/dismiss; Settings closes on
    same-image offer; read-only banner has `Take over` but no dismiss.
  - `projectLifecycle.test.ts`: an in-flight autosave is awaited/cleaned so a
    deleted project stays deleted.
  - `projectFile.test.ts`: older `pipelineVersion` imported in memory-only mode
    shows the notice and keeps cells.
- **W2**: no dependency added; the orchestrator will run a direct Chromium
  `createBrowserPngCodec` encode/decode byte + `sourceHash` check. The matrix row
  is now "PASS (storage seam) / browser evidence pending orchestrator".
- **W5/S1**: `verification.md` §7 now records the `dropZone.ts` file-name
  exception and the two superseded-contract test updates, and rewords the CSS
  exception as "existing tokens where available; a few literal control sizes".
- **Verification Commands**:
  ```bash
  npx vitest run src/store/__tests__/projectLock.test.ts \
    src/store/__tests__/projectLifecycle.test.ts \
    src/store/__tests__/projectFile.test.ts \
    src/ui/__tests__/persistenceUi.test.ts
  SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm test -- --maxWorkers=1
  SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm run build
  ```
- **Verification Proof**:
  - Targeted: **4 files / 36 tests passed**.
  - Full suite: **18 files / 208 tests passed** (35.23 s).
  - Build: `tsc --noEmit` clean, **355 modules transformed**,
    `dist/assets/index-CH8R4fYx.js` 539.17 kB, `✓ built in 286ms`; worker still
    emitted separately (`pipeline.worker-C01QtuUB.js`, 46.50 kB).
- **Known limitations (unchanged)**: project-list counts can be stale while
  Settings stays open; a failed recompute during project open can leave mixed
  in-memory settings.
- **Status**: APPLIED

---

### [PATCH-05] Remove the delayed-steal cutoff, dedupe quota advice, harden doneCount

- **Date**: 2026-11-27 03:26 UTC
- **Feedback Source**: Follow-up hardening review
- **Reported Issues**:
  1. `takeOver()` abandoned the `{steal:true}` request after 250 ms. If the
     callback was entered later it resolved an already-abandoned hold and
     returned immediately, releasing the stolen lock without notifying the
     previous owner.
  2. The quota `save-error` banner/status repeated "Delete a project or export a
     backup." because `projectDb` already includes it and the store appended it.
  3. `createProjectRecord` used `input.completed.size` for `doneCount`, which
     could disagree with the encoded in-range bitset for defensive callers.
- **Target Files**: `src/store/projectLock.ts`, `src/store/gridStore.ts`,
  `src/store/projectManager.ts`, `src/store/__tests__/projectLock.test.ts`,
  `src/store/__tests__/projectLifecycle.test.ts`,
  `src/ui/__tests__/persistenceUi.test.ts`.
- **Resolution**:
  - `projectLock.ts`: removed the steal timeout entirely. `takeOver()` now waits
    for the steal callback to be entered with no cutoff, then sets
    `readOnly=false` and posts `lock-taken`; the callback stays pending on the
    fresh hold until release/loss. Rejections resolve the unused hold and leave
    `readOnly` true. The 250 ms previous-owner `lock-released` wait remains and
    is explicitly best-effort.
  - `gridStore.ts`: `withBackupSuggestion()` appends the recovery advice only
    when the message does not already contain it.
  - `projectManager.ts`: `doneCount` is now `countCompletedBits(completedBits,
    cols, rows)`.
- **Regression Tests**:
  - `projectLock.test.ts`: fake lock manager grants a steal after 300 ms; after
    `takeOver()` resolves, `locks.held(lockName)` is true and a third opener is
    read-only and cannot write.
  - `persistenceUi.test.ts`: quota banner contains the suggestion exactly once.
  - `projectLifecycle.test.ts`: malformed/out-of-range completed cells produce a
    matching `doneCount` and bitset.
- **Verification Commands**:
  ```bash
  npx vitest run src/store/__tests__/projectLock.test.ts \
    src/store/__tests__/projectLifecycle.test.ts \
    src/ui/__tests__/persistenceUi.test.ts
  SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm test -- --maxWorkers=1
  SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm run build
  ```
- **Verification Proof**:
  - Targeted: **3 files / 29 tests passed**.
  - Full suite: **18 files / 210 tests passed** (35.81 s).
  - Build: `tsc --noEmit` clean, **355 modules transformed**,
    `dist/assets/index-BaDyDauy.js` 539.20 kB, `✓ built in 284ms`; worker still
    emitted separately (`pipeline.worker-C01QtuUB.js`, 46.50 kB).
- **Status**: APPLIED

### [PATCH-06] PR #1 review hardening: spec drift, PNG decode guard, lock-loss detection, autosave and status nits
- **Date**: 2026-11-27 15:19:54 UTC
- **Feedback Source**: Code Review (`openspec-pr-review` of https://github.com/slowbutfast/rgb-pencil/pull/1)
- **Feedback Summary**:
  Overview: PR #1 was reviewed against the change artifacts and `verification.md` (tests assumed passing). No Critical findings. Three Important defects and three nits, all inside `project-persistence`; one structural nit (`gridStore.ts` size) is explicitly out of scope.
  Itemized:
  1. **[Important · Spec / Invariant Mismatch]** `openspec/specs/interactive-pixel-grid/spec.md` still says completed cells persist in `localStorage` keyed by a fingerprint; the implementation uses IndexedDB projects (localStorage is read once for legacy adoption). The change declared the supersession in prose only and never carried a MODIFIED requirement.
  2. **[Important · Edge Case / Robustness]** Import decodes the PNG before checking its real dimensions, so a small, highly compressible PNG declaring e.g. `30000×30000` passes the 8 MB cap and can exhaust memory in `createImageBitmap` / canvas.
  3. **[Important · Logic Bug]** The previous lock owner learns it lost the lock only from the `lock-taken` BroadcastChannel message. The `AbortError` that the browser raises on the original `locks.request` when a steal is granted is swallowed, so with no channel (or a lost message) two tabs stay writable.
  4. **[Minor · Edge Case]** `flush()` forces `dirty = true`, so every tab-hide or `pagehide` rewrites the record and bumps `updatedAt` even with nothing changed (reorders the "newest first" list; can cause false "Reload project" banners in the no-Web-Locks fallback).
  5. **[Minor · Logic Bug]** A read-only tab's save returns `{ ok: true }`, so the status reads `Saved` although nothing was written.
  6. **[Minor · Edge Case]** `sourceHash` in an imported file is accepted as any string; it is stored and indexed.
  Category/severity: items 1–3 Important, 4–6 Minor.
  Blast radius: `projectLock.ts`, `projectFile.ts`, `autosave.ts`, one branch of `gridStore.ts#persistCurrent`, one main-spec requirement.
- **Reported Issue / Raw Trace**:
  - `openspec/specs/interactive-pixel-grid/spec.md:61-62`: "Completed cell coordinates SHALL persist in `localStorage` keyed by a deterministic fingerprint of the active image and grid width…"
  - `src/store/imageCodec.ts:133-141` and `src/store/projectFile.ts:270-284`: `codec.decode(png)` runs before the decoded/declared dimensions are compared to the 1024 px cap.
  - `src/store/projectLock.ts:160-179`, `:184-194`: `void Promise.resolve(request).catch(() => { decided.resolve(false); })` ignores a post-grant `AbortError`; `onLost` is only called from the `lock-taken` channel handler.
  - `src/store/autosave.ts:114-122`: `if (force || !dirty) dirty = true; dirty = true;`
  - `src/store/gridStore.ts:569-577`: `if (state.readOnly || …) { return { ok: true }; }`
  - `src/store/projectFile.ts:229-231`: `typeof parsed.sourceHash !== 'string'` is the only check.
- **Root Cause**:
  1. Persistence was changed by a later change without a delta spec (planning gap), and the sync copied the older text.
  2. Validation order: claimed dimensions are checked, but the claim is not tied to the PNG header before the expensive decode.
  3. Ownership loss is modelled as a channel event only; the Web Locks abort signal is ignored.
  4. `flush(force)` ignores its `force` argument and always dirties the state, so lifecycle hooks cannot be a no-op.
  5. The skipped-save path reuses the success outcome.
  6. No format constraint on a stored/indexed field.
- **Target Files**: `openspec/specs/interactive-pixel-grid/spec.md`, `openspec/changes/project-persistence/specs/interactive-pixel-grid/spec.md` (new MODIFIED delta), `src/store/projectFile.ts`, `src/store/projectLock.ts`, `src/store/autosave.ts`, `src/store/gridStore.ts`, `src/store/__tests__/projectFile.test.ts`, `src/store/__tests__/projectLock.test.ts`, `src/store/__tests__/autosave.test.ts`, `src/store/__tests__/projectLifecycle.test.ts`
- **Resolution Strategy**:
  - Spec: add a MODIFIED delta for "Local persistence of completed cell progress" and apply the identical text to the main spec; keep the reload scenario and add a legacy-adoption scenario.
  - PNG guard: before `codec.decode`, read the IHDR width/height (bytes 16–23 of the PNG, big-endian) after checking the 8-byte PNG signature; require them to equal the declared `bitmap.width/height` and be `<= MAX_BITMAP_EDGE`; reject otherwise with the existing message wording.
  - Lock loss: attach rejection handling to the granted `locks.request` so an `AbortError` after grant sets `readOnly = true`, clears `activeHold`, and calls `onLost` at most once (shared guard with the channel path). Preserve PATCH-05 steal semantics.
  - Autosave: honour `force`; a non-forced `flush()` with nothing dirty and nothing running resolves without writing.
  - Status: add `skipped?: boolean` to `SaveOutcome`; `persistCurrent` returns `{ ok: true, skipped: true }` only for the `state.readOnly` case; `write()` leaves the status unchanged for skipped outcomes.
  - `sourceHash`: accept only `/^[0-9a-f]{1,8}$/`.
- **Regression Tests** (new):
  - `projectFile.test.ts`: oversized-IHDR PNG rejected and `codec.decode` not called; IHDR mismatching declared size rejected; non-PNG signature rejected; `sourceHash` of `"zz"`/`""`/9 chars rejected, 8 hex accepted.
  - `projectLock.test.ts`: with `channel: null`, a steal by another opener flips the previous handle to read-only and invokes `onLost` exactly once; with a channel, abort plus `lock-taken` still invokes `onLost` exactly once.
  - `autosave.test.ts`: `visibilitychange`/`pagehide` with nothing dirty performs zero saves; with a pending change performs one; `flush(true)` still writes when clean.
  - `projectLifecycle.test.ts`: read-only store flush does not change `saveStatus` to `saved` and writes nothing.
- **Verification Commands**:
  ```bash
  npm test -- src/store/__tests__/projectFile.test.ts -t "IHDR|sourceHash"
  npm test -- src/store/__tests__/projectLock.test.ts -t "revoked|onLost"
  npm test -- src/store/__tests__/autosave.test.ts -t "nothing is dirty|force"
  npm test -- src/store/__tests__/projectLifecycle.test.ts -t "read-only"
  SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm test -- --maxWorkers=1
  SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm run build
  openspec validate project-persistence --strict
  ```
- **Resolution**:
  - **Spec drift**: added `specs/interactive-pixel-grid/spec.md` to the change as a
    `## MODIFIED Requirements` delta for "Local persistence of completed cell
    progress" and replaced the same block in `openspec/specs/interactive-pixel-grid/spec.md`
    (the file now ends with the updated requirement; the reload scenario is kept
    and the legacy `rgb-pencil:v1:<hash>` adoption scenario is added). Legacy
    `localStorage` is now documented as read-once and never written.
  - **PNG decode guard**: `projectFile.ts` gained a local `readPngIhdr()` helper
    that verifies the 8-byte PNG signature, requires `IHDR` to be the first
    chunk, and reads width/height from bytes 16–23 big-endian. `parseProjectFile`
    now rejects, **before `codec.decode`**, a non-PNG header, an IHDR longest
    edge above `MAX_BITMAP_EDGE`, or IHDR dimensions that disagree with the
    declared `bitmap.width/height`. `imageCodec.ts` was not touched.
  - **`sourceHash`**: after the existing type check, values must match
    `/^[0-9a-f]{1,8}$/`; otherwise the import fails with "Project source hash is
    invalid." (the missing/non-string message is unchanged).
  - **Lock loss**: `projectLock.ts` now attaches rejection handling to the
    granted `locks.request`; a post-grant `AbortError` (a steal was granted to
    another tab) sets `readOnly = true`, clears `activeHold`, and calls `onLost`
    at most once through a shared `lostNotified` guard also used by the
    `lock-taken` channel handler. The `ifAvailable` denial path, the PATCH-05
    no-cutoff steal wait, the held stolen lock, and the flush-then-read-only
    order in `gridStore.acquireForProject` are unchanged. `release()` never
    triggers `onLost`.
  - **Autosave**: `SaveOutcome` gained `skipped?: boolean`. `flush(force = false)`
    now returns without writing when `!force && !dirty && !running`; while a
    write is in flight it returns the chain and only queues a follow-up when
    forced or newly dirty. `schedule()`/`flush(true)` still write. `write()`
    leaves the status unchanged for `{ ok: true, skipped: true }`.
  - **Read-only status**: `gridStore.persistCurrent` returns
    `{ ok: true, skipped: true }` only for `state.readOnly`; a no-project /
    suppressed / missing-image skip keeps `{ ok: true }`.
- **Existing-test and helper changes (recorded per the handoff)**:
  - `autosave.test.ts` › "serialises overlapping writes and lets the latest
    state win": the **first** call changed from `scheduler.flush()` to
    `scheduler.flush(true)`. The old assertion depended on the removed
    always-write-on-clean behaviour; no serialisation assertion changed.
  - `support.ts` (test helper, outside the target map — explicit deviation):
    the lossless test codec's fake payload now starts with the real 8-byte PNG
    signature and a 33-byte IHDR chunk (big-endian dimensions) before the raw
    RGBA. This is required for the new header guard to validate the existing
    export/import fixtures; **no test assertion changed** and every suite that
    uses the codec still round-trips bit-exactly. The `[png-size]` log for
    512×384 therefore changes from 786,440 to 786,465 fake bytes.
  - No other existing test was modified.
- **Regression Tests Added**:
  - `projectFile.test.ts`: "rejects a PNG whose IHDR declares dimensions beyond
    the cap without decoding" (30000×30000 header, decode spy never called);
    "rejects an IHDR that disagrees with the declared bitmap size"; "rejects a
    non-PNG signature at the IHDR guard"; "sourceHash must be 1-8 hex
    characters" (`""`, `"zz"`, 9 chars rejected; `deadbeef` accepted).
  - `projectLock.test.ts`: "goes read-only and calls onLost when a steal
    revoked the lock with no channel" (new fake `RevokingLocks` rejects the
    previous owner's granted request with `AbortError`); "calls onLost exactly
    once when abort and lock-taken both arrive".
  - `autosave.test.ts`: "does not write on visibility or pagehide when nothing
    is dirty"; "flushes a pending change on pagehide exactly once without
    force"; "flush(true) forces a write when clean".
  - `projectLifecycle.test.ts`: "read-only flush leaves saveStatus unchanged and
    writes nothing" (`put` spy not called; status stays `idle`).
- **Verification Proof**:
  - Reproducing runs **before** the fix:
    - `projectFile.test.ts -t "IHDR|sourceHash"`: **4 failed | 8 skipped (12)**
      (guard absent; `""` accepted).
    - `projectLock.test.ts -t "revoked|onLost"`: **1 failed | 1 passed | 6
      skipped (8)** (`first.readOnly` stayed `false`; the once-only case was
      already green via the channel).
    - `autosave.test.ts -t "nothing is dirty|force"`: **2 failed | 1 passed | 7
      skipped (10)** (2 writes for clean pagehides; 2 writes for a double
      pagehide; `flush(true)` guard green).
    - `projectLifecycle.test.ts -t "read-only"`: **1 failed | 14 skipped (15)**
      (`saveStatus` became `saved`, expected `idle`).
  - Reproducing runs **after** the fix: **projectFile 4 passed (8 skipped)**,
    **projectLock 2 passed (6 skipped)**, **autosave 3 passed (7 skipped)**,
    **projectLifecycle 1 passed (14 skipped)**.
  - Touched suites together: **4 files / 46 tests passed** (before the restored
    in-memory export test was re-added the run was 45; the final projectFile
    file has 13 tests, projectLock 8, autosave 10, lifecycle 15).
  - Full suite:
    ```text
    Test Files  18 passed (18)
         Tests  220 passed (220)
      Duration  36.61s
    ```
    (210 prior tests + 10 new; no test removed.)
  - Build:
    ```text
    ✓ 355 modules transformed.
    dist/assets/pipeline.worker-C01QtuUB.js   46.50 kB
    dist/assets/index-UUKzI0-F.js            540.01 kB │ gzip: 215.86 kB
    ✓ built in 343ms
    ```
  - `openspec validate project-persistence --strict`: **Change 'project-persistence' is valid**.
- **Status**: APPLIED
