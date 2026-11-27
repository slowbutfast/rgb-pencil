# Surgical Patch Handoff: OpenSpec Change 'project-persistence' [PATCH-06]

## 1. Executive Objective & Diagnostic Feedback
- **Change Name**: `project-persistence`
- **Patch ID**: PATCH-06
- **Branch**: `feat/multi-20261126-2351` (PR #1, https://github.com/slowbutfast/rgb-pencil/pull/1). Work on this branch only. Do NOT create commits, push, or switch branches; leave changes uncommitted for the user to commit.
- **Objective**: Resolve the PR #1 review findings: fix persistence spec drift, guard PNG decode on import, detect lock loss without relying on BroadcastChannel, stop no-op autosave writes, stop read-only tabs reporting `Saved`, and constrain imported `sourceHash`.
- **Feedback & Diagnostic Trace** (verbatim from the review):
  ```
  Important 1. openspec/specs/interactive-pixel-grid/spec.md:61-62: the requirement
    "Local persistence of completed cell progress" still says `localStorage` keyed by a
    fingerprint. The code now uses IndexedDB projects (localStorage read once for migration).
  Important 2. src/store/imageCodec.ts:133-141 and src/store/projectFile.ts:270-284: import
    calls codec.decode(png) before comparing the PNG's real dimensions to the cap. A small,
    highly compressible PNG declaring e.g. 30000x30000 passes the 8 MB limit and
    createImageBitmap/canvas try to allocate gigabytes.
  Important 3. src/store/projectLock.ts:160-179 and :184-194: the previous owner only learns it
    lost the lock from the `lock-taken` BroadcastChannel message. When steal:true is granted the
    browser rejects the original locks.request promise with AbortError, but the handler at
    line 174 only calls decided.resolve(false), which is already resolved. If the channel is
    null or the message is lost the old tab stays writable (two writers).
  Nit. src/store/autosave.ts:114-122: flush() forces dirty = true, so every tab-hide/pagehide
    writes the full record even if nothing changed; that bumps updatedAt (reorders the
    newest-first list; false "Reload project" banners in the no-Web-Locks fallback).
  Nit. src/store/gridStore.ts:569-577: a read-only tab's save returns { ok: true }, so status
    reads "Saved" when nothing was written.
  Nit. src/store/projectFile.ts:229: sourceHash accepted as any string; cap to 8 hex chars.
  ```
- **Root Cause Analysis**:
  1. The persistence change superseded an earlier requirement in prose only and shipped no MODIFIED delta, so the synced main spec kept the old wording.
  2. Import validates the *claimed* dimensions but never ties them to the PNG header before the expensive decode.
  3. Ownership loss is modelled as a channel event only; the Web Locks abort is ignored.
  4. `flush(force)` ignores `force` and always dirties state.
  5. The skipped-save path reuses the success outcome.
  6. No format constraint on a stored and indexed field.

## 2. Strict Target Context Map
| File Path (relative to repo root) | Target Lines | Modification Summary |
|---|---|---|
| `openspec/changes/project-persistence/specs/interactive-pixel-grid/spec.md` | `[NEW]` | `## MODIFIED Requirements` delta containing the FULL updated block for "Local persistence of completed cell progress" (header must match exactly) |
| `openspec/specs/interactive-pixel-grid/spec.md` | `L61-L66` | Replace that requirement's text with the identical updated block |
| `src/store/projectFile.ts` | `L229-L231` | `sourceHash` must match `/^[0-9a-f]{1,8}$/` |
| `src/store/projectFile.ts` | `L262-L284` | Before `codec.decode`, verify PNG signature and read IHDR width/height (bytes 16-23, big-endian); require equality with declared `bitmap.width/height` and `<= MAX_BITMAP_EDGE`; reject with existing-style messages. Add a small local helper in this file; do not change `imageCodec.ts` |
| `src/store/projectLock.ts` | `L155-L195` | Handle rejection of the granted `locks.request` (post-grant `AbortError`): set `readOnly = true`, clear `activeHold`, call `onLost` at most once (shared once-guard with the `lock-taken` handler). Keep `ifAvailable`-denial path and PATCH-05 steal semantics unchanged |
| `src/store/autosave.ts` | `L1-L8`, `L68-L82`, `L114-L122` | Add `skipped?: boolean` to `SaveOutcome`; `write()` leaves status unchanged when `skipped`; `flush(force = false)` returns without writing when `!force && !dirty && !running` (if running, return the in-flight chain); remove the redundant `dirty = true` lines |
| `src/store/gridStore.ts` | `L569-L577` | In `persistCurrent`, return `{ ok: true, skipped: true }` ONLY for the `state.readOnly` case; other skip conditions keep `{ ok: true }` |
| `src/store/__tests__/projectFile.test.ts` | new cases | IHDR and `sourceHash` regression tests (see Section 5) |
| `src/store/__tests__/projectLock.test.ts` | new cases | Steal without channel; once-only `onLost` |
| `src/store/__tests__/autosave.test.ts` | new cases | Clean-flush no-op; pending flush; `flush(true)` forces |
| `src/store/__tests__/projectLifecycle.test.ts` | new case | Read-only store flush leaves status unchanged and writes nothing |
| `openspec/changes/project-persistence/{tasks.md,patch.md,verification.md}` | append/update | Tick P06 tasks; mark PATCH-06 `APPLIED` with proof; add a short PATCH-06 note to `verification.md` |

**Required replacement text for the spec requirement** (use verbatim in both spec files):
```
### Requirement: Local persistence of completed cell progress
Completed cell progress SHALL persist across page reloads and browser restarts as part of the open project in the project store (IndexedDB), together with the project's image and settings, so reloading the page restores drawing progress automatically. Legacy `localStorage` progress written by earlier versions under `rgb-pencil:v1:<hash>` SHALL only be read once to seed a new project and then removed; it SHALL NOT be written.

#### Scenario: Page reload restores completed pixels
- **WHEN** the user marks 10 cells completed and reloads the browser page
- **THEN** those exact 10 cells SHALL remain marked completed and desaturated upon reload

#### Scenario: Legacy progress is adopted once
- **WHEN** a legacy `rgb-pencil:v1:<hash>` key matches a newly created project's source hash
- **THEN** its in-range cells SHALL seed the project and the legacy key SHALL be removed
```

## 3. Blast Radius & Invariant Guardrails
- **STRICT BLAST RADIUS**: Modify ONLY the files and line ranges in the Target Context Map.
- **FORBIDDEN**:
  - Do NOT refactor or split `gridStore.ts` (its size is a known, out-of-scope follow-up).
  - Do NOT touch `imageCodec.ts`, the worker, PDF, or UI modules.
  - Do NOT modify `.env`/credential files, `playgrounds/*`, or other changes' artifacts.
  - Do NOT add dependencies.
  - Do NOT modify existing passing tests unless an assertion is demonstrably tied to the old always-write `flush()` behaviour; if so, change only that assertion, and record exactly which test and why in `patch.md`.
- **INVARIANTS TO PRESERVE**:
  - All 210 existing tests pass (18 files); `npm run build` stays clean with the worker emitted as a separate chunk.
  - PATCH-05 behaviour: a delayed `{steal:true}` grant is awaited, the stolen hold stays pending, and a third opener stays read-only.
  - `flush(true)` (used by `saveBeforeSwitch`, `flushNow`, deletion paths) still always writes.
  - Lock-loss still flushes pending data before going read-only (the `onLost` flush-then-read-only order in `gridStore.acquireForProject`).
  - Existing import rejection messages for other failures are unchanged.

## 4. Visual & UI Impact
- Status: Non-visual patch. No styling or layout modifications permitted. The only user-visible effect is the save-status caption no longer changing to `Saved` in a read-only tab.

## 5. Reproduction & Verification Protocol
1. **Write the reproducing tests first**, then run them and confirm they fail for the reasons in Section 1:
   ```bash
   npm test -- src/store/__tests__/projectFile.test.ts -t "IHDR|sourceHash"
   npm test -- src/store/__tests__/projectLock.test.ts -t "revoked|onLost"
   npm test -- src/store/__tests__/autosave.test.ts -t "nothing is dirty|force"
   npm test -- src/store/__tests__/projectLifecycle.test.ts -t "read-only"
   ```
   Required test cases (name them so the `-t` patterns above match):
   - **projectFile**: "rejects a PNG whose IHDR declares dimensions beyond the cap without decoding" (inject a codec whose `decode` throws if called; PNG bytes = valid signature + IHDR with e.g. 30000x30000); "rejects an IHDR that disagrees with the declared bitmap size"; "rejects a non-PNG signature"; "sourceHash must be 1-8 hex characters" (reject `""`, `"zz"`, 9 chars; accept 8 hex).
   - **projectLock**: "goes read-only and calls onLost when a steal revoked the lock with no channel" (`channel: null`); "calls onLost exactly once when abort and lock-taken both arrive".
   - **autosave**: "does not write on visibility or pagehide when nothing is dirty"; "flushes a pending change on pagehide exactly once"; "flush(true) forces a write when clean".
   - **projectLifecycle**: "read-only flush leaves saveStatus unchanged and writes nothing".
2. **Apply Minimal Fix** in the mapped files only.
3. **Verify Fix**: re-run the four commands above; all new tests pass.
4. **Full Regression Suite** (documented host override for `safe-test`'s virtual-memory cap):
   ```bash
   SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm test -- --maxWorkers=1
   SAFE_TEST_MAX_MEM_KB=67108864 safe-test npm run build
   openspec validate project-persistence --strict
   ```
   Expect the prior 210 tests plus the new cases to pass, a clean build, and a valid change.
5. **Documentation**: set PATCH-06 `Status: APPLIED` in `patch.md` with the verbatim passing counts; append a short PATCH-06 section to `verification.md`; tick P06.1-P06.7 in `tasks.md`.

## 6. Surgical Patch Checklist
- [ ] P06.1 Run reproducing tests (Section 5, step 1) and confirm they fail.
- [ ] P06.2 Implement the IHDR guard and `sourceHash` check in `src/store/projectFile.ts` (L229-L231, L262-L284).
- [ ] P06.3 Handle post-grant `AbortError` in `src/store/projectLock.ts` (L155-L195), `onLost` exactly once.
- [ ] P06.4 Honour `force` in `src/store/autosave.ts` and add the `skipped` outcome (`autosave.ts` L1-L8, L68-L82, L114-L122; `gridStore.ts` L569-L577).
- [ ] P06.5 Add the MODIFIED delta spec and apply identical text to `openspec/specs/interactive-pixel-grid/spec.md` (L61-L66).
- [ ] P06.6 Re-run reproducing tests (PASS), then the full suite, build, and `openspec validate project-persistence --strict`.
- [ ] P06.7 Update `tasks.md` (`- [x]`), `patch.md` (PATCH-06 `APPLIED` with proof), and `verification.md`.
