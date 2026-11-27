# Verification — `project-persistence`

## 1. Executive Summary & Environment

| Field | Value |
| :--- | :--- |
| Change | `project-persistence` (OpenSpec schema `tdd-rnd`, 31 tasks) |
| Status | **IMPLEMENTED — all 31 tasks checked; automated gates PASS. Orchestrator browser capture completed; real UI defects found and fixed by `PATCH-01`/`PATCH-02`/`PATCH-03`/`PATCH-04`/`PATCH-05`. Safari eviction / real-device quota remain manual (§9)** |
| Date | 2026-11-27 |
| Branch | `feat/multi-20261126-2351` (no commits created by this agent) |
| Node / npm | `v22.23.2` / `10.9.8` |
| OS / arch | Linux container (x86_64), single-worker test runs |
| App runner | Vite `8.4.0`; production build emits the worker as a separate chunk |
| Test runner | Vitest `5.1.2`; jsdom `31.0.1` for UI tests, Node environment for storage tests |
| TypeScript | `5.9.3`, `"strict": true`, `noUnusedLocals`, `noUnusedParameters`, `tsc --noEmit` clean |
| New dependency | `fake-indexeddb@^6.2.8` (Apache-2.0, dev only) — the only dependency added |

**Final gate**

```text
SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm test -- --maxWorkers=1
Test Files  18 passed (18)
     Tests  210 passed (210)
  Duration  35.81s

SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm run build
✓ 355 modules transformed.
dist/assets/pipeline.worker-C01QtuUB.js   46.50 kB
dist/assets/index-B6oMMM2q.css            12.00 kB
dist/assets/index-BaDyDauy.js            539.20 kB
✓ built in 284ms
```

Baseline before this change: **11 files / 145 tests passed** (Change 1 + Change 2).
All 145 prior tests still pass; the 65 new/updated tests bring the total to 210.

### TDD evidence (red before green)

Group 1 tests were written first and run before the new modules existed:

```text
FAIL src/store/__tests__/completedCodec.test.ts
Error: Cannot find module '../completedCodec' imported from .../completedCodec.test.ts
FAIL src/store/__tests__/projectDb.test.ts
Error: Cannot find module '../completedCodec' ...
FAIL src/store/__tests__/autosave.test.ts
Error: Cannot find module '../autosave' ...
FAIL src/store/__tests__/projectLifecycle.test.ts
Error: Cannot find module '../completedCodec' ...
FAIL src/store/__tests__/projectFile.test.ts
Error: Cannot find module '../projectFile' ...
FAIL src/store/__tests__/projectLock.test.ts
Error: Cannot find module '../imageCodec' imported from .../support.ts
Test Files  6 failed (6)
     Tests  no tests
```

(The seventh UI file was added with the same batch and failed for the same reason:
`persistenceUi.test.ts` imported the not-yet-existing store surface.) Implementation
then proceeded codec → DB → image codec → records → autosave → lifecycle → file →
lock → UI, with the matching narrow suite green after each group.

---

## 2. Requirement Adherence Audit Matrix

Status legend: **PASS** = asserted by an automated test; **PASS (audit)** = proven by
static inspection of the cited code because jsdom cannot observe the platform
behaviour; **DEFERRED** = needs the manual/browser checks in §9.

### 2.1 `project-storage`

