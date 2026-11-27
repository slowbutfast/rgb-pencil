# project-storage Specification

## Purpose
Defines IndexedDB project persistence: lossless working-bitmap PNGs, compact completed-cell bitsets, debounced autosave and lifecycle flush, resume-on-start, storage-failure modes, schema/pipeline versioning, and legacy localStorage migration.

## Requirements

### Requirement: Project record contents
A saved project SHALL consist of a metadata record (`id` as a random UUID, `name`, `createdAt`, `updatedAt`, `schemaVersion`, `pipelineVersion`, `sourceHash`, `cols`, `rows`, `settings`, `completedBits`, `doneCount`) and a separate image record holding the working bitmap as a lossless PNG `Blob` plus a small thumbnail. `settings` SHALL contain `cols`, `contrast`, `dither`, `ditherStrength`, and `paletteId`. The original uploaded photo SHALL NOT be stored.

#### Scenario: Saved project contains everything needed to restore the grid
- **WHEN** a project with 10 completed cells is saved and then loaded in a fresh session
- **THEN** the restored image, settings, and 10 completed cells SHALL reproduce the same grid and the same completed cells

#### Scenario: Original photo is never stored
- **WHEN** a `4032 × 3024` photo is loaded and saved
- **THEN** the stored image SHALL have its longest edge at most `512` px

### Requirement: Lossless image storage
The working bitmap SHALL be stored as PNG so decoding it yields byte-identical RGBA data to what was saved.

#### Scenario: Round trip is bit-exact
- **WHEN** a working bitmap is encoded, stored, loaded, and decoded
- **THEN** the decoded RGBA bytes SHALL equal the original bytes, and `runPipeline` SHALL produce the same `sourceHash`

### Requirement: Compact completed-cell encoding
Completed cells SHALL be stored as a bitset of `ceil(cols × rows / 8)` bytes with bit index `row * cols + col`, and converted to and from the runtime `Set<string>` of `"col,row"` keys only at the storage boundary.

#### Scenario: Codec round trip
- **WHEN** an arbitrary set of completed cells on a `56 × 42` grid is encoded and decoded
- **THEN** the decoded set SHALL equal the original set and the encoded length SHALL be `294` bytes

#### Scenario: Out-of-range bits are ignored on decode
- **WHEN** a bitset has bits set at indices `>= cols × rows`
- **THEN** decoding SHALL ignore them and return only in-range cells

### Requirement: Debounced autosave with lifecycle flush
The application SHALL save the open project `500` ms after the last change to completed cells or settings, SHALL flush any pending save immediately on `visibilitychange` to hidden and on `pagehide`, and SHALL coalesce a burst of changes into one write.

#### Scenario: Burst of toggles produces one write
- **WHEN** the user drag-paints 40 cells within one second
- **THEN** exactly one save SHALL be issued after `500` ms of inactivity containing all 40 cells

#### Scenario: Hiding the tab flushes immediately
- **WHEN** a change is pending and the page becomes hidden
- **THEN** the save SHALL be started immediately without waiting for the debounce

### Requirement: Resume last project on start
On startup the application SHALL open the most recently opened project if one exists, restoring its image, settings, and completed cells before first render of the grid, and SHALL show the built-in sample scene only when no project exists.

#### Scenario: Reload restores the drawing
- **WHEN** the user marks 10 cells done on an uploaded image and reloads the page
- **THEN** the same image, settings, and those 10 cells SHALL be shown without re-uploading

#### Scenario: First run shows the sample scene
- **WHEN** no project exists
- **THEN** the sample scene SHALL load and a project SHALL be created on the first change

### Requirement: Save status indicator
The top bar SHALL show a quiet save status: `Saved` after a successful write, `Saving…` while a write is pending or running, and a persistent warning when saving is impossible.

#### Scenario: Status follows the write lifecycle
- **WHEN** the user toggles a cell
- **THEN** the status SHALL show `Saving…` and then `Saved` after the write completes

### Requirement: Storage unavailable runs in memory-only mode
If IndexedDB is unavailable, blocked, or throws on open, the application SHALL continue to work in memory only, SHALL display a persistent warning that progress will not be saved, and SHALL keep file export available.

#### Scenario: IndexedDB throws on open
- **WHEN** opening the database fails
- **THEN** the grid SHALL remain fully usable, the memory-only warning SHALL be visible, and no uncaught exception SHALL occur

### Requirement: Quota and write failures are surfaced
If a write fails (including `QuotaExceededError`), the application SHALL keep the in-memory state, show a warning naming the failure and suggesting deleting a project or exporting a backup, and SHALL retry on the next change.

#### Scenario: Quota exceeded
- **WHEN** a save fails with `QuotaExceededError`
- **THEN** the status SHALL show a warning, the grid and completed cells SHALL be unchanged, and the next change SHALL attempt the save again

### Requirement: Request persistent storage
After the first successful save, the application SHALL call `navigator.storage.persist()` once when available and SHALL NOT block or prompt on the result.

#### Scenario: Persist request is made once
- **WHEN** two saves succeed in a session
- **THEN** `persist()` SHALL have been called exactly once

### Requirement: Versioned schema and pipeline-version notice
The database SHALL carry a schema version with ordered upgrade steps. Each project SHALL record the `pipelineVersion` it was created under; when it differs from the running version, the application SHALL show a quiet notice that colours may differ slightly from what was drawn.

#### Scenario: Older pipeline version shows notice
- **WHEN** a project with `pipelineVersion = 1` is opened under `pipelineVersion = 2`
- **THEN** a dismissible notice SHALL be shown and the completed cells SHALL be unchanged

#### Scenario: Newer schema is not corrupted
- **WHEN** a record has a `schemaVersion` greater than the running application supports
- **THEN** the application SHALL refuse to open it and SHALL NOT modify or delete it

### Requirement: Legacy localStorage migration
When a project is created from an image whose `sourceHash` matches a legacy key `rgb-pencil:v1:<hash>`, the application SHALL import that key's `"col,row"` completed cells into the new project (ignoring out-of-range cells) and SHALL then remove the legacy key. Legacy keys SHALL never be written.

#### Scenario: Legacy progress is adopted once
- **WHEN** the user loads an image whose hash matches a legacy key holding 5 cells
- **THEN** the new project SHALL start with those 5 cells completed and the legacy key SHALL be removed
