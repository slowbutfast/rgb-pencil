## MODIFIED Requirements

### Requirement: Local persistence of completed cell progress
Completed cell progress SHALL persist across page reloads and browser restarts as part of the open project in the project store (IndexedDB), together with the project's image and settings, so reloading the page restores drawing progress automatically. Legacy `localStorage` progress written by earlier versions under `rgb-pencil:v1:<hash>` SHALL only be read once to seed a new project and then removed; it SHALL NOT be written.

#### Scenario: Page reload restores completed pixels
- **WHEN** the user marks 10 cells completed and reloads the browser page
- **THEN** those exact 10 cells SHALL remain marked completed and desaturated upon reload

#### Scenario: Legacy progress is adopted once
- **WHEN** a legacy `rgb-pencil:v1:<hash>` key matches a newly created project's source hash
- **THEN** its in-range cells SHALL seed the project and the legacy key SHALL be removed