| Requirement & Scenario | Verifying test / evidence | Status |
| :--- | :--- | :--- |
| Project record contents · save then load reproduces image, settings, 10 cells | `projectLifecycle.test.ts` › "resumes the last-opened project with image, settings, and cells" (image hash, settings, two cells); `projectDb.test.ts` › create/read/list | **PASS** |
| Project record contents · original photo never stored (longest edge ≤ 512) | `gridStore.test.ts` › "prepares the working bitmap once per image, bounded to 512 px"; store persists `source` (the prepared bitmap), never the uploaded photo | **PASS (audit)** |
| Lossless image storage · round trip bit-exact and same `sourceHash` | `projectDb.test.ts` › "round-trips the PNG bit-exactly and keeps sourceHash stable" (storage seam). Orchestrator Chromium evidence: 64×48 deterministic RGBA → `createBrowserPngCodec` PNG → decode = **0 byte mismatches**, identical `sourceHash` before/after, and identical matched-grid arrays. Two runs used different test bitmaps (hence different hashes); within each run the hash was unchanged. | **PASS (storage seam + browser)** |
| Compact completed-cell encoding · 294 bytes for 56×42 | `completedCodec.test.ts` › "uses ceil(cols * rows / 8) bytes" (56×42 → 294, 96×72 → 864) | **PASS** |
| Compact completed-cell encoding · round trip equals the set | `completedCodec.test.ts` › "round-trips an arbitrary set", "keeps the corner cells" | **PASS** |
| Compact encoding · out-of-range bits ignored | `completedCodec.test.ts` › "ignores out-of-range bits on decode" (bit 300 outside 16×16) | **PASS** |
| Debounced autosave · 40 toggles → one write after 500 ms | `autosave.test.ts` › "coalesces a burst into one write after the debounce window" (fake timers: 499 ms → 0 calls, +1 ms → 1 call) | **PASS** |
| Debounced autosave · hidden tab flushes immediately | `autosave.test.ts` › "flushes immediately when the page becomes hidden" | **PASS** |
| Debounced autosave · `pagehide` flushes immediately | `autosave.test.ts` › "flushes immediately on pagehide" | **PASS** |
| Debounced autosave · serialised writes, latest wins | `autosave.test.ts` › "serialises overlapping writes and lets the latest state win" (max concurrent = 1; second save after first settles) | **PASS** |
| Resume last project · reload restores drawing without re-upload | `projectLifecycle.test.ts` › "resumes the last-opened project…"; the second store only calls `resumeLastProject()` before reading state | **PASS** |
| Resume last project · first run shows sample, project created on first change | `projectLifecycle.test.ts` › "shows the sample scene only when no project exists and creates on first change" | **PASS** |
| Save status indicator · `Saving…` then `Saved` | `persistenceUi.test.ts` › "shows the quiet save status through the write lifecycle" | **PASS** |
| Storage unavailable · grid usable, persistent warning, export still works | `persistenceUi.test.ts` › "shows a persistent memory-only warning…"; `projectFile.test.ts` › "exports from in-memory state when storage is unavailable" | **PASS** |
| Quota / write failures surfaced without losing state; next write retries | `projectDb.test.ts` › "surfaces QuotaExceededError as a status and retries on the next write"; `persistenceUi.test.ts` › "shows a full quota-failure banner with the backup suggestion" (full `save-error` banner shows "Delete a project or export a backup." and is dismissible) | **PASS (user-visible)** |
| Request persistent storage once after first successful save | `projectDb.test.ts` › "requests persistent storage once after the first successful save" (two writes → `persist` called once) | **PASS** |
| Versioned schema · ordered upgrade | `projectDb.test.ts` › "opens the named schema and exposes the three stores"; `upgrade()` creates `projects` (with `updatedAt`/`sourceHash` indexes), then `images`, then `meta` | **PASS (audit)** |
| Versioned schema · newer record refused and unmodified | `projectDb.test.ts` › "refuses a newer schema and never modifies it" (raw record re-read, `schemaVersion` unchanged); `projectLifecycle.test.ts` › "refuses a project with a newer schema…" | **PASS** |
| Pipeline-version mismatch · dismissible notice, cells unchanged | `projectLifecycle.test.ts` › "shows a dismissible notice for a pipeline version mismatch and keeps cells" | **PASS** |
| Legacy migration · adopt once, drop out-of-range, remove key, never write | `projectLifecycle.test.ts` › "adopts legacy localStorage cells once and never writes legacy keys" (5 valid + out-of-range adopted; `9999,9999` dropped; key `null`; `setItem` calls = 0) | **PASS** |

### 2.2 `project-management`

