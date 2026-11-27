// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runPipeline } from '../../engine/pipeline';
import { prepareWorkingBitmap } from '../../engine/workingBitmap';
import { DEFAULT_SETTINGS, type EngineClient, type PipelineSettings } from '../../types/pipeline';
import { decodeCompleted, encodeCompleted } from '../completedCodec';
import type { PngCodec } from '../imageCodec';
import { createGridStore, type GridStore, type GridStoreOptions } from '../gridStore';
import { createProjectRecord } from '../projectManager';
import { SCHEMA_VERSION, type ProjectDatabase, type ProjectRecord } from '../projectDb';
import { legacyKey } from '../legacyMigration';
import { losslessCodec, MemoryStorage, openTestDb, sampleBitmap } from './support';

let dbCounter = 0;
const dbs: ProjectDatabase[] = [];
const stores: GridStore[] = [];

function uniqueDbName(): string {
  dbCounter += 1;
  return `lifecycle-${dbCounter}-${Math.random().toString(16).slice(2)}`;
}

async function makeDb(): Promise<ProjectDatabase> {
  const db = await openTestDb(uniqueDbName());
  dbs.push(db);
  return db;
}

let clock = 1000;

function makeStore(
  db: ProjectDatabase | null,
  overrides: Partial<GridStoreOptions> = {},
): { store: GridStore; client: EngineClient & { calls: number } } {
  const base: EngineClient = {
    async process(request) {
      client.calls += 1;
      return runPipeline(request);
    },
  };
  const client = base as EngineClient & { calls: number };
  client.calls = 0;
  let id = 0;
  const store = createGridStore({
    client,
    db,
    codec: losslessCodec(),
    storage: new MemoryStorage(),
    now: () => (clock += 1),
    randomId: () => `project-${++id}-${Math.random().toString(16).slice(2)}`,
    debounceMs: 5,
    channel: null,
    ...overrides,
  });
  stores.push(store);
  return { store, client };
}

afterEach(() => {
  while (stores.length > 0) stores.pop()?.dispose();
  while (dbs.length > 0) dbs.pop()?.close();
});

function hashFor(image: ReturnType<typeof sampleBitmap>, settings: PipelineSettings = DEFAULT_SETTINGS): string {
  return runPipeline({ image: prepareWorkingBitmap(image), settings }).grid.sourceHash;
}

function recordFor(
  id: string,
  hash: string,
  completed: Set<string>,
  overrides: Partial<ProjectRecord> = {},
): ProjectRecord {
  const cols = overrides.cols ?? DEFAULT_SETTINGS.cols;
  const rows = overrides.rows ?? 42;
  return {
    id,
    name: id,
    createdAt: 10,
    updatedAt: 20,
    schemaVersion: SCHEMA_VERSION,
    pipelineVersion: 1,
    sourceHash: hash,
    cols,
    rows,
    settings: {
      cols,
      contrast: DEFAULT_SETTINGS.contrast,
      dither: DEFAULT_SETTINGS.dither,
      ditherStrength: DEFAULT_SETTINGS.ditherStrength,
      paletteId: DEFAULT_SETTINGS.palette,
    },
    completedBits: encodeCompleted(completed, cols, rows),
    doneCount: completed.size,
    ...overrides,
  };
}

async function seedProject(
  db: ProjectDatabase,
  id: string,
  image: ReturnType<typeof sampleBitmap>,
  hash: string,
  completed: Set<string>,
  overrides: Partial<ProjectRecord> = {},
): Promise<void> {
  const codec = losslessCodec();
  const png = await codec.encode(image);
  await db.putWithImage(recordFor(id, hash, completed, overrides), {
    projectId: id,
    width: image.width,
    height: image.height,
    png,
    thumb: png,
  });
  await db.setLastOpenedId(id);
}

