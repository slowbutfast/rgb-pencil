// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBObjectStore, indexedDB } from 'fake-indexeddb';

import { runPipeline } from '../../engine/pipeline';
import { DEFAULT_SETTINGS, type PipelineSettings } from '../../types/pipeline';
import { encodeCompleted } from '../completedCodec';
import {
  DB_NAME,
  SCHEMA_VERSION,
  openProjectDatabase,
  type ProjectDatabase,
  type ProjectRecord,
} from '../projectDb';
import { losslessCodec, openTestDb, sampleBitmap, testImageRecord } from './support';

let counter = 0;
const dbs: ProjectDatabase[] = [];

function uniqueName(): string {
  counter += 1;
  return `rgb-pencil-test-${counter}-${Math.random().toString(16).slice(2)}`;
}

async function freshDb(persistStorage?: () => Promise<boolean>): Promise<ProjectDatabase> {
  const db = await openTestDb(uniqueName(), persistStorage);
  dbs.push(db);
  return db;
}

function record(id: string, overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  const cols = overrides.cols ?? 56;
  const rows = overrides.rows ?? 42;
  return {
    id,
    name: id,
    createdAt: 100,
    updatedAt: 100,
    schemaVersion: SCHEMA_VERSION,
    pipelineVersion: 1,
    sourceHash: 'hash',
    cols,
    rows,
    settings: {
      cols,
      contrast: DEFAULT_SETTINGS.contrast,
      dither: DEFAULT_SETTINGS.dither,
      ditherStrength: DEFAULT_SETTINGS.ditherStrength,
      paletteId: DEFAULT_SETTINGS.palette,
    },
    completedBits: encodeCompleted(new Set<string>(), cols, rows),
    doneCount: 0,
    ...overrides,
  };
}

function settings(): PipelineSettings {
  return { ...DEFAULT_SETTINGS };
}

async function seedRaw(dbName: string, value: ProjectRecord): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('projects', 'readwrite');
    tx.objectStore('projects').put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

afterEach(() => {
  while (dbs.length > 0) dbs.pop()?.close();
  vi.restoreAllMocks();
});

