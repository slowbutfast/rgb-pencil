# project-backup Specification

## Purpose
Defines the portable project-file export/import format with strict validation, new-id import semantics, and the one-time backup nudge.

## Requirements

### Requirement: Export a project file
The application SHALL export the open project as a file named `<project-name>.rgbpencil.json` containing `format: "rgb-pencil-project"`, `version`, `name`, `createdAt`, `updatedAt`, `pipelineVersion`, `settings`, `cols`, `rows`, `sourceHash`, the completed bitset as base64, and the working bitmap PNG as base64. Export SHALL work in memory-only mode.

#### Scenario: Export contains the full project
- **WHEN** the user exports a project with 10 completed cells
- **THEN** the downloaded file SHALL parse as JSON and contain the settings, a bitset decoding to those 10 cells, and a PNG that decodes to the working bitmap

#### Scenario: Export works without storage
- **WHEN** IndexedDB is unavailable and the user exports
- **THEN** the file SHALL still be produced from in-memory state

### Requirement: Import creates a new project
Importing a project file SHALL create a new project with a new id and SHALL NOT overwrite or modify any existing project, even one with the same name or `sourceHash`. After import the new project SHALL open.

#### Scenario: Import never overwrites
- **WHEN** the user imports a file exported from a project that still exists
- **THEN** a second, separate project SHALL appear and the original SHALL be unchanged

#### Scenario: Round trip preserves progress
- **WHEN** a project is exported, deleted, and imported
- **THEN** the imported project SHALL have identical settings, image bytes, and completed cells

### Requirement: Strict validation of imported files
Import SHALL reject, with a clear message and without touching storage, any file that: exceeds `8 MB`; is not valid JSON; lacks `format: "rgb-pencil-project"`; has a `version` newer than supported; has `cols` outside `16–96` or non-integer `rows` outside `1–512`; has a bitset whose decoded length differs from `ceil(cols × rows / 8)`; has settings outside permitted ranges (contrast `1.0–2.3`, ditherStrength `0–1`, known `paletteId`); or has a bitmap that fails to decode as PNG or whose longest edge exceeds `1024` px. Import SHALL NOT execute any content from the file.

#### Scenario: Malformed file is rejected cleanly
- **WHEN** the user imports a text file that is not valid JSON
- **THEN** a rejection message SHALL be shown and no project SHALL be created

#### Scenario: Inconsistent bitset is rejected
- **WHEN** a file declares `cols = 56`, `rows = 42` but carries a 10-byte bitset
- **THEN** import SHALL be rejected and storage SHALL be unchanged

#### Scenario: Oversize file is rejected before parsing
- **WHEN** the selected file is larger than `8 MB`
- **THEN** import SHALL be rejected without reading its contents into JSON

#### Scenario: Newer version is refused
- **WHEN** a file has a `version` greater than the supported version
- **THEN** import SHALL be rejected with a message to update the application

### Requirement: Backup nudge
After a project first reaches `50` completed cells with no export performed, the application SHALL show one quiet, dismissible suggestion to export a backup, and SHALL NOT show it again for that project once exported or dismissed.

#### Scenario: Nudge appears once
- **WHEN** a never-exported project reaches `50` completed cells
- **THEN** one dismissible backup suggestion SHALL appear, and after dismissal it SHALL not reappear for that project

#### Scenario: Export suppresses the nudge
- **WHEN** the user exports before reaching `50` completed cells
- **THEN** no backup suggestion SHALL be shown for that project
