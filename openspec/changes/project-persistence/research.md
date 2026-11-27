## Source material

### 2026-11-26 — State save gap (User)
> "one necessary feature you haven't touched on is state save. what situations have you considering in which a user stops half way through, and wants to save their progress.?"

Analysis returned to the user (this session) found that `design-language-and-ui-ux` persists only `completedCells` in localStorage keyed by `sourceHash`, with no image, no settings, and no project list. Situations identified: (1) close and reopen loses the image, (2) settings reset so the grid no longer matches the paper, (3) several drawings, (4) moving device or browser, (5) cleared or blocked storage with no warning, (6) two tabs open, (7) contrast/palette/dither changed mid-project.

### 2026-11-26 — Scope decision (User, via question dialog)
> Save scope: **"Full (A + B)"**, i.e. auto-resumed project, autosave, settings lock, storage warning, file export/import, multi-project list, multi-tab guard.
> Mid-drawing edits: **"Lock width + palette, allow contrast/dither with warning (Recommended)"**.

### 2026-11-26 — Direction for artifacts (User)
> "ff the artifacts for this change, or multiple openspec changes if you find that cleaner. focus on everything aside from design language and ui/ux since we've defined that separately."

Resolution: split into two changes. `worker-pipeline-and-pdf-export` owns the worker, guide builder, PDF, touch contract. This change, `project-persistence`, owns saving and resuming.

### Prior change (read from disk 2026-11-26)
`design-language-and-ui-ux/architecture.md` Decision 4: progress stored as `"col,row"` strings under `rgb-pencil:v1:<hash>` in localStorage; the image is deliberately not stored ("easily exceeds quota on phone camera photos"). That rationale applied to full-size photos. It does not apply to the `<= 512` px working bitmap introduced by `worker-pipeline-and-pdf-export`.

### Raised but not acted on

- **Cloud sync / accounts**: Out of scope; project is 100% client-side. The export file is the cross-device route.
- **Undo history / time-travel of completed cells**: Re-click undo already exists; a full history log adds storage and UI with no stated need.
- **Auto-saving a PDF with progress**: The PDF stays a fresh guide (see worker change non-goals).
- **Merging two tabs' completed sets automatically**: A union merge resurrects cells the user deliberately undid. Rejected in favour of an ownership lock plus a conflict banner.
- **Server-side backups**: Violates the zero-backend constraint.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| Project | One saved drawing: working bitmap, settings, completed cells, timestamps, identity | An OpenSpec change, or the source code project |
| Working bitmap | The `<= 512` px longest-edge RGBA image created at load by `prepareWorkingBitmap` (owned by `worker-pipeline-and-pdf-export`) | The original uploaded photo, which is never stored |
| Resume | Opening the most recently opened project automatically on app start | Restoring unsaved in-memory edits after a crash mid-write |
| Geometry lock | Disabling grid width and palette changes once `doneCount > 0` | Locking contrast or dither (those stay editable behind a warning) |
| Completed bitset | Completed cells packed as a bit array of length `ceil(cols × rows / 8)` bytes, bit index `row * cols + col` | The runtime `Set<string>` of `"col,row"` keys used by the store |
| `sourceHash` | 32-bit FNV-1a over pre-contrast downsampled RGB + `cols` + `rows` (from `worker-pipeline-and-pdf-export`) | A unique project id; two projects can share one hash |
| Project id | Random UUID assigned at project creation; the primary key everywhere | `sourceHash` |
| Pipeline version | Integer constant bumped when matching/dithering output for the same inputs changes | The app or package version |
| Ownership lock | A Web Lock named `rgb-pencil:project:<id>` held by the tab that has the project open for writing | A database row lock |
| Read-only mode | Project opened for viewing/inspection while another tab owns it; completion toggles, resets, and setting changes disabled | A permissions system |
| Project file | A `.rgbpencil.json` export containing everything needed to recreate a project | A PDF or a localStorage dump |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| MDN: IndexedDB API; `IDBTransaction` durability | Async structured-clone key/value store; `Blob` values supported; typical quota is a large fraction of disk, far above localStorage's ~5MB | CC-BY-SA | 2026-11-26 |
| MDN: Web Locks API (`navigator.locks.request`, `ifAvailable`) | Origin-scoped named locks released automatically when the holding tab closes | CC-BY-SA | 2026-11-26 |
| MDN: `StorageManager.persist()` / `estimate()` | Request persistent storage; read usage and quota | CC-BY-SA | 2026-11-26 |
| MDN: `pagehide` and `visibilitychange` | Reliable last-chance hooks for flushing state on mobile and desktop | CC-BY-SA | 2026-11-26 |
| `fake-indexeddb` on npm | Version `6.2.8`, Apache-2.0; IndexedDB implementation for Node tests | Apache-2.0 | 2026-11-26 |
| `idb` on npm | Version `8.0.4`, ISC; promise wrapper for IndexedDB | ISC | 2026-11-26 |

