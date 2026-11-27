# project-management Specification

## Purpose
Defines the project list and lifecycle, same-image detection, geometry locking, contrast/dither confirmations, sibling drawings, and project naming.

## Requirements

### Requirement: Project list operations
The Settings popover SHALL contain a Projects section listing saved projects (newest first) with thumbnail, name, `done / total`, and last-updated time, and SHALL support open, rename, and delete. Delete SHALL require explicit confirmation and SHALL remove both the metadata and image records. Opening a project SHALL make it the resume target.

#### Scenario: Opening a project switches the grid
- **WHEN** the user opens a different project from the list
- **THEN** the grid, settings, and completed cells SHALL switch to that project and the previous project SHALL be saved first

#### Scenario: Delete removes all records after confirmation
- **WHEN** the user confirms deleting a project
- **THEN** its metadata and image records SHALL be removed and it SHALL no longer appear in the list

#### Scenario: Cancelled delete keeps the project
- **WHEN** the user cancels the delete confirmation
- **THEN** the project SHALL be unchanged

#### Scenario: Deleting the open project falls back
- **WHEN** the currently open project is deleted
- **THEN** the application SHALL open the next most recent project, or the sample scene if none remain

### Requirement: Same-image detection on upload
When the user loads an image whose `sourceHash` equals that of an existing project, the application SHALL offer `Resume existing` or `Start new copy` before creating anything.

#### Scenario: Re-uploading the same image offers resume
- **WHEN** the user uploads the image they already have a project for, at the same grid width
- **THEN** the application SHALL offer `Resume existing` and `Start new copy`, and SHALL NOT silently create a duplicate

### Requirement: Geometry lock once drawing has started
While `doneCount > 0`, grid width and palette controls SHALL be disabled with a caption explaining why, and the pipeline SHALL NOT accept a width or palette change for that project.

#### Scenario: Controls lock after the first completed cell
- **WHEN** the user marks one cell done
- **THEN** the Grid Width and Palette controls SHALL become disabled and a caption SHALL state that settings are locked while drawing

#### Scenario: Controls unlock when all progress is undone
- **WHEN** the user undoes the only completed cell so `doneCount` is `0`
- **THEN** the Grid Width and Palette controls SHALL become enabled again

#### Scenario: Reset unlocks
- **WHEN** the user clears all completed cells with Reset
- **THEN** the controls SHALL become enabled

### Requirement: Contrast and dither edits warn when cells are done
While `doneCount > 0`, changing contrast or dithering SHALL require an explicit confirmation stating that finished cells may no longer match the paper drawing. Declining SHALL restore the previous value and SHALL NOT trigger a pipeline run.

#### Scenario: Confirmation required
- **WHEN** `doneCount > 0` and the user changes the Contrast Boost
- **THEN** a confirmation SHALL be shown before the change is applied

#### Scenario: Declined change is reverted
- **WHEN** the user declines the confirmation
- **THEN** the slider SHALL return to its previous value and no pipeline request SHALL be issued

#### Scenario: No confirmation when nothing is done
- **WHEN** `doneCount` is `0` and the user changes contrast
- **THEN** the change SHALL apply immediately without confirmation

### Requirement: Start a new drawing from this image
The application SHALL offer `Start new drawing from this image`, which creates a sibling project with the same working bitmap, default settings, and zero completed cells, leaves the original project intact, and opens the new one.

#### Scenario: Sibling project keeps the original
- **WHEN** the user starts a new drawing from an image with 100 completed cells
- **THEN** a new project with `0` completed cells SHALL open and the original SHALL still have `100`

### Requirement: Project names
New projects SHALL be named from the uploaded file name without extension (or `Sample scene`), de-duplicated with a numeric suffix, trimmed, and limited to `60` characters; renaming SHALL enforce the same limits and reject empty names.

#### Scenario: Duplicate names get a suffix
- **WHEN** a second project is created from `tree.png` while `tree` exists
- **THEN** it SHALL be named `tree (2)`
