import { PIPELINE_VERSION } from '../engine/pipeline';
import { prepareWorkingBitmap } from '../engine/workingBitmap';
import {
  DEFAULT_EXPORT_OPTIONS,
  DEFAULT_SETTINGS,
  MAX_COLS,
  MAX_CONTRAST,
  MAX_TEMPLATE_MM,
  MIN_COLS,
  MIN_CONTRAST,
  MIN_TEMPLATE_MM,
  cellKey,
  parseCellKey,
  type CellCoord,
  type EngineClient,
  type ExportOptions,
  type MatchedGrid,
  type PaletteKey,
  type PipelineSettings,
  type PipelineStatus,
  type PointerType,
  type SourceImage,
  type ViewMode,
  type WorkingBitmap,
} from '../types/pipeline';
import { createAutosave, type SaveOutcome, type SaveStatus } from './autosave';
import { decodeCompleted } from './completedCodec';
import { createBrowserPngCodec, type PngCodec } from './imageCodec';
import { adoptLegacyCompleted, type StorageLike } from './legacyMigration';
import {
  createProjectRecord,
  fromStoredSettings,
  projectNameFromFilename,
  sanitizeName,
  uniqueProjectName,
  FALLBACK_PROJECT_NAME,
  type CreateProjectInput,
} from './projectManager';
import {
  openProjectDatabase,
  type ProjectDatabase,
  type ProjectImageRecord,
  type ProjectRecord,
  type ProjectSummary,
  type WriteResult,
} from './projectDb';
import {
  buildProjectFile,
  parseProjectFile,
  projectFileName,
  serializeProjectFile,
  shouldShowBackupNudge,
} from './projectFile';
import {
  acquireProjectLock,
  createProjectChannel,
  type LockManagerLike,
  type ProjectChannel,
  type ProjectLockHandle,
} from './projectLock';

export type { StorageLike } from './legacyMigration';

export type ActionResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'locked' | 'confirm-required' | 'read-only' | 'no-project' | 'error';
      message?: string;
    };

export type BannerId =
  | 'read-only'
  | 'memory-only'
  | 'backup'
  | 'pipeline-version'
  | 'reload'
  | 'notice'
  | 'save-error';

export interface GridBanner {
  id: BannerId;
  text: string;
}

export interface SameImageOffer {
  sourceHash: string;
  cols: number;
  existingProjectId: string;
  existingProjectName: string;
}

export interface GridStoreOptions {
  client: EngineClient;
  /** Legacy localStorage surface, read and removed once. Never written. */
  storage?: StorageLike | null;
  /** `null` forces memory-only; `undefined` opens IndexedDB lazily. */
  db?: ProjectDatabase | null;
  dbFactory?: IDBFactory | null;
  codec?: PngCodec;
  /** `undefined` uses `navigator.locks`; `null` forces the fallback path. */
  locks?: LockManagerLike | null;
  channel?: ProjectChannel | null;
  debounceMs?: number;
  now?: () => number;
  randomId?: () => string;
  sampleImage?: () => SourceImage | null;
  persistStorage?: () => Promise<boolean> | null;
}

export interface GridStoreState {
  settings: PipelineSettings;
  grid: MatchedGrid | null;
  viewMode: ViewMode;
  hoveredCell: CellCoord | null;
  completedCells: ReadonlySet<string>;
  status: PipelineStatus;
  error: string | null;
  latestJobId: number;
  lastPointerType: PointerType;
  exportOptions: ExportOptions;
  saveStatus: SaveStatus;
  saveError: string | null;
  memoryOnly: boolean;
  readOnly: boolean;
  projectId: string | null;
  projectName: string | null;
  projects: ProjectSummary[];
  banners: GridBanner[];
  sameImageOffer: SameImageOffer | null;
}

export interface LoadImageOptions {
  /** Uploaded file name; becomes the default project name. */
  name?: string;
}