describe('project lifecycle', () => {
  it('resumes the last-opened project with image, settings, and cells', async () => {
    const db = await makeDb();
    const image = sampleBitmap(40, 30, 1);
    const first = makeStore(db);
    await first.store.loadImage(image, { name: 'photo.png' });
    first.store.toggleCell(2, 3);
    first.store.toggleCell(4, 5);
    await first.store.flushNow();
    const projectId = first.store.getState().projectId;
    expect(projectId).not.toBeNull();

    const hash = hashFor(image);
    const second = makeStore(db);
    await expect(second.store.resumeLastProject()).resolves.toBe(true);
    const state = second.store.getState();
    expect(state.projectId).toBe(projectId);
    expect(state.projectName).toBe('photo');
    expect(state.grid?.sourceHash).toBe(hash);
    expect([...state.completedCells].sort()).toEqual(['2,3', '4,5']);
  });

  it('shows the sample scene only when no project exists and creates on first change', async () => {
    const db = await makeDb();
    const { store } = makeStore(db);
    const sample = sampleBitmap(32, 24, 2);
    await store.loadImage(sample, { name: 'Sample scene' });
    await expect(store.resumeLastProject()).resolves.toBe(false);
    expect(store.getState().projectId).toBeNull();
    expect(store.getState().grid).not.toBeNull();

    store.toggleCell(1, 1);
    await store.flushNow();
    expect(store.getState().projectId).not.toBeNull();
    await expect(db.list()).resolves.toHaveLength(1);
  });

  it('keeps fast edits made while the first project is being created', async () => {
    const db = await makeDb();
    const base = losslessCodec();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let blocked = false;
    const delayed: PngCodec = {
      ...base,
      async encode(image) {
        if (!blocked) {
          blocked = true;
          await gate;
        }
        return base.encode(image);
      },
    };

    const { store } = makeStore(db, { codec: delayed });
    await store.loadImage(sampleBitmap(32, 24, 21), { name: 'fast.png' });

    // First toggle starts project creation and blocks in the image encoder.
    store.toggleCell(0, 0);
    await vi.waitFor(() => expect(blocked).toBe(true));
    // Four rapid edits while creation is still in flight.
    store.toggleCell(1, 0);
    store.toggleCell(2, 0);
    store.toggleCell(3, 0);
    release();
    await store.flushNow();

    expect([...store.getState().completedCells].sort()).toEqual([
      '0,0',
      '1,0',
      '2,0',
      '3,0',
    ]);

    const projectId = store.getState().projectId!;
    const record = await db.get(projectId);
    expect(record.ok && record.project.doneCount).toBe(4);
    if (record.ok) {
      expect([
        ...decodeCompleted(
          record.project.completedBits,
          record.project.cols,
          record.project.rows,
        ),
      ].sort()).toEqual(['0,0', '1,0', '2,0', '3,0']);
    }
  });

  it('saves the current project before opening another', async () => {
    const db = await makeDb();
    const a = sampleBitmap(32, 24, 3);
    const b = sampleBitmap(32, 24, 8);
    const { store } = makeStore(db);

    await store.loadImage(a, { name: 'a.png' });
    store.toggleCell(1, 1);
    await store.flushNow();
    const aId = store.getState().projectId!;

    await store.loadImage(b, { name: 'b.png' });
    store.toggleCell(2, 2);
    await store.flushNow();
    const bId = store.getState().projectId!;
    expect(aId).not.toBe(bId);

    await store.openProject(aId);
    expect(store.getState().projectId).toBe(aId);
    expect([...store.getState().completedCells]).toEqual(['1,1']);

    const bRecord = await db.get(bId);
    expect(bRecord.ok && bRecord.project.doneCount).toBe(1);
  });

  it('deleting the open project falls back to the next one, then the sample', async () => {
    const db = await makeDb();
    const a = sampleBitmap(32, 24, 4);
    const b = sampleBitmap(32, 24, 9);
    const sample = sampleBitmap(24, 18, 12);
    const { store } = makeStore(db, { sampleImage: () => sample });

    await store.loadImage(a, { name: 'a.png' });
    store.toggleCell(1, 1);
    await store.flushNow();
    const aId = store.getState().projectId!;

    await store.loadImage(b, { name: 'b.png' });
    store.toggleCell(2, 2);
    await store.flushNow();
    const bId = store.getState().projectId!;

    await store.openProject(aId);
    await expect(store.deleteProject(aId)).resolves.toMatchObject({ ok: true });
    expect(store.getState().projectId).toBe(bId);

    await expect(store.deleteProject(bId)).resolves.toMatchObject({ ok: true });
    expect(store.getState().projectId).toBeNull();
    expect(store.getState().grid).not.toBeNull();
    expect(store.getState().projectName).toBe('Sample scene');
  });

  it('does not let an in-flight autosave recreate a deleted project', async () => {
    const db = await makeDb();
    const sample = sampleBitmap(24, 18, 23);
    const { store } = makeStore(db, { sampleImage: () => sample });
    await store.loadImage(sampleBitmap(32, 24, 22), { name: 'pending.png' });
    store.toggleCell(0, 0);
    await store.flushNow();
    const id = store.getState().projectId!;

    const originalPut = db.put.bind(db);
    let releaseWrite!: () => void;
    let markStarted!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    vi.spyOn(db, 'put').mockImplementationOnce(async (record, options) => {
      markStarted();
      await gate;
      return originalPut(record, options);
    });

    store.toggleCell(1, 1);
    await started;
    const deletion = store.deleteProject(id);

    // Old behaviour resolved deletion while the write was still blocked; the
    // late write then recreated the record. The fix waits for the flush.
    await new Promise((resolve) => setTimeout(resolve, 20));
    releaseWrite();
    await deletion;
    await new Promise((resolve) => setTimeout(resolve, 20));

    await expect(db.get(id)).resolves.toMatchObject({ ok: false, reason: 'missing' });
    await expect(db.list()).resolves.toEqual([]);
    expect(store.getState().projectId).toBeNull();
  });

  it('offers resume or copy before creating a duplicate for the same image', async () => {
    const db = await makeDb();
    const image = sampleBitmap(32, 24, 5);
    const first = makeStore(db);
    await first.store.loadImage(image, { name: 'tree.png' });
    first.store.toggleCell(3, 3);
    await first.store.flushNow();
    const existingId = first.store.getState().projectId!;

    const second = makeStore(db);
    await second.store.loadImage(image, { name: 'tree.png' });
    expect(second.store.getState().sameImageOffer).not.toBeNull();
    await expect(db.list()).resolves.toHaveLength(1);

    await second.store.resolveSameImage('resume');
    expect(second.store.getState().projectId).toBe(existingId);
    expect(second.store.getState().sameImageOffer).toBeNull();

    const third = makeStore(db);
    await third.store.loadImage(image, { name: 'tree.png' });
    await third.store.resolveSameImage('copy');
    expect(third.store.getState().projectId).not.toBe(existingId);
    await expect(db.list()).resolves.toHaveLength(2);
  });

  it('creates a sibling project from the image with default settings and zero cells', async () => {
    const db = await makeDb();
    const image = sampleBitmap(40, 30, 6);
    const { store } = makeStore(db);
    await store.loadImage(image, { name: 'tree.png' });
    await store.setCols(32);
    for (let i = 0; i < 100; i += 1) store.toggleCell(i % 32, Math.floor(i / 32));
    await store.flushNow();
    const originalId = store.getState().projectId!;

    await expect(store.startNewDrawingFromImage()).resolves.toMatchObject({ ok: true });
    const state = store.getState();
    expect(state.projectId).not.toBe(originalId);
    expect(state.completedCells.size).toBe(0);
    expect(state.settings.cols).toBe(DEFAULT_SETTINGS.cols);

    const original = await db.get(originalId);
    expect(original.ok && original.project.doneCount).toBe(100);
    expect(original.ok && original.project.cols).toBe(32);
  });

  it('names projects from the file and de-duplicates with a numeric suffix', async () => {
    const db = await makeDb();
    const { store } = makeStore(db);
    await store.loadImage(sampleBitmap(32, 24, 7), { name: 'tree.png' });
    store.toggleCell(1, 1);
    await store.flushNow();

    await store.loadImage(sampleBitmap(32, 24, 17), { name: 'tree.png' });
    store.toggleCell(1, 1);
    await store.flushNow();

    const names = (await db.list()).map((entry) => entry.name).sort();
    expect(names).toEqual(['tree', 'tree (2)']);

    const long = `${'x'.repeat(90)}.png`;
    await store.loadImage(sampleBitmap(32, 24, 27), { name: long });
    store.toggleCell(0, 0);
    await store.flushNow();
    const longest = (await db.list()).reduce((max, entry) => Math.max(max, entry.name.length), 0);
    expect(longest).toBeLessThanOrEqual(60);

    const current = store.getState().projectId!;
    await expect(store.renameProject(current, '   ')).resolves.toMatchObject({ ok: false });
    await expect(store.renameProject(current, '  Renamed  ')).resolves.toMatchObject({ ok: true });
    const renamed = await db.get(current);
    expect(renamed.ok && renamed.project.name).toBe('Renamed');
  });

  it('derives doneCount from the in-range encoded cells', () => {
    const record = createProjectRecord({
      id: 'defensive',
      name: 'defensive',
      now: 1,
      pipelineVersion: 1,
      sourceHash: 'hash',
      cols: 16,
      rows: 2,
      settings: { ...DEFAULT_SETTINGS, cols: 16 },
      completed: new Set(['0,0', '15,1', '99,99', 'not-a-cell']),
    });
    expect(record.doneCount).toBe(2);
    expect(decodeCompleted(record.completedBits, 16, 2).size).toBe(2);
  });

  it('enforces the geometry lock in the store and needs confirmation for contrast/dither', async () => {
    const db = await makeDb();
    const { store, client } = makeStore(db);
    await store.loadImage(sampleBitmap(32, 24, 8), { name: 'lock.png' });
    store.toggleCell(1, 1);
    await store.flushNow();

    await expect(store.setCols(64)).resolves.toMatchObject({ ok: false, reason: 'locked' });
    expect(store.getState().settings.cols).toBe(56);
    await expect(store.setPalette('vibrant')).resolves.toMatchObject({
      ok: false,
      reason: 'locked',
    });
    expect(store.getState().settings.palette).toBe('reflective');

    const callsBefore = client.calls;
    await expect(store.setContrast(2.0)).resolves.toMatchObject({
      ok: false,
      reason: 'confirm-required',
    });
    await expect(store.setDither(false)).resolves.toMatchObject({
      ok: false,
      reason: 'confirm-required',
    });
    expect(store.getState().settings.contrast).toBe(DEFAULT_SETTINGS.contrast);
    expect(client.calls).toBe(callsBefore);

    await expect(store.setContrast(2.0, { confirmed: true })).resolves.toMatchObject({ ok: true });
    expect(store.getState().settings.contrast).toBe(2);

    store.toggleCell(1, 1);
    await store.flushNow();
    expect(store.getState().completedCells.size).toBe(0);
    await expect(store.setCols(64)).resolves.toMatchObject({ ok: true });
    expect(store.getState().settings.cols).toBe(64);

    store.toggleCell(1, 1);
    store.resetCompleted();
    await store.flushNow();
    await expect(store.setPalette('vibrant')).resolves.toMatchObject({ ok: true });
  });

  it('shows a dismissible notice for a pipeline version mismatch and keeps cells', async () => {
    const db = await makeDb();
    const image = sampleBitmap(32, 24, 9);
    const hash = hashFor(image);
    await seedProject(db, 'old', image, hash, new Set(['1,1', '2,2']), {
      pipelineVersion: 0,
    });

    const { store } = makeStore(db);
    await expect(store.resumeLastProject()).resolves.toBe(true);
    const state = store.getState();
    expect(state.completedCells.size).toBe(2);
    expect(state.banners.map((banner) => banner.id)).toContain('pipeline-version');

    store.dismissBanner('pipeline-version');
    expect(store.getState().banners.map((banner) => banner.id)).not.toContain('pipeline-version');
  });

  it('adopts legacy localStorage cells once and never writes legacy keys', async () => {
    const db = await makeDb();
    const image = sampleBitmap(32, 24, 10);
    const hash = hashFor(image);
    const storage = new MemoryStorage();
    storage.setItem(
      legacyKey(hash),
      JSON.stringify(['1,1', '2,2', '3,3', '4,4', '5,5', '9999,9999']),
    );
    storage.setCalls = 0;

    const { store } = makeStore(db, { storage });
    await store.loadImage(image, { name: 'legacy.png' });
    store.toggleCell(0, 0);
    await store.flushNow();

    const completed = [...store.getState().completedCells].sort();
    expect(completed).toEqual(['0,0', '1,1', '2,2', '3,3', '4,4', '5,5']);
    expect(storage.getItem(legacyKey(hash))).toBeNull();
    expect(storage.setCalls).toBe(0);

    const record = await db.get(store.getState().projectId!);
    expect(record.ok && record.project.doneCount).toBe(6);
  });

  it('refuses a project with a newer schema and leaves it untouched', async () => {
    const db = await makeDb();
    const image = sampleBitmap(32, 24, 11);
    const hash = hashFor(image);
    await seedProject(db, 'future', image, hash, new Set(['1,1']), {
      schemaVersion: SCHEMA_VERSION + 1,
    });

    const { store } = makeStore(db, { sampleImage: () => sampleBitmap(24, 18, 3) });
    await store.loadImage(sampleBitmap(24, 18, 3), { name: 'Sample scene' });
    await expect(store.resumeLastProject()).resolves.toBe(false);
    expect(store.getState().projectId).toBeNull();
    expect(store.getState().banners.map((banner) => banner.id)).toContain('notice');

    const untouched = await db.get('future');
    expect(untouched).toMatchObject({ ok: false, reason: 'newer-schema' });
  });

  it('read-only flush leaves saveStatus unchanged and writes nothing', async () => {
    const db = await makeDb();
    const image = sampleBitmap(32, 24, 31);
    const first = makeStore(db);
    await first.store.loadImage(image, { name: 'read-only.png' });
    first.store.toggleCell(1, 1);
    await first.store.flushNow();
    const projectId = first.store.getState().projectId!;
    first.store.dispose();
    stores.splice(stores.indexOf(first.store), 1);

    const denyLocks = {
      async request(
        _name: string,
        _options: { ifAvailable?: boolean; steal?: boolean },
        callback: (lock: unknown) => Promise<void>,
      ): Promise<unknown> {
        await callback(null);
        return undefined;
      },
    };

    const viewer = makeStore(db, { locks: denyLocks }).store;
    await expect(viewer.resumeLastProject()).resolves.toBe(true);
    expect(viewer.getState().projectId).toBe(projectId);
    expect(viewer.getState().readOnly).toBe(true);

    const statusBefore = viewer.getState().saveStatus;
    const put = vi.spyOn(db, 'put');
    await viewer.flushNow();
    expect(put).not.toHaveBeenCalled();
    expect(viewer.getState().saveStatus).toBe(statusBefore);
  });
});
