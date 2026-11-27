# multi-tab-safety Specification

## Purpose
Defines single-writer ownership of an open project across tabs — Web Locks, read-only mode, take-over, fallback conflict detection, and cross-tab list freshness.

## Requirements

### Requirement: Single writer per project
When a project is opened, the application SHALL acquire a Web Lock named `rgb-pencil:project:<id>` using `ifAvailable` and SHALL hold it for as long as the project is open. A tab that holds the lock is the owner and may write.

#### Scenario: First tab owns the project
- **WHEN** a project is opened in a tab and no other tab holds its lock
- **THEN** the tab SHALL acquire the lock and be able to toggle cells and change settings

#### Scenario: Lock is released when the tab closes
- **WHEN** the owning tab is closed
- **THEN** another tab opening the project SHALL be able to acquire the lock

### Requirement: Read-only mode when another tab owns the project
If the lock is not available, the project SHALL open in read-only mode: hover and inspection work; completion toggles, drag-painting, Mark Done, Reset, setting changes, and autosave writes SHALL be disabled; and a banner SHALL explain that the project is open in another tab.

#### Scenario: Second tab is read-only
- **WHEN** the same project is opened in a second tab
- **THEN** the second tab SHALL show the banner, SHALL ignore click-to-complete, and SHALL write nothing to storage

#### Scenario: Inspection still works read-only
- **WHEN** the user hovers cells in a read-only tab
- **THEN** the inspector SHALL update normally

### Requirement: Take over
The read-only banner SHALL offer `Take over`, which requests the lock with `steal` semantics, switches the requesting tab to owner, and causes the previous owner to become read-only with an updated banner.

#### Scenario: Take over transfers ownership
- **WHEN** the user presses `Take over` in the read-only tab
- **THEN** that tab SHALL become the owner and the previous owner SHALL become read-only

#### Scenario: Previous owner flushes before losing the lock
- **WHEN** ownership is lost while a save is pending
- **THEN** the previous owner SHALL attempt to flush that pending save before disabling writes, and the new owner SHALL reload the project record

### Requirement: Fallback without Web Locks
Where Web Locks is unavailable, each save SHALL compare the stored `updatedAt` with the value loaded by this tab; if the stored value is newer, the save SHALL NOT overwrite it and a banner SHALL offer `Reload project`.

#### Scenario: Newer stored record blocks overwrite
- **WHEN** Web Locks is missing and another tab has saved a newer `updatedAt`
- **THEN** this tab's save SHALL be skipped and a `Reload project` banner SHALL appear

### Requirement: Cross-tab list freshness
Project list changes (create, rename, delete, import) SHALL be broadcast on a `BroadcastChannel` so other open tabs refresh their list, and a tab whose open project was deleted elsewhere SHALL switch to the next project and say so.

#### Scenario: Delete elsewhere updates this tab
- **WHEN** a project is deleted in tab A while tab B has the list open
- **THEN** tab B's list SHALL no longer show it without a manual reload