| Requirement & Scenario | Verifying test / evidence | Status |
| :--- | :--- | :--- |
| Project list · open switches grid and saves the previous project first | `projectLifecycle.test.ts` › "saves the current project before opening another" (B record has its cell after opening A) | **PASS** |
| Project list · newest first, thumbnail, name, done / total, updated time | `persistenceUi.test.ts` › "lists projects newest first with done / total…" (DOM order `new`, `old`; `7 / 2352`, `3 / 2352`) | **PASS** |
| Delete · explicit confirmation, removes metadata + image | `persistenceUi.test.ts` (inline confirm; cancel writes nothing; confirm calls `remove`); `projectDb.test.ts` › "delete removes both the metadata and the image records" | **PASS** |
| Delete · cancelled delete keeps the project | `persistenceUi.test.ts` (cancel → `removeCalls` empty) | **PASS** |
| Delete · open project falls back to next, then sample | `projectLifecycle.test.ts` › "deleting the open project falls back to the next one, then the sample" | **PASS** |
| Same-image detection · offer Resume / Start new copy before creating | `projectLifecycle.test.ts` › "offers resume or copy before creating a duplicate for the same image" (list length stays 1 before the choice) | **PASS** |
| Geometry lock · controls disable after first cell, unlock at 0 / Reset | `projectLifecycle.test.ts` › "enforces the geometry lock in the store…" (`setCols`/`setPalette` return `locked`; allowed after undo and after Reset); `persistenceUi.test.ts` › "locks width and palette while cells are done…" (disabled + caption) | **PASS** |
| Contrast / dither confirmation · declined change reverts and issues no run | `projectLifecycle.test.ts` (client call count unchanged for both without `confirmed`); `persistenceUi.test.ts` (confirm row, cancel restores the slider and the store value) | **PASS** |
| Contrast / dither · no confirmation when nothing is done | `projectLifecycle.test.ts` (pre-cell setting changes) and `persistenceUi.test.ts` initial enabled state | **PASS** |
| Start a new drawing from this image · sibling keeps the original | `projectLifecycle.test.ts` › "creates a sibling project from the image with default settings and zero cells" (original still 100 cells / 32 cols; sibling default 56) | **PASS** |
| Project names · trimmed, capped at 60, numeric suffix, empty rejected | `projectLifecycle.test.ts` › "names projects from the file and de-duplicates with a numeric suffix" (`tree`/`tree (2)`, ≤ 60, empty rename rejected, trimmed rename) | **PASS** |

### 2.3 `project-backup`

| Requirement & Scenario | Verifying test / evidence | Status |
| :--- | :--- | :--- |
| Export · full project in `<name>.rgbpencil.json` | `projectFile.test.ts` › "exports every part of the project" (format, version, cols, settings, name, hash, non-empty bitset/base64 PNG, dimensions) | **PASS** |
| Export · works without storage | `projectFile.test.ts` › "exports from in-memory state when storage is unavailable" (parse of the produced file yields the completed cell) | **PASS** |
| Import · creates a new id, never overwrites | `projectFile.test.ts` › "round-trips export, delete, and import under a new id" (imported id differs; image bytes equal; cells equal) | **PASS** |
| Strict validation · non-JSON | `projectFile.test.ts` rejection table (`/json/i`) | **PASS** |
| Strict validation · wrong `format` | rejection table (`/format/i`) | **PASS** |
| Strict validation · newer `version` | rejection table (`/update|version/i`) | **PASS** |
| Strict validation · `cols` outside 16–96 / non-integer `rows` | rejection table (`/columns|cols|width/i`, `/rows/i` for 0 and 2.5) | **PASS** |
| Strict validation · inconsistent bitset length | rejection table (`/bitset/i`) | **PASS** |
| Strict validation · contrast/dither/palette ranges | rejection table (`/contrast/i`, `/dither/i`, `/palette/i`) | **PASS** |
| Strict validation · undecodable PNG | rejection table (`/png/i`) | **PASS** |
| Strict validation · bitmap longest edge > 1024 | rejection table (`/1024|large/i`) | **PASS** |
| Strict validation · file > 8 MB rejected before parsing | `projectFile.test.ts` › "rejects a file over 8MB before reading it" (`text()` spy not called) | **PASS** |
| Names text-only | `projectFile.test.ts` › "treats names as plain text"; `persistenceUi.test.ts` renders the markup name with `textContent` and no injected element (`img:not(.project-thumb)` is null) | **PASS** |
| Backup nudge · once at 50, dismissed/exported suppresses, survives reload | `projectFile.test.ts` › "shows the backup nudge once at 50 cells…" (appears, dismiss removes it, 60 cells still hidden, reopening the project from IndexedDB still hidden; a second project that exported before 50 never nudges) | **PASS** |

### 2.4 `multi-tab-safety`

| Requirement & Scenario | Verifying test / evidence | Status |
| :--- | :--- | :--- |
| Single writer · first tab owns, second read-only | `projectLock.test.ts` › "gives the second opener read-only mode and writes nothing" (second toggle is a no-op; record still 1 cell; hover works) | **PASS** |
| Read-only · banner, writes disabled, inspection works | Same test (banner id `read-only`; hover set); `persistenceUi.test.ts` › "disables paint and Mark Done while read-only…" (Mark Done disabled + "Read-only", pointerdown adds no cell) | **PASS** |
| Take over · swaps ownership, previous owner flushes then goes read-only, new owner reloads | `projectLock.test.ts` › "takes over ownership and flushes the previous owner before going read-only": asserts the stolen lock is actually held, final record = 3 cells (seed + flushed + new), and a third tab opening afterwards is read-only and cannot write | **PASS** |
| Lock released when the owning tab closes | `projectLock.test.ts` › "releases the lock when the owning tab closes" (next opener is read-write) | **PASS** |
| Fallback without Web Locks · stale `updatedAt` blocks overwrite + Reload banner | `projectLock.test.ts` › "skips a stale write and offers Reload project without Web Locks" (DB still has 7 cells; banner `reload`) | **PASS** |
| Cross-tab list freshness | `projectLock.test.ts` › "refreshes the list across tabs…" (BroadcastChannel `list-changed` updates a second store) | **PASS** |
| Deleted elsewhere · open tab switches and says so | Same test (deleted project → `projectId` null, sample grid present, banner `notice`) | **PASS** |