export interface GridStore {
  getState(): GridStoreState;
  subscribe(listener: (state: GridStoreState) => void): () => void;
  resumeLastProject(): Promise<boolean>;
  loadImage(image: SourceImage, options?: LoadImageOptions): Promise<void>;
  resolveSameImage(choice: 'resume' | 'copy'): Promise<ActionResult>;
  openProject(id: string): Promise<ActionResult>;
  renameProject(id: string, name: string): Promise<ActionResult>;
  deleteProject(id: string): Promise<ActionResult>;
  startNewDrawingFromImage(): Promise<ActionResult>;
  exportProject(): Promise<
    { ok: true; filename: string; text: string } | { ok: false; message: string }
  >;
  importProject(file: { size: number; text(): Promise<string> }): Promise<ActionResult>;
  refreshProjects(): Promise<void>;
  dismissBanner(id: BannerId): void;
  takeOver(): Promise<void>;
  reloadProject(): Promise<void>;
  flushNow(): Promise<void>;
  dispose(): void;
  setCols(cols: number): Promise<ActionResult>;
  setContrast(contrast: number, options?: { confirmed?: boolean }): Promise<ActionResult>;
  setPalette(palette: PaletteKey): Promise<ActionResult>;
  setDither(dither: boolean, options?: { confirmed?: boolean }): Promise<ActionResult>;
  setViewMode(mode: ViewMode): void;
  setHovered(cell: CellCoord | null): void;
  setLastPointerType(type: PointerType): void;
  setExportOptions(patch: Partial<ExportOptions>): void;
  toggleCell(col: number, row: number): void;
  paintCell(col: number, row: number, done: boolean): void;
  resetCompleted(): void;
}

function browserStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function isInside(grid: MatchedGrid, coord: CellCoord): boolean {
  return coord.col >= 0 && coord.col < grid.cols && coord.row >= 0 && coord.row < grid.rows;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const BACKUP_SUGGESTION = 'Delete a project or export a backup.';

/** Append the recovery advice once, even if the DB message already has it. */
function withBackupSuggestion(message: string): string {
  return /delete a project or export a backup/i.test(message)
    ? message
    : `${message} ${BACKUP_SUGGESTION}`;
}

function defaultRandomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const READ_ONLY_BANNER =
  'This project is open in another tab. Viewing only — changes are disabled.';
const MEMORY_ONLY_BANNER =
  'Storage is unavailable. Progress will not be saved — export a backup.';
const BACKUP_BANNER =
  'Working on a long drawing? Export a backup so a cleared browser does not lose it.';
const PIPELINE_BANNER =
  'This project was started with a different matching version; colours may differ slightly.';
const RELOAD_BANNER = 'This project was changed in another tab. Reload to see the latest.';

function backupMetaKey(projectId: string): string {
  return `backup-suppressed:${projectId}`;
}

/** Framework-free observable store for grid state, projects, and persistence. */
export function createGridStore(options: GridStoreOptions): GridStore {
  const client = options.client;
  const legacyStorage = options.storage === undefined ? browserStorage() : options.storage;
  const codec = options.codec ?? createBrowserPngCodec();
  const channel =
    options.channel === undefined ? createProjectChannel() : options.channel;
  const now = options.now ?? (() => Date.now());
  const randomId = options.randomId ?? defaultRandomId;
  const dbOption = options.db;

  const listeners = new Set<(state: GridStoreState) => void>();
  let source: WorkingBitmap | null = null;
  let jobToken = 0;

  let projectId: string | null = null;
  let projectName: string | null = null;
  let pendingName: string | null = null;
  let projectCreatedAt: number | null = null;
  let loadedUpdatedAt: number | null = null;
  let exported = false;
  let backupSuppressed = false;
  let pipelineMismatch = false;
  let reloadPrompt = false;
  let noticeText: string | null = null;
  let lockHandle: ProjectLockHandle | null = null;
  let ensurePromise: Promise<boolean> | null = null;
  let mutationChain: Promise<void> = Promise.resolve();
  let openedDbPromise: Promise<ProjectDatabase | null> | null = null;

  const suppressedProjectIds = new Set<string>();
  const dismissedSession = new Set<BannerId>();
  let dismissedProject = new Set<BannerId>();

  let state: GridStoreState = {
    settings: { ...DEFAULT_SETTINGS },
    grid: null,
    viewMode: 'grid',
    hoveredCell: null,
    completedCells: new Set<string>(),
    status: 'idle',
    error: null,
    latestJobId: 0,
    lastPointerType: 'mouse',
    exportOptions: { ...DEFAULT_EXPORT_OPTIONS },
    saveStatus: 'idle',
    saveError: null,
    memoryOnly: false,
    readOnly: false,
    projectId: null,
    projectName: null,
    projects: [],
    banners: [],
    sameImageOffer: null,
  };

  function isDismissed(id: BannerId): boolean {
    return dismissedSession.has(id) || dismissedProject.has(id);
  }

  function computeBanners(): GridBanner[] {
    const banners: GridBanner[] = [];
    if (state.readOnly && !isDismissed('read-only')) {
      banners.push({ id: 'read-only', text: READ_ONLY_BANNER });
    }
    if (state.memoryOnly && !isDismissed('memory-only')) {
      banners.push({ id: 'memory-only', text: MEMORY_ONLY_BANNER });
    }
    if (
      shouldShowBackupNudge(
        state.completedCells.size,
        exported,
        isDismissed('backup') || backupSuppressed,
      )
    ) {
      banners.push({ id: 'backup', text: BACKUP_BANNER });
    }
    if (pipelineMismatch && !isDismissed('pipeline-version')) {
      banners.push({ id: 'pipeline-version', text: PIPELINE_BANNER });
    }
    if (reloadPrompt && !isDismissed('reload')) {
      banners.push({ id: 'reload', text: RELOAD_BANNER });
    }
    if (noticeText && !isDismissed('notice')) {
      banners.push({ id: 'notice', text: noticeText });
    }
    if (state.saveStatus === 'error' && state.saveError && !isDismissed('save-error')) {
      banners.push({ id: 'save-error', text: state.saveError });
    }
    return banners;
  }

  function emit(): void {
    for (const listener of listeners) listener(state);
  }

  function commit(patch: Partial<GridStoreState>): void {
    // A fresh save failure re-arms its dismissible banner.
    if (patch.saveStatus === 'error') dismissedProject.delete('save-error');
    state = { ...state, ...patch };
    state = { ...state, banners: computeBanners() };
    emit();
  }

  function setNotice(text: string): void {
    noticeText = text;
    dismissedProject.delete('notice');
    commit({});
  }

  async function getDb(): Promise<ProjectDatabase | null> {
    if (dbOption === null) {
      if (!state.memoryOnly) commit({ memoryOnly: true, saveStatus: 'memory-only' });
      return null;
    }
    if (dbOption) return dbOption;
    if (!openedDbPromise) {
      openedDbPromise = openProjectDatabase({
        factory: options.dbFactory,
        persistStorage: options.persistStorage,
      }).then((result) => (result.ok ? result.db : null));
    }
    const db = await openedDbPromise;
    if (!db && !state.memoryOnly) {
      commit({ memoryOnly: true, saveStatus: 'memory-only' });
    }
    return db;
  }

  const autosave = createAutosave({
    save: persistCurrent,
    onStatus: (status, error) => commit({ saveStatus: status, saveError: error }),
    debounceMs: options.debounceMs,
  });

  function sanitizeCompleted(candidates: Iterable<string>, grid: MatchedGrid | null): Set<string> {
    const next = new Set<string>();
    if (!grid) return next;
    for (const key of candidates) {
      const coord = parseCellKey(key);
      if (coord && isInside(grid, coord)) next.add(cellKey(coord.col, coord.row));
    }
    return next;
  }

  function resetProjectFlags(): void {
    projectId = null;
    projectName = null;
    projectCreatedAt = null;
    loadedUpdatedAt = null;
    exported = false;
    backupSuppressed = false;
    pipelineMismatch = false;
    reloadPrompt = false;
    noticeText = null;
    dismissedProject = new Set<BannerId>();
  }

  function releaseLock(): void {
    lockHandle?.release();
    lockHandle = null;
  }

  async function acquireForProject(id: string): Promise<ProjectLockHandle> {
    return acquireProjectLock(id, {
      locks: options.locks,
      channel,
      onLost: async () => {
        // Flush while this tab still believes it is writable, then go read-only.
        await saveBeforeSwitch();
        commit({ readOnly: true });
      },
    });
  }

  async function recompute(): Promise<boolean> {
    if (!source) return false;
    const token = ++jobToken;
    commit({ status: 'pending', latestJobId: token, error: null });
    try {
      const result = await client.process({ image: source, settings: { ...state.settings } });
      if (token !== jobToken || !source) return false;
      const grid = result.grid;
      const completed = sanitizeCompleted(state.completedCells, grid);
      commit({ grid, completedCells: completed, status: 'idle', error: null });
      return true;
    } catch (error) {
      if (token !== jobToken) return false;
      commit({ status: 'error', error: errorMessage(error) });
      return false;
    }
  }

  async function updateSettings(patch: Partial<PipelineSettings>): Promise<void> {
    commit({ settings: { ...state.settings, ...patch } });
    await recompute();
  }

  function recordFromState(completed: ReadonlySet<string>, settings: PipelineSettings): ProjectRecord {
    const input: CreateProjectInput = {
      id: projectId ?? randomId(),
      name: projectName ?? pendingName ?? FALLBACK_PROJECT_NAME,
      now: now(),
      createdAt: projectCreatedAt ?? undefined,
      pipelineVersion: PIPELINE_VERSION,
      sourceHash: state.grid?.sourceHash ?? '',
      cols: state.grid?.cols ?? settings.cols,
      rows: state.grid?.rows ?? 1,
      settings,
      completed,
    };
    return createProjectRecord(input);
  }

  async function imageRecordFor(id: string): Promise<ProjectImageRecord | null> {
    if (!source) return null;
    const png = await codec.encode(source);
    let thumb = png;
    try {
      thumb = await codec.thumbnail(source);
    } catch {
      thumb = png;
    }
    return { projectId: id, width: source.width, height: source.height, png, thumb };
  }

  function handleWriteFailure(result: WriteResult): void {
    if (result.ok) return;
    if (result.conflict) {
      reloadPrompt = true;
      dismissedProject.delete('reload');
    } else if (result.newerSchema) {
      setNotice('This project was saved by a newer version of the app and was not modified.');
    } else {
      commit({
        saveStatus: 'error',
        saveError: withBackupSuggestion(result.message),
      });
    }
    commit({});
  }

  async function ensureProject(): Promise<boolean> {
    if (projectId) return true;
    if (state.readOnly || state.sameImageOffer) return false;
    if (!source || !state.grid) return false;
    if (ensurePromise) return ensurePromise;

    ensurePromise = (async () => {
      try {
        const db = await getDb();
        const id = randomId();
        const name = uniqueProjectName(
          pendingName ?? FALLBACK_PROJECT_NAME,
          state.projects.map((project) => project.name),
        );
        // Encode the image before snapshotting cells. Creation can take a few
        // hundred milliseconds; any cells toggled in the meantime must be in
        // the first persisted record and must never be clobbered by the commit.
        let image: ProjectImageRecord | null = null;
        if (db) {
          image = await imageRecordFor(id);
          if (!image) return false;
        }

        const grid = state.grid;
        if (!grid) return false;
        // Adopt legacy progress against the grid as it is after the async work.
        const adopted = adoptLegacyCompleted(
          legacyStorage,
          grid.sourceHash,
          grid.cols,
          grid.rows,
        );
        const latest = new Set(state.completedCells);
        for (const key of adopted) latest.add(key);
        const record = createProjectRecord({
          id,
          name,
          now: now(),
          pipelineVersion: PIPELINE_VERSION,
          sourceHash: grid.sourceHash,
          cols: grid.cols,
          rows: grid.rows,
          settings: state.settings,
          completed: latest,
        });

        if (db && image) {
          const result = await db.putWithImage(record, image);
          if (!result.ok) {
            handleWriteFailure(result);
            return false;
          }
          await db.setLastOpenedId(id);
          channel?.post({ type: 'list-changed' });
        }

        lockHandle = await acquireForProject(id);
        backupSuppressed = db ? (await db.getMeta(backupMetaKey(id))) === '1' : false;
        projectId = id;
        projectName = name;
        projectCreatedAt = record.createdAt;
        loadedUpdatedAt = db ? record.updatedAt : null;
        exported = false;
        // More toggles may have landed while the write/lock were in flight;
        // commit the state as it is now, unioned with adopted legacy cells.
        const committed = new Set(state.completedCells);
        for (const key of adopted) committed.add(key);
        commit({
          projectId: id,
          projectName: name,
          completedCells: committed,
          readOnly: lockHandle.readOnly,
          memoryOnly: !db,
          saveStatus: db ? 'saving' : 'memory-only',
          sameImageOffer: null,
        });
        await refreshProjects();
        return true;
      } catch (error) {
        commit({ saveStatus: 'error', saveError: errorMessage(error) });
        return false;
      } finally {
        ensurePromise = null;
      }
    })();
    return ensurePromise;
  }

  function afterMutation(): void {
    if (state.readOnly || state.sameImageOffer) return;
    mutationChain = mutationChain
      .then(async () => {
        if (state.readOnly || state.sameImageOffer) return;
        const ready = await ensureProject();
        if (ready && projectId) autosave.schedule();
      })
      .catch((error) => {
        commit({ saveStatus: 'error', saveError: errorMessage(error) });
      });
  }

  async function persistCurrent(): Promise<SaveOutcome> {
    const db = await getDb();
    if (!db) {
      return { ok: true, memoryOnly: true };
    }
    if (
      state.readOnly ||
      !projectId ||
      suppressedProjectIds.has(projectId) ||
      !state.grid ||
      !source
    ) {
      return { ok: true };
    }

    const record = recordFromState(state.completedCells, state.settings);
    const result = await db.put(record, {
      expectedUpdatedAt: loadedUpdatedAt ?? undefined,
    });
    if (!result.ok) {
      handleWriteFailure(result);
      return {
        ok: false,
        message: withBackupSuggestion(result.message),
      };
    }
    loadedUpdatedAt = record.updatedAt;
    projectCreatedAt = record.createdAt;
    if (state.memoryOnly) commit({ memoryOnly: false });
    return { ok: true };
  }

  async function applyLoadedProject(id: string, keepLock: boolean): Promise<boolean> {
    const db = await getDb();
    if (!db) return false;
    const loaded = await db.get(id);
    if (!loaded.ok) {
      if (loaded.reason === 'newer-schema') {
        setNotice(
          'This project was saved by a newer version of the app and cannot be opened here.',
        );
      }
      return false;
    }
    const image = await db.getImage(id);
    if (!image) {
      setNotice('This project image could not be found.');
      return false;
    }

    let bitmap: WorkingBitmap;
    try {
      bitmap = await codec.decode(image.png);
    } catch {
      setNotice('This project image could not be decoded.');
      return false;
    }

    if (!keepLock) {
      releaseLock();
      lockHandle = await acquireForProject(id);
    }

    source = prepareWorkingBitmap(bitmap);
    jobToken += 1;
    client.invalidate?.();
    resetProjectFlags();
    projectId = id;
    projectName = loaded.project.name;
    projectCreatedAt = loaded.project.createdAt;
    loadedUpdatedAt = loaded.project.updatedAt;
    pipelineMismatch = loaded.project.pipelineVersion !== PIPELINE_VERSION;
    backupSuppressed = (await db.getMeta(backupMetaKey(id))) === '1';
    const settings = fromStoredSettings(loaded.project.settings);

    commit({
      settings,
      completedCells: new Set<string>(),
      projectId: id,
      projectName: loaded.project.name,
      readOnly: lockHandle ? lockHandle.readOnly : false,
      sameImageOffer: null,
      memoryOnly: false,
      status: 'pending',
    });

    const ready = await recompute();
    if (!ready) return false;

    const cells = sanitizeCompleted(
      decodeCompleted(loaded.project.completedBits, loaded.project.cols, loaded.project.rows),
      state.grid,
    );
    commit({ completedCells: cells, readOnly: lockHandle ? lockHandle.readOnly : false });
    await db.setLastOpenedId(id);
    await refreshProjects();
    return true;
  }

  async function refreshProjects(): Promise<void> {
    const db = await getDb();
    if (!db) {
      commit({ projects: [] });
      return;
    }
    commit({ projects: await db.list() });
  }

  async function saveBeforeSwitch(): Promise<void> {
    await mutationChain.catch(() => {});
    if (projectId) await autosave.flush(true);
  }

  async function handleDeletedElsewhere(): Promise<void> {
    const deletedId = projectId;
    if (deletedId) suppressedProjectIds.add(deletedId);
    releaseLock();
    resetProjectFlags();
    commit({
      projectId: null,
      projectName: null,
      completedCells: new Set<string>(),
      readOnly: false,
      sameImageOffer: null,
    });
    // Wait out any in-flight write, then delete once more so a write that
    // started before the external deletion cannot resurrect the project.
    await autosave.flush(true);
    if (deletedId) {
      const db = await getDb();
      await db?.remove(deletedId);
    }
    await refreshProjects();
    const next = state.projects[0];
    if (next) {
      await applyLoadedProject(next.id, false);
    } else {
      const fallback = options.sampleImage?.() ?? null;
      if (fallback) await loadImage(fallback, { name: 'Sample scene' });
    }
    setNotice(
      next
        ? `This project was deleted in another tab. Opened “${next.name}”.`
        : 'This project was deleted in another tab. Opened the sample scene.',
    );
  }

  channel?.subscribe((message) => {
    if (message.type === 'list-changed') {
      void refreshProjects();
    } else if (message.type === 'deleted' && message.id === projectId) {
      void handleDeletedElsewhere();
    }
  });

  async function loadImage(image: SourceImage, optionsForImage: LoadImageOptions = {}): Promise<void> {
    // Announce pending synchronously so the first paint after an upload or
    // sample selection shows "Updating…", matching the previous store contract.
    jobToken += 1;
    commit({ status: 'pending', latestJobId: jobToken, error: null });
    await saveBeforeSwitch();
    releaseLock();
    source = prepareWorkingBitmap(image);
    pendingName = optionsForImage.name
      ? projectNameFromFilename(optionsForImage.name)
      : 'Sample scene';
    jobToken += 1;
    client.invalidate?.();
    resetProjectFlags();
    commit({
      completedCells: new Set<string>(),
      projectId: null,
      projectName: null,
      readOnly: false,
      sameImageOffer: null,
    });

    const ready = await recompute();
    if (!ready || !state.grid) return;

    const db = await getDb();
    if (!db) {
      commit({ projectName: pendingName, saveStatus: 'memory-only' });
      return;
    }

    const existing = await db.findBySourceHash(state.grid.sourceHash, state.grid.cols);
    if (existing) {
      commit({
        projectName: pendingName,
        sameImageOffer: {
          sourceHash: state.grid!.sourceHash,
          cols: state.grid!.cols,
          existingProjectId: existing.id,
          existingProjectName: existing.name,
        },
      });
    } else {
      commit({ projectName: pendingName, sameImageOffer: null });
    }
    await refreshProjects();
  }

  return {
    getState() {
      return state;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async resumeLastProject() {
      const db = await getDb();
      if (!db) {
        commit({ memoryOnly: true, saveStatus: 'memory-only' });
        return false;
      }
      const lastOpened = await db.getLastOpenedId();
      if (!lastOpened) return false;
      return applyLoadedProject(lastOpened, false);
    },

    loadImage,

    async resolveSameImage(choice) {
      const offer = state.sameImageOffer;
      if (!offer) return { ok: false, reason: 'no-project', message: 'No image is pending' };
      if (choice === 'resume') {
        commit({ sameImageOffer: null });
        const opened = await applyLoadedProject(offer.existingProjectId, false);
        return opened ? { ok: true } : { ok: false, reason: 'error' };
      }
      commit({ sameImageOffer: null });
      const created = await ensureProject();
      return created ? { ok: true } : { ok: false, reason: 'error' };
    },

    async openProject(id) {
      if (id === projectId) return { ok: true };
      await saveBeforeSwitch();
      const opened = await applyLoadedProject(id, false);
      return opened ? { ok: true } : { ok: false, reason: 'error', message: 'Project could not be opened' };
    },

    async renameProject(id, name) {
      if (state.readOnly) return { ok: false, reason: 'read-only' };
      const cleaned = sanitizeName(name);
      if (!cleaned) {
        return { ok: false, reason: 'error', message: 'Project name cannot be empty' };
      }
      const others = state.projects.filter((project) => project.id !== id).map((p) => p.name);
      const unique = uniqueProjectName(cleaned, others);

      if (id === projectId) {
        projectName = unique;
        commit({ projectName: unique });
        autosave.schedule();
        await autosave.flush(true);
        channel?.post({ type: 'list-changed' });
        await refreshProjects();
        return { ok: true };
      }

      const db = await getDb();
      if (db) {
        const result = await db.rename(id, unique);
        if (!result.ok) return { ok: false, reason: 'error', message: result.message };
        channel?.post({ type: 'list-changed' });
      }
      await refreshProjects();
      return { ok: true };
    },

    async deleteProject(id) {
      if (state.readOnly) return { ok: false, reason: 'read-only' };
      // Suppress late/queued autosave writes for this id before deleting.
      suppressedProjectIds.add(id);
      if (id === projectId) {
        await mutationChain.catch(() => {});
        await autosave.flush(true);
      }
      const db = await getDb();
      if (db) await db.remove(id);
      channel?.post({ type: 'deleted', id });
      channel?.post({ type: 'list-changed' });

      if (id === projectId) {
        releaseLock();
        await db?.setLastOpenedId(null);
        resetProjectFlags();
        commit({
          projectId: null,
          projectName: null,
          completedCells: new Set<string>(),
          readOnly: false,
          sameImageOffer: null,
        });
        await refreshProjects();
        const next = state.projects[0];
        if (next) {
          await applyLoadedProject(next.id, false);
        } else {
          const fallback = options.sampleImage?.() ?? null;
          if (fallback) await loadImage(fallback, { name: 'Sample scene' });
        }
      }
      await refreshProjects();
      return { ok: true };
    },

    async startNewDrawingFromImage() {
      if (state.readOnly) return { ok: false, reason: 'read-only' };
      if (!source || !state.grid) {
        return { ok: false, reason: 'no-project', message: 'Load an image first' };
      }
      await saveBeforeSwitch();
      const originalName = projectName ?? pendingName ?? FALLBACK_PROJECT_NAME;

      const settings = { ...DEFAULT_SETTINGS };
      commit({ settings });
      const ready = await recompute();
      if (!ready || !state.grid) return { ok: false, reason: 'error' };

      releaseLock();
      resetProjectFlags();
      const db = await getDb();
      const id = randomId();
      const name = uniqueProjectName(
        `${originalName} copy`,
        state.projects.map((project) => project.name),
      );
      const record = createProjectRecord({
        id,
        name,
        now: now(),
        pipelineVersion: PIPELINE_VERSION,
        sourceHash: state.grid.sourceHash,
        cols: state.grid.cols,
        rows: state.grid.rows,
        settings,
        completed: new Set<string>(),
      });

      if (db) {
        const image = await imageRecordFor(id);
        if (!image) return { ok: false, reason: 'error' };
        const result = await db.putWithImage(record, image);
        if (!result.ok) {
          handleWriteFailure(result);
          return { ok: false, reason: 'error', message: result.message };
        }
        await db.setLastOpenedId(id);
        channel?.post({ type: 'list-changed' });
      }

      lockHandle = await acquireForProject(id);
      projectId = id;
      projectName = name;
      projectCreatedAt = record.createdAt;
      loadedUpdatedAt = db ? record.updatedAt : null;
      exported = false;
      commit({
        projectId: id,
        projectName: name,
        completedCells: new Set<string>(),
        readOnly: lockHandle.readOnly,
        memoryOnly: !db,
        saveStatus: db ? 'saved' : 'memory-only',
      });
      await refreshProjects();
      return { ok: true };
    },

    async exportProject() {
      if (!source || !state.grid) {
        return { ok: false, message: 'Load an image before exporting a project' };
      }
      try {
        const record = recordFromState(state.completedCells, state.settings);
        const png = await codec.encode(source);
        const payload = await buildProjectFile({ record, bitmap: source, png });
        exported = true;
        backupSuppressed = true;
        if (projectId) {
          const db = await getDb();
          void db?.setMeta(backupMetaKey(projectId), '1');
        }
        commit({});
        return {
          ok: true,
          filename: projectFileName(record.name),
          text: serializeProjectFile(payload),
        };
      } catch (error) {
        return { ok: false, message: errorMessage(error) };
      }
    },

    async importProject(file) {
      if (state.readOnly) return { ok: false, reason: 'read-only' };
      const db = await getDb();
      const parsed = await parseProjectFile(file, codec, {
        id: randomId(),
        now: now(),
        existingNames: state.projects.map((project) => project.name),
      });
      if (!parsed.ok) return { ok: false, reason: 'error', message: parsed.message };

      if (!db) {
        await saveBeforeSwitch();
        releaseLock();
        resetProjectFlags();
        source = prepareWorkingBitmap(parsed.bitmap);
        projectId = parsed.project.id;
        projectName = parsed.project.name;
        projectCreatedAt = parsed.project.createdAt;
        pipelineMismatch = parsed.project.pipelineVersion !== PIPELINE_VERSION;
        const settings = fromStoredSettings(parsed.project.settings);
        commit({
          settings,
          projectId: projectId,
          projectName: projectName,
          completedCells: new Set<string>(),
          readOnly: false,
          memoryOnly: true,
          saveStatus: 'memory-only',
          sameImageOffer: null,
        });
        await recompute();
        commit({
          completedCells: sanitizeCompleted(parsed.completed, state.grid),
        });
        return { ok: true };
      }

      let thumb = parsed.image.png;
      try {
        thumb = await codec.thumbnail(parsed.bitmap);
      } catch {
        thumb = parsed.image.png;
      }
      const result = await db.putWithImage(parsed.project, {
        projectId: parsed.project.id,
        width: parsed.image.width,
        height: parsed.image.height,
        png: parsed.image.png,
        thumb,
      });
      if (!result.ok) {
        handleWriteFailure(result);
        return { ok: false, reason: 'error', message: result.message };
      }
      await db.setLastOpenedId(parsed.project.id);
      channel?.post({ type: 'list-changed' });
      await refreshProjects();
      await saveBeforeSwitch();
      const opened = await applyLoadedProject(parsed.project.id, false);
      return opened ? { ok: true } : { ok: false, reason: 'error' };
    },

    refreshProjects,

    dismissBanner(id) {
      if (id === 'read-only' || id === 'memory-only') dismissedSession.add(id);
      else dismissedProject.add(id);
      if (id === 'backup') {
        backupSuppressed = true;
        if (projectId) {
          void getDb().then((db) => db?.setMeta(backupMetaKey(projectId!), '1'));
        }
      }
      if (id === 'notice') noticeText = null;
      commit({});
    },

    async takeOver() {
      if (!lockHandle) return;
      const took = await lockHandle.takeOver();
      if (!took) return;
      commit({ readOnly: false });
      await this.reloadProject();
    },

    async reloadProject() {
      if (!projectId) return;
      await applyLoadedProject(projectId, true);
      reloadPrompt = false;
      commit({});
    },

    async flushNow() {
      await mutationChain.catch(() => {});
      if (projectId) await autosave.flush(true);
    },

    dispose() {
      releaseLock();
      autosave.dispose();
      channel?.close();
    },

    async setCols(cols) {
      if (state.readOnly) return { ok: false, reason: 'read-only' };
      if (state.completedCells.size > 0) return { ok: false, reason: 'locked' };
      const next = clamp(Math.round(cols), MIN_COLS, MAX_COLS);
      if (next === state.settings.cols) return { ok: true };
      await updateSettings({ cols: next });
      afterMutation();
      return { ok: true };
    },

    async setContrast(contrast, actionOptions) {
      if (state.readOnly) return { ok: false, reason: 'read-only' };
      if (state.completedCells.size > 0 && !actionOptions?.confirmed) {
        return { ok: false, reason: 'confirm-required' };
      }
      const next = Math.round(clamp(contrast, MIN_CONTRAST, MAX_CONTRAST) * 100) / 100;
      if (next === state.settings.contrast) return { ok: true };
      await updateSettings({ contrast: next });
      afterMutation();
      return { ok: true };
    },

    async setPalette(palette) {
      if (state.readOnly) return { ok: false, reason: 'read-only' };
      if (state.completedCells.size > 0) return { ok: false, reason: 'locked' };
      if (palette === state.settings.palette) return { ok: true };
      await updateSettings({ palette });
      afterMutation();
      return { ok: true };
    },

    async setDither(dither, actionOptions) {
      if (state.readOnly) return { ok: false, reason: 'read-only' };
      if (state.completedCells.size > 0 && !actionOptions?.confirmed) {
        return { ok: false, reason: 'confirm-required' };
      }
      if (dither === state.settings.dither) return { ok: true };
      await updateSettings({ dither });
      afterMutation();
      return { ok: true };
    },

    setViewMode(mode) {
      if (mode === state.viewMode) return;
      commit({ viewMode: mode });
    },

    setHovered(cell) {
      const current = state.hoveredCell;
      if (current === cell) return;
      if (current && cell && current.col === cell.col && current.row === cell.row) return;
      if (!current && !cell) return;
      commit({ hoveredCell: cell });
    },

    setLastPointerType(type) {
      if (type === state.lastPointerType) return;
      commit({ lastPointerType: type });
    },

    setExportOptions(patch) {
      const next: ExportOptions = { ...state.exportOptions, ...patch };
      next.templateCellMm = clamp(
        Math.round(next.templateCellMm),
        MIN_TEMPLATE_MM,
        MAX_TEMPLATE_MM,
      );
      commit({ exportOptions: next });
    },

    toggleCell(col, row) {
      if (state.readOnly || state.sameImageOffer) return;
      const grid = state.grid;
      if (!grid) return;
      const coord = { col, row };
      if (!isInside(grid, coord)) return;
      const key = cellKey(col, row);
      const completed = new Set(state.completedCells);
      if (completed.has(key)) completed.delete(key);
      else completed.add(key);
      commit({ completedCells: completed });
      afterMutation();
    },

    paintCell(col, row, done) {
      if (state.readOnly || state.sameImageOffer) return;
      const grid = state.grid;
      if (!grid) return;
      const coord = { col, row };
      if (!isInside(grid, coord)) return;
      const key = cellKey(col, row);
      if (state.completedCells.has(key) === done) return;
      const completed = new Set(state.completedCells);
      if (done) completed.add(key);
      else completed.delete(key);
      commit({ completedCells: completed });
      afterMutation();
    },

    resetCompleted() {
      if (state.readOnly || state.sameImageOffer) return;
      if (state.completedCells.size === 0) return;
      commit({ completedCells: new Set<string>() });
      afterMutation();
    },
  };
}