Failed lookups: none. Browser eviction policies (Safari) not looked up; see Unverified assumptions.

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| IndexedDB (raw, thin in-house wrapper) | Adopted | Stores Blobs and structured records beyond localStorage's quota; no dependency beyond a ~60-line promise helper | 2026-11-26 |
| `idb` (promise wrapper) | Rejected for now | ISC, small, but the surface used is three stores with get/put/delete/getAll; a local helper avoids a dependency. Revisit if the helper grows | 2026-11-26 |
| localStorage for the whole project | Rejected | ~5MB limit shared with everything; synchronous; a 400KB bitmap as base64 across many projects exhausts it | 2026-11-26 |
| localStorage for legacy progress only | Kept read-only | Needed once to migrate `rgb-pencil:v1:<hash>` keys written by the first change | 2026-11-26 |
| `fake-indexeddb` for tests | Adopted | Runs the real storage code in Vitest/Node without a browser | 2026-11-26 |
| Web Locks API for tab ownership | Adopted | Lock is released automatically on tab close or crash, so no stale-heartbeat logic | 2026-11-26 |
| `BroadcastChannel` heartbeat claims | Rejected as primary | Needs timeouts and crash detection; kept only as the fallback where Web Locks is missing | 2026-11-26 |
| Union-merge of completed sets across tabs | Rejected | Resurrects cells the user undid | 2026-11-26 |
| JPEG for the stored bitmap | Rejected | Lossy; re-decoding changes pixel bytes and therefore `sourceHash` and matched states | 2026-11-26 |
| PNG for the stored bitmap | Adopted | Lossless, so restore is bit-exact; a 512 px photo-like PNG is a few hundred KB | 2026-11-26 |

## Patterns adopted

- **Separate blob store**: Keep image Blobs in their own object store keyed by project id, so listing projects reads small records only. Lands in `src/store/projectDb.ts`.
- **Pack at the boundary**: The store keeps `Set<string>` at runtime; encode to a bitset only when writing or exporting. Lands in `src/store/completedCodec.ts`.
- **Debounced autosave plus lifecycle flush**: Write 500 ms after the last change; also flush on `visibilitychange` (hidden) and `pagehide`. Lands in `src/store/autosave.ts`.
- **Validate untrusted files structurally**: Parse JSON, check types, ranges, and lengths before touching storage; never `eval`. Lands in `src/store/projectFile.ts`.
- **Import never overwrites**: Imported projects always get a new id. Lands in `src/store/projectFile.ts`.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| `fake-indexeddb` version and licence | `6.2.8`, Apache-2.0 | `npm view fake-indexeddb version license` | 2026-11-26 | decays |
| `idb` version and licence | `8.0.4`, ISC | `npm view idb version license` | 2026-11-26 | decays |
| Prior change stores progress only, as `"col,row"` strings under `rgb-pencil:v1:<hash>` | Yes | Read `design-language-and-ui-ux/architecture.md` Decision 4 | 2026-11-26 | stable |
| Completed bitset size for max square-ish grid `96 × 72` | `ceil(6912 / 8) = 864` bytes | Arithmetic | 2026-11-26 | stable |
| Completed bitset for default `56 × 42` | `ceil(2352 / 8) = 294` bytes | Arithmetic | 2026-11-26 | stable |
| Working bitmap raw size at `512 × 384` RGBA | `786,432` bytes (about 0.79 MB) before PNG | Arithmetic | 2026-11-26 | stable |
| Companion change defines `WorkingBitmap` and `sourceHash` | Yes | Read `worker-pipeline-and-pdf-export/architecture.md` Decisions 3 and 5 | 2026-11-26 | stable |

## Unverified assumptions

- **Safari/WebKit storage eviction**: Believed that script-writable storage (IndexedDB, localStorage) can be cleared after a period of site inactivity unless the site is installed, which is why the file backup matters. Checking cost: one search of WebKit's tracking-prevention documentation; not done.
- **PNG size**: Assumed a `512 × 384` photographic PNG is roughly 300 to 600 KB. Checking cost: encode a sample image and measure; add to `tests.md` as a soft assertion.
- **`pagehide` IndexedDB commits**: Assumed a transaction started in `pagehide` normally completes but is not guaranteed. Mitigated by the 500 ms debounce bound; not measurable in CI.
- **Web Locks availability**: Assumed present in all current evergreen browsers; fallback exists regardless.
- **Quota**: Assumed `estimate()` quota comfortably exceeds 20 projects at ~0.5 MB each on desktop and mobile. Checking cost: read `estimate()` on a real phone.

## Superseded claims

- **"Store the working bitmap as JPEG (~50–100 KB)"** (plan sketch in this session, 2026-11-26): wrong because JPEG is lossy; re-decoding alters pixel bytes, which changes `sourceHash` and can alter matched states under cells already drawn. Replaced by lossless PNG.
- **"Progress is keyed by `sourceHash`"** (`design-language-and-ui-ux`): remains true for the legacy key and for same-image detection, but the primary key is now the project id, since two drawings of one image (different settings) must coexist.

## Links out

- [Worker and PDF change](../worker-pipeline-and-pdf-export/architecture.md): defines `WorkingBitmap`, `MatchedGrid`, `sourceHash`.
- [Design Language & UI/UX change](../design-language-and-ui-ux/architecture.md): current store and persistence it replaces.
