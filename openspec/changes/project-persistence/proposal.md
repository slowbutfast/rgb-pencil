## Why

As specced, closing the tab mid-drawing loses the image and settings, and progress only returns if the user re-uploads the identical file at identical settings (`research.md`, "State save gap"). An artist works on paper over many sessions, so the screen grid must reproduce exactly what the paper shows: same image, same width, same palette, same completed cells. The user chose full scope: autosave and resume, settings lock, storage-failure warnings, file export/import, a project list, and multi-tab safety.

## What Changes

- Persist each **project** (working bitmap as lossless PNG, settings, completed bitset, timestamps, `sourceHash`, `pipelineVersion`) in IndexedDB; autosave debounced to 500 ms with `visibilitychange`/`pagehide` flush.
- **Resume** the last-opened project on startup; show the sample scene only when no project exists.
- **Project list**: open, rename, delete (with confirmation), start a new drawing from the current image, and same-image detection when re-uploading.
- **Geometry lock**: grid width and palette lock once any cell is done; contrast and dither stay editable behind an explicit warning. "Start a new drawing from this image" creates a sibling project instead of resetting in place.
- **Backup**: export a `.rgbpencil.json` project file and import it as a new project, with strict validation and no overwrite.
- **Storage failure handling**: visible memory-only warning when IndexedDB is unavailable or blocked, quota-exceeded handling, request for persistent storage, and a one-time backup nudge.
- **Multi-tab safety**: a Web Lock per project gives one writer; other tabs open it read-only, with a conflict banner as a fallback where Web Locks is missing.
- **Legacy migration**: adopt `rgb-pencil:v1:<hash>` localStorage progress into a new project when an image with that `sourceHash` is loaded, then remove the legacy key.
- **Pipeline version notice**: warn when a project was started under an older matching algorithm.
- **BREAKING (vs. `design-language-and-ui-ux`)**: replaces its localStorage-only persistence (Decision 4). That change's "Local persistence of completed cell progress" requirement is superseded here: same user-visible outcome, new storage.

## Capabilities

### New Capabilities
- `project-storage`: Project data model, IndexedDB schema and migrations, bitset codec, autosave, resume, legacy localStorage migration, pipeline-version notice, and storage failure modes.
- `project-management`: Project list operations, same-image detection, new-drawing-from-image, and the geometry lock with contrast/dither warning.
- `project-backup`: `.rgbpencil.json` export and import with structural validation, size limits, new-id import, and the backup nudge.
- `multi-tab-safety`: Per-project Web Lock ownership, read-only mode, take-over, and the fallback conflict check.

### Modified Capabilities
<!-- None in openspec/specs/ (empty: the first change's specs are unarchived deltas). The supersession of the first change's persistence requirement is recorded under "What Changes" and in design.md. -->

## Impact

- **New files**: `src/store/projectDb.ts`, `src/store/completedCodec.ts`, `src/store/autosave.ts`, `src/store/projectFile.ts`, `src/store/projectLock.ts`, `src/store/legacyMigration.ts`, plus tests under `src/store/__tests__/`.
- **Touches the prior changes' code**: `gridStore.ts` (project lifecycle, read-only flag, save status), `settingsPopover.ts` (Projects section, locked controls, export/import), `topBar.ts` (quiet `Saved` / warning indicator), `main.ts` (resume on start).
- **Depends on** `worker-pipeline-and-pdf-export` for `WorkingBitmap`, `MatchedGrid`, and `sourceHash`; apply after it.
- **Dependencies**: none at runtime (raw IndexedDB); `fake-indexeddb@^6` (Apache-2.0) as a dev dependency.
- **Zero backend**; data never leaves the browser except via the user's own exported file.
- **Rollback**: stop reading/writing IndexedDB and fall back to the first change's localStorage path; projects remain in IndexedDB untouched.