---

## 3. Task Completion Map (31/31)

| Tasks | Evidence |
| :--- | :--- |
| 1.1–1.7 | Red run captured in §1; 7 new test files, 55 tests |
| 2.1 | Prerequisite symbols confirmed: `WorkingBitmap`, `MatchedGrid`, `sourceHash`, integer `PIPELINE_VERSION = 1` (`src/engine/pipeline.ts`) |
| 2.2 | `completedCodec.ts`; `completedCodec.test.ts` (7) |
| 2.3 | `projectDb.ts`; `projectDb.test.ts` (12) including newer-schema, quota, persist-once |
| 2.4 | `imageCodec.ts` (injectable `PngCodec`, browser canvas/`createImageBitmap`, guarded), `downscaleBitmap`; seam round-trip in `projectDb.test.ts` |
| 2.5 | `projectManager.ts`; resume/records in `projectLifecycle.test.ts` |
| 3.1 | `autosave.ts`; `autosave.test.ts` (7) |
| 3.2 | Memory-only in store/UI tests; quota in DB test; `persist()` once test |
| 3.3 | `resumeLastProject`, sample fallback; lifecycle tests |
| 3.4 | `legacyMigration.ts`; adoption test |
| 4.1 | List/open/rename/delete + fallback; lifecycle + UI tests |
| 4.2 | Same-image offer, sibling, naming; lifecycle tests |
| 4.3 | Store-level lock/confirmation; lifecycle + UI tests |
| 4.4 | Projects section, lock captions, confirmations; `persistenceUi.test.ts` |
| 5.1 | `exportProject`; `projectFile.test.ts` export + memory-only |
| 5.2 | Validator + new-id import; rejection table |
| 5.3 | Nudge at 50, dismissal/export suppression, persisted per project |
| 6.1 | `projectLock.ts`; Web Lock tests |
| 6.2 | Store + canvas + inspector gating; read-only tests |
| 6.3 | Compare-and-put in one transaction; fallback test |
| 6.4 | `createProjectChannel`; list/deleted tests |
| 7.1 | `topBar` save caption + banner list (single dismissible lines) |
| 7.2 | `main.ts` awaits `resumeLastProject()` before mounting/rendering |
| 8.1 | Full suite + build below; metric deltas below |
| 8.2 | This document |

---

## 4. Resolved Assumptions & Empirical Proof

