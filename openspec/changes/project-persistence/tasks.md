## 1. Test Scaffolding (TDD)

- [ ] 1.1 Add `fake-indexeddb` dev dependency and write failing tests for the completed-bitset codec
- [ ] 1.2 Write failing tests for `projectDb` (CRUD, newest-first list, bit-exact PNG round trip, newer-schema refusal, failure statuses, single `persist()` call)
- [ ] 1.3 Write failing tests for autosave (debounce coalescing, lifecycle flush, serialised writes, status transitions)
- [ ] 1.4 Write failing tests for project lifecycle (resume, switch, delete fallback, same-image offer, sibling project, naming rules, geometry lock and contrast/dither confirmation, pipeline-version notice, legacy adoption)
- [ ] 1.5 Write failing tests for the project file (round trip, every rejection case, markup-safe names, backup nudge, memory-only export)
- [ ] 1.6 Write failing tests for tab safety (lock ownership, read-only, take-over with flush, no-Web-Locks fallback, `BroadcastChannel` refresh)
- [ ] 1.7 Write failing UI tests for save status, banners, locked controls, projects list, and confirmations

## 2. Storage Foundation

- [ ] 2.1 Confirm `worker-pipeline-and-pdf-export` is applied (`WorkingBitmap`, `MatchedGrid`, `sourceHash`, `PIPELINE_VERSION`); if not, apply it first
- [ ] 2.2 Implement `src/store/completedCodec.ts`
- [ ] 2.3 Implement `src/store/projectDb.ts` (stores `projects`, `images`, `meta`; version 1 upgrade; promise helper; newer-schema guard)
- [ ] 2.4 Implement PNG encode/decode helpers for `WorkingBitmap` and thumbnail generation
- [ ] 2.5 Implement project record create/load/save with `pipelineVersion` and `sourceHash`

## 3. Autosave and Resume

- [ ] 3.1 Implement `src/store/autosave.ts` (500 ms debounce, `visibilitychange`/`pagehide` flush, serialised writes, status)
- [ ] 3.2 Add memory-only mode, quota/write failure handling, and one-time `navigator.storage.persist()`
- [ ] 3.3 Wire `gridStore` to load and resume the last project on start and fall back to the sample scene
- [ ] 3.4 Implement `src/store/legacyMigration.ts` and call it once at project creation

## 4. Project Management

- [ ] 4.1 Implement list/open/rename/delete with confirmation and delete-open-project fallback
- [ ] 4.2 Implement same-image detection and `Start new drawing from this image`; implement name rules
- [ ] 4.3 Enforce geometry lock and contrast/dither confirmation in store actions (not only UI)
- [ ] 4.4 Add Projects section, locked-control captions, and confirmation rows to `settingsPopover`

## 5. Backup File

- [ ] 5.1 Implement export to `.rgbpencil.json` (works in memory-only mode)
- [ ] 5.2 Implement `projectFile.ts` import with size pre-check, structural validator, PNG/dimension checks, new-id creation, and clear rejection messages
- [ ] 5.3 Implement the backup nudge (once at 50 cells, suppressed by export or dismissal)

## 6. Multi-Tab Safety

- [ ] 6.1 Implement `src/store/projectLock.ts` (Web Lock `ifAvailable`, release on close, `steal` take-over, flush-before-readonly)
- [ ] 6.2 Implement read-only mode in the store and canvas interaction paths (toggle, drag-paint, Mark Done, Reset, settings, autosave all gated)
- [ ] 6.3 Implement the no-Web-Locks fallback (compare-and-put on `updatedAt`, reload banner)
- [ ] 6.4 Implement `BroadcastChannel` list-changed and deleted notifications

## 7. UI Wiring

- [ ] 7.1 Add the save status caption and banners (read-only, memory-only, backup nudge, pipeline-version notice, reload prompt) to `topBar`
- [ ] 7.2 Update `main.ts` to await resume before first grid render

## 8. Verification & Empirical Audit

- [ ] 8.1 Run full regression test suite (`npm test`) and `npm run build`; verify clean passes and check for metric/data regressions (including recorded PNG size)
- [ ] 8.2 Populate verification.md with Requirement Adherence Matrix, resolved assumptions (Safari eviction, PNG size, `pagehide` commit, quota), and verbatim execution logs