describe('projectDb', () => {
  it('opens the named schema and exposes the three stores', async () => {
    const db = await freshDb();
    expect(DB_NAME).toBe('rgb-pencil');
    // A resolved database proves the ordered v1 upgrade created every store.
    await expect(db.list()).resolves.toEqual([]);
    await expect(db.getLastOpenedId()).resolves.toBeNull();
  });

  it('creates, reads, and lists projects newest first', async () => {
    const db = await freshDb();
    const codec = losslessCodec();
    const png = await codec.encode(sampleBitmap());

    await db.putWithImage(record('older', { updatedAt: 10 }), testImageRecord('older', png));
    await db.putWithImage(record('newer', { updatedAt: 20 }), testImageRecord('newer', png));

    const loaded = await db.get('older');
    expect(loaded.ok && loaded.project.name).toBe('older');
    const list = await db.list();
    expect(list.map((entry) => entry.id)).toEqual(['newer', 'older']);
    expect(list[0]?.thumb).toBeTruthy();
  });

  it('renames a project and updates updatedAt', async () => {
    const db = await freshDb();
    await db.put(record('p'));
    const before = await db.get('p');
    expect(before.ok).toBe(true);
    if (!before.ok) return;

    const renamed = await db.rename('p', 'New name');
    expect(renamed.ok).toBe(true);
    const after = await db.get('p');
    expect(after.ok && after.project.name).toBe('New name');
    expect(after.ok && after.project.updatedAt).toBeGreaterThan(before.project.updatedAt);
  });

  it('delete removes both the metadata and the image records', async () => {
    const db = await freshDb();
    const codec = losslessCodec();
    const png = await codec.encode(sampleBitmap());
    await db.putWithImage(record('p'), testImageRecord('p', png));

    await db.remove('p');
    await expect(db.get('p')).resolves.toMatchObject({ ok: false, reason: 'missing' });
    await expect(db.getImage('p')).resolves.toBeNull();
    await expect(db.list()).resolves.toEqual([]);
  });

  it('round-trips the PNG bit-exactly and keeps sourceHash stable', async () => {
    const db = await freshDb();
    const codec = losslessCodec();
    const bitmap = sampleBitmap(40, 30, 7);
    const pipeline = runPipeline({ image: bitmap, settings: settings() });
    const png = await codec.encode(bitmap);

    await db.putWithImage(
      record('p', { sourceHash: pipeline.grid.sourceHash, cols: 56, rows: 42 }),
      testImageRecord('p', png),
    );

    const stored = await db.getImage('p');
    expect(stored).not.toBeNull();
    const restored = await codec.decode(stored!.png);
    expect(restored.data).toEqual(bitmap.data);
    expect([...restored.data]).toEqual([...bitmap.data]);

    const restoredPipeline = runPipeline({ image: restored, settings: settings() });
    expect(restoredPipeline.grid.sourceHash).toBe(pipeline.grid.sourceHash);

    // Soft assertion from tests.md: report the encoded size for a 512-px image.
    const large = sampleBitmap(512, 384, 1);
    const largePng = await codec.encode(large);
    console.info(`[png-size] 512x384 fake PNG bytes=${largePng.size}`);
    expect(largePng.size).toBeGreaterThan(0);
  });

  it('refuses a newer schema and never modifies it', async () => {
    const name = uniqueName();
    const db = await openTestDb(name);
    dbs.push(db);
    const future = record('future', { schemaVersion: SCHEMA_VERSION + 1 });
    await seedRaw(name, future);

    const loaded = await db.get('future');
    expect(loaded).toMatchObject({ ok: false, reason: 'newer-schema' });
    const list = await db.list();
    expect(list.map((entry) => entry.id)).not.toContain('future');

    // Read the raw record again: untouched.
    const raw = await new Promise<ProjectRecord | undefined>((resolve, reject) => {
      const open = indexedDB.open(name, 1);
      open.onsuccess = () => {
        const tx = open.result.transaction('projects', 'readonly');
        const request = tx.objectStore('projects').get('future');
        request.onsuccess = () => resolve(request.result as ProjectRecord | undefined);
        request.onerror = () => reject(request.error);
      };
      open.onerror = () => reject(open.error);
    });
    expect(raw?.schemaVersion).toBe(SCHEMA_VERSION + 1);
  });

  it('surfaces open failure without throwing', async () => {
    const blocked = {
      open() {
        throw new Error('IndexedDB is blocked');
      },
    } as unknown as IDBFactory;
    const opened = await openProjectDatabase({ factory: blocked, dbName: uniqueName() });
    expect(opened.ok).toBe(false);
    if (!opened.ok) expect(opened.message).toContain('blocked');
  });

  it('surfaces QuotaExceededError as a status and retries on the next write', async () => {
    const db = await freshDb();
    const quota = vi
      .spyOn(IDBObjectStore.prototype, 'put')
      .mockImplementationOnce(() => {
        throw new DOMException('quota full', 'QuotaExceededError');
      });

    const failed = await db.put(record('p'));
    expect(failed).toMatchObject({ ok: false, quotaExceeded: true });
    expect(failed.ok ? '' : failed.message).toMatch(/quota/i);
    quota.mockRestore();

    const retried = await db.put(record('p'));
    expect(retried.ok).toBe(true);
    await expect(db.list()).resolves.toHaveLength(1);
  });

  it('surfaces a generic write failure without throwing', async () => {
    const db = await freshDb();
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
      throw new Error('disk gone');
    });
    const failed = await db.put(record('p'));
    expect(failed).toMatchObject({ ok: false });
    if (!failed.ok) expect(failed.message).toContain('disk gone');
  });

  it('requests persistent storage once after the first successful save', async () => {
    const persist = vi.fn(async () => true);
    const db = await freshDb(persist);
    await db.put(record('a'));
    await db.put(record('b'));
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('finds the same image only at the same width', async () => {
    const db = await freshDb();
    await db.put(record('wide', { sourceHash: 'abc', cols: 72, updatedAt: 5 }));
    await db.put(record('narrow', { sourceHash: 'abc', cols: 56, updatedAt: 6 }));

    const found = await db.findBySourceHash('abc', 56);
    expect(found?.id).toBe('narrow');
    await expect(db.findBySourceHash('nope', 56)).resolves.toBeNull();
  });

  it('compare-and-put skips a stale write inside one transaction', async () => {
    const db = await freshDb();
    await db.put(record('p', { updatedAt: 10 }));
    const stale = await db.put(record('p', { updatedAt: 11 }), { expectedUpdatedAt: 5 });
    expect(stale).toMatchObject({ ok: false, conflict: true });
    const current = await db.get('p');
    expect(current.ok && current.project.updatedAt).toBe(10);
  });
});