| Assumption (`research.md`) | Resolution | Evidence |
| :--- | :--- | :--- |
| **Safari/WebKit storage eviction** | **Still manual.** No Safari runtime is available in this container; the mitigation (persistent-storage request, backup nudge, file export) is implemented and tested, but eviction policy itself is unverified. | §9 manual |
| **PNG size / real codec round trip (~300–600 KB for 512×384)** | **Storage seam + real browser verified.** jsdom has no canvas, so the integrity contract is proven through the injectable lossless codec: raw 512×384 RGBA = **786,432 bytes**; the fake stored payload computes to **786,440 bytes** (8-byte test header). The orchestrator additionally ran a direct Chromium check of `createBrowserPngCodec`: 64×48 deterministic RGBA → PNG → decode produced **0 byte mismatches**, an identical `sourceHash` before/after, and identical matched-grid arrays. Two runs used different test bitmaps, so the hashes differ between runs; within each run the hash was unchanged. | `projectDb.test.ts` + orchestrator Chromium evidence (no new dependency) |
| **`pagehide` IndexedDB commits** | **Listener + flush proven, commit durability still best-effort.** The autosave schedules and flushes on `pagehide`/hidden (fake `EventTarget` tests); an IndexedDB transaction started during `pagehide` is still not guaranteed by the platform. Loss remains bounded by the 500 ms debounce. | `autosave.test.ts`; deliberate design note in `architecture.md` §5 |
| **Quota comfortably exceeds 20 projects × ~0.5 MB** | **Still manual.** `QuotaExceededError` handling and retry are proven with a simulated `IDBObjectStore.put` failure; real-device `navigator.storage.estimate()` was not read. | `projectDb.test.ts`; §9 manual |
| **Web Locks present in evergreen browsers** | **Fallback proven; availability not measured.** The fake lock manager exercises `ifAvailable`, `steal`, and release; `locks: null` exercises the compare-and-put fallback. | `projectLock.test.ts` |
| **`fake-indexeddb` can hold Blob values** | **Verified** in Node environment (Node's global `Blob` is structured-cloneable); jsdom UI tests use an in-memory `ProjectDatabase` because fake-indexeddb cannot clone jsdom host Blobs. | `projectDb.test.ts`, `persistenceUi.test.ts` |

### Nomenclature & code-symbol audit

| Glossary term | Code symbol(s) | Match |
| :--- | :--- | :--- |
| Project | `ProjectRecord`, `projectId`, `ProjectSummary` | ✅ |
| Working bitmap | `WorkingBitmap`, `prepareWorkingBitmap`, `ProjectImageRecord` | ✅ |
| Resume | `resumeLastProject()`, `applyLoadedProject()` | ✅ |
| Geometry lock | `setCols`/`setPalette` → `{ ok: false, reason: 'locked' }` | ✅ |
| Completed bitset | `encodeCompleted`, `decodeCompleted`, `completedByteLength`, `completedBits` | ✅ |
| `sourceHash` | `ProjectRecord.sourceHash`, `findBySourceHash` index | ✅ |
| Project id | `crypto.randomUUID` (guarded) in `defaultRandomId`, `ProjectRecord.id` | ✅ |
| Pipeline version | `PIPELINE_VERSION` (integer) stored as `pipelineVersion` | ✅ |
| Ownership lock | `projectLockName()` = `rgb-pencil:project:<id>`, `acquireProjectLock` | ✅ |
| Read-only mode | `GridStoreState.readOnly`, banner id `read-only`, `takeOver()` | ✅ |
| Project file | `ProjectFilePayload`, `.rgbpencil.json`, `parseProjectFile` | ✅ |

---

## 5. Empirical Execution Logs

### 5.1 Incremental suites (during implementation)

```text
npx vitest run src/store/__tests__/completedCodec.test.ts
Test Files  1 passed (1)
     Tests  7 passed (7)

npx vitest run src/store/__tests__/projectDb.test.ts
Test Files  1 passed (1)
     Tests  12 passed (12)

npx vitest run src/store/__tests__/autosave.test.ts
Test Files  1 passed (1)
     Tests  7 passed (7)

npx vitest run src/store/__tests__/projectLifecycle.test.ts
Test Files  1 passed (1)
     Tests  14 passed (14)

npx vitest run src/store/__tests__/projectFile.test.ts
Test Files  1 passed (1)
     Tests  9 passed (9)

npx vitest run src/store/__tests__/projectLock.test.ts
Test Files  1 passed (1)
     Tests  6 passed (6)

npx vitest run src/ui/__tests__/persistenceUi.test.ts
Test Files  1 passed (1)
     Tests  9 passed (9)
```

### 5.2 Final full regression (verbatim tail)

```text
> rgb-pencil@0.1.0 test
> vitest run --maxWorkers=1

 Test Files  18 passed (18)
      Tests  210 passed (210)
   Start at  03:26:04
   Duration  35.81s
```

### 5.3 Final build (verbatim tail)

```text
> tsc --noEmit && vite build
✓ 355 modules transformed.
dist/index.html                            7.27 kB │ gzip:   2.06 kB
dist/assets/pipeline.worker-C01QtuUB.js   46.50 kB
dist/assets/index-B6oMMM2q.css            12.00 kB │ gzip:   3.08 kB
dist/assets/index-BaDyDauy.js            539.20 kB │ gzip: 215.54 kB
✓ built in 284ms
```

### 5.4 Metric / data deltas

| Metric | Before (Change 2) | After | Notes |
| :--- | :--- | :--- | :--- |
| Test files | 11 | 18 | 7 new files |
| Tests | 145 | 210 | +65; none removed |
| First-change localStorage keys written | 1 per image | 0 | `gridStore` no longer calls `setItem`; legacy test asserts 0 |
| Completed bitset, 56×42 | n/a | 294 B | codec test |
| Completed bitset, 96×72 | n/a | 864 B | codec test |
| Stored working bitmap edge | full photo | ≤512 px | `prepareWorkingBitmap` unchanged; record stores that bitmap |
| Build modules | 347 | 355 | +8 store modules |
| Worker chunk | 46.50 kB | 46.50 kB | unchanged |

No records or features were dropped: the project list, resume, export/import,
and completed cells are additive. The only removed behaviour is the superseded
`rgb-pencil:v1:*` write path.

---

## 6. Change 1 + 2 Regression Evidence

All prior suites still pass in the final 18-file / 200-test run:

- Engine: `colorMath`, `contrast`, `matcher`, `engineClient`, `engine`, `pipelineClient`,
  `guideBuilder`, `pdfExporter`
- Store/UI: `gridStore`, `ui`, `touchAndExport`

Two prior tests were updated to the superseding contract (not weakened):

1. `gridStore.test.ts` — legacy persistence/restore assertion → "never writes legacy
   keys"; restore is now covered by `projectLifecycle.test.ts`.
2. `gridStore.test.ts` — width-shrink pruning while cells exist → store-level
   geometry lock (refuse, then allow after Reset).
3. `touchAndExport.test.ts` — the pipeline-error trigger uses contrast-with-confirmation
   instead of width (width is locked once a cell is done); all error-line assertions
   are unchanged.

Change 2 touch behaviour (inspect-only, Mark Done/Undo), PDF export, export
options, worker client, and Change 1 visuals/samples/upload all remain green.

---

## 7. Approved Scope Exceptions

The orchestrator pre-approved these minimal additions outside the primary store
modules:

- **CSS** (`src/styles/main.css`): `.save-status`, `.banner-stack`, `.banner`,
  `.banner-action`, `.banner-dismiss`, `.projects-section`, `.project-list`,
  `.project-row`, `.project-thumb`, `.project-info`, `.project-name`,
  `.project-meta`, `.project-row-actions`, `.project-action`, `.project-actions`,
  `.project-status`, `.inline-confirm`, `.settings-lock-caption`.
  Values use existing tokens where available; a few literal control sizes
  (project thumbnail `28px`, project-list `max-height: 210px`, 1 px borders)
  inside the approved exception.
- **`src/ui/dropZone.ts`**: passes `file.name` to `store.loadImage()` so new
  projects can be named from the uploaded file. No drag/drop behaviour changed.
- **Two prior test files** were updated only where the superseding persistence
  contract changed the expectation: `src/store/__tests__/gridStore.test.ts`
  (legacy localStorage write/restore → "never writes legacy keys"; width shrink
  → store-level geometry lock) and `src/ui/__tests__/touchAndExport.test.ts`
  (pipeline-error trigger now uses confirmed contrast instead of a locked width).
  No assertion was removed or weakened.
- `index.html` was **not modified** for this change; all new UI is mounted
  dynamically by `topBar.ts` / `settingsPopover.ts`.

---

## 8. Files Added / Modified

**Added (8 modules + 7 tests + support):**

```text
src/store/completedCodec.ts
src/store/projectDb.ts
src/store/imageCodec.ts
src/store/autosave.ts
src/store/projectManager.ts
src/store/projectFile.ts
src/store/projectLock.ts
src/store/legacyMigration.ts
src/store/__tests__/support.ts
src/store/__tests__/completedCodec.test.ts
src/store/__tests__/projectDb.test.ts
src/store/__tests__/autosave.test.ts
src/store/__tests__/projectLifecycle.test.ts
src/store/__tests__/projectFile.test.ts
src/store/__tests__/projectLock.test.ts
src/ui/__tests__/persistenceUi.test.ts
```

**Modified:**

```text
package.json, package-lock.json            (+ fake-indexeddb dev dependency)
src/store/gridStore.ts                     (project lifecycle, persistence, locks, gating)
src/ui/topBar.ts                           (save caption, banners, same-image offer)
src/ui/settingsPopover.ts                  (Projects section, locks, confirmations)
src/ui/gridCanvas.ts                       (read-only paint gate)
src/ui/inspectorSidebar.ts                 (read-only Mark Done, hint)
src/ui/dropZone.ts                         (pass file name)
src/main.ts                                (await resume before first render)
src/styles/main.css                        (approved tokens-only additions)
src/store/__tests__/gridStore.test.ts      (superseded-contract updates)
src/ui/__tests__/touchAndExport.test.ts    (geometry-lock trigger update)
openspec/changes/project-persistence/tasks.md
openspec/changes/project-persistence/patch.md
openspec/changes/project-persistence/verification.md
```

No `playgrounds/*`, `.env*`, credential, or other-change artifact was touched.

---

## 9. Orchestrator Browser Capture / Manual Review

**Automated browser launch was not possible in this container:** Chromium aborted
with `No usable sandbox!` (the Playwright MCP server cannot launch without
`chromiumSandbox: false`). No screenshots were produced by this agent. The
following checks must be run by the orchestrator / a human:

| # | Check | Steps | Expected |
| :--- | :--- | :--- | :--- |
| M1 | Reload resume | Upload a photo, wait for `Saved`, mark cells (including a drag-paint), reload | Same image, width, palette, contrast, and exactly those cells appear without re-upload; caption reads `Saved` before reload |
| M2 | Project list | Create two drawings; open Settings | Rows newest first with thumbnail, name, `done / total`, updated time; open switches grid; rename inline; delete shows inline confirm and removes the row |
| M3 | Export / import | Export a project, delete it, import the file, then import a corrupted copy | Restored project matches image/settings/cells under a new id; corrupted file shows a message and creates nothing |
| M4 | Two-tab read-only + take over | Open the same project in two tabs; mark a cell in tab B; press `Take over` | Tab B is read-only with a banner and cannot toggle; after take-over tab A becomes read-only and tab B can write; list changes propagate |
| M5 | Memory-only | Open in a context where IndexedDB is blocked/private | Grid works, persistent warning is visible, Export project still produces a file |
| M6 | Legacy progress | Seed `rgb-pencil:v1:<hash>` from the first change, load the matching image | Cells appear completed once and the legacy key is gone |
| M7 | Safari storage eviction | Use the app in Safari for several sessions/days, then check project persistence | Projects survive unless Safari evicts; backup export restores them. **Unverified assumption** |
| M8 | Real-device quota | Read `navigator.storage.estimate()` on a phone after several projects | Usage plausible and no `QuotaExceededError` in normal use. **Unverified assumption** |
| M9 | Banners never overlay grid | At 1280×800 and 390×844, force memory-only + backup + pipeline notices | Each banner is a single dismissible line below the pills; it does not cover grid cells |
| M10 | Real PNG size | Upload a photographic 4000 px image and inspect the stored `images` Blob size | Lossless PNG roughly a few hundred KB (soft expectation; not asserted in CI) |

The automated contract for each of these is already covered by the matrix above;
these checks are visual/platform confirmation only.

---

## 10. Orchestrator Browser Capture (2026-11-27)

Run in Chromium at 1280×800 by the orchestrator after implementation.

**Verified passes**

- Reload resume: image, settings, and completed cells restored after reload.
- Autosave status showed `Saved`.
- Geometry lock after one completed cell; contrast confirmation applied and
  cancelled correctly.
- 50-cell backup nudge appeared, was suppressed by export, and stayed suppressed
  after reload.
- Project export → delete → import created a new id with identical completed cells.
- Invalid JSON import was rejected with no project created.
- Memory-only banner was visible and project export still worked.
- Two-tab read-only mode worked; `Take over` swapped ownership.
- Legacy `rgb-pencil:v1:<hash>` adoption restored 4 cells (3 legacy) and removed
  the key.
- Same-image offer showed `Resume existing` and `Start new copy`.
- Project switch and start-new-drawing behaved correctly.

**Defects found and repaired**

- Fast edits during first project creation were lost
  (`doneCount` truncated to 1). Fixed in `PATCH-01`.
- Settings closed when a project row action was clicked, hiding Rename/Delete
  confirmation. Fixed in `PATCH-01`.
- After PATCH-01, **Export project** still closed Settings because the synthetic
  download anchor's click bubbled to document. Fixed in `PATCH-02` (same guard
  applied to `downloadPdf`).
- Banners overlaid the grid: with memory-only + backup lines, `banner-list`
  bottom was `119.81` while cells started at `112`, so the second line covered
  cells. Fixed in `PATCH-03` by moving the stack into the stage flow before
  `.grid-frame`, making `.stage` a column, and shrinking the canvas by the
  measured banner height. Geometry is re-checked in Chromium; jsdom has no
  layout and only asserts stack placement/rendering.

- **C1 (independent verification)**: after `Take over`, the stolen Web Lock was
  released immediately, allowing a third writer. Fixed in `PATCH-04` with a
  fresh hold per ownership grant; a third opener is now read-only.
- **W1**: save failures now render a full dismissible `save-error` banner with
  the backup suggestion, not just the clipped caption.
- **W3**: pending/in-flight autosaves are suppressed and awaited around deletion,
  so a deleted project cannot be recreated.
- **W4**: memory-only imports now show the pipeline-version notice.
- **S2**: Settings closes when the same-image offer appears.
- **S3**: the read-only banner keeps `Take over` and has no dismiss control.
- **S7**: `pagehide` now flushes, then disposes the store and worker.
- **W2**: orchestrator Chromium evidence now confirms `createBrowserPngCodec`
  64×48 RGBA → PNG → decode has 0 byte mismatches, identical `sourceHash`, and
  identical matched-grid arrays (hash unchanged within each run; the two runs
  used different bitmaps).
- **PATCH-05**: removed the 250 ms steal cutoff so a delayed `{steal:true}` grant
  is awaited and its hold stays pending (regression test grants after 300 ms;
  the lock is still held and a third opener is read-only). Quota advice is only
  emitted once. `createProjectRecord` derives `doneCount` from the encoded
  in-range bitset.

All repairs are covered by the regression tests cited in `patch.md`; the final
automated gate is **18 files / 210 tests passed** plus a clean build.

**Known limitations (unchanged)**: project-list counts can be stale while the
Settings popover stays open; a failed recompute during project open can leave
mixed in-memory settings.

---

## 11. PATCH-06 — PR #1 review hardening

Applied 2026-11-27; uncommitted on `feat/multi-20261126-2351`.

| Review item | Resolution | Verifying evidence |
| :--- | :--- | :--- |
| Important 1 — main spec still describes `localStorage` persistence | Added a `## MODIFIED Requirements` delta (`specs/interactive-pixel-grid/spec.md`) and applied the identical "Local persistence of completed cell progress" block to `openspec/specs/interactive-pixel-grid/spec.md` (IndexedDB project + read-once legacy adoption) | `openspec validate project-persistence --strict` → valid; block diffed identical in both files |
| Important 2 — PNG decoded before the real dimensions are checked | `projectFile.readPngIhdr()` validates the PNG signature and first IHDR chunk (bytes 16–23, big-endian) and requires equality with the declared bitmap plus `<= 1024` **before** `codec.decode`; `imageCodec.ts` untouched | `projectFile.test.ts` › IHDR oversize (decode spy never called), IHDR mismatch, non-PNG signature |
| Important 3 — lock loss only detected through BroadcastChannel | Granted `locks.request` rejection now calls a shared `notifyLost()` (read-only, clear hold, `onLost` once); `release()` never notifies; PATCH-05 steal wait/hold unchanged | `projectLock.test.ts` › "goes read-only and calls onLost when a steal revoked the lock with no channel"; "calls onLost exactly once when abort and lock-taken both arrive" |
| Minor 4 — clean lifecycle flushes rewrite the record | `flush(force = false)` no-ops when `!force && !dirty && !running`; a running chain queues only when forced/newly dirty; `flush(true)` still always writes | `autosave.test.ts` › clean visibility/pagehide zero writes; pending pagehide exactly once; `flush(true)` when clean |
| Minor 5 — read-only save reports `Saved` | `persistCurrent` returns `{ ok: true, skipped: true }` for `state.readOnly`; `write()` keeps the status for skipped outcomes | `projectLifecycle.test.ts` › "read-only flush leaves saveStatus unchanged and writes nothing" |
| Minor 6 — unconstrained `sourceHash` | Import requires `/^[0-9a-f]{1,8}$/` | `projectFile.test.ts` › "sourceHash must be 1-8 hex characters" |

**TDD evidence**: the four `-t` reproduction commands failed before the fix
(projectFile 4 failed, projectLock 1 failed + 1 channel guard passed, autosave
2 failed + 1 `flush(true)` guard passed, lifecycle 1 failed with `saveStatus`
`idle` → `saved`) and all pass after.

**Final gate**

```text
Test Files  18 passed (18)
     Tests  220 passed (220)
  Duration  36.61s

✓ 355 modules transformed.
dist/assets/pipeline.worker-C01QtuUB.js   46.50 kB
dist/assets/index-UUKzI0-F.js            540.01 kB │ gzip: 215.86 kB
✓ built in 343ms

Change 'project-persistence' is valid
```

210 prior tests + 10 new regression tests; no test or record was removed.

**Recorded deviation**: `src/store/__tests__/support.ts` (test helper, outside
the patch's target map) now emits a real PNG signature + IHDR chunk in its fake
payload so the header guard can validate existing export/import fixtures. No
assertion changed; bit-exact round trips still pass. The fake 512×384 PNG size
log moves from 786,440 to 786,465 bytes.
