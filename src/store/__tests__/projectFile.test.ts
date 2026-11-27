// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runPipeline } from '../../engine/pipeline';
import { prepareWorkingBitmap } from '../../engine/workingBitmap';
import { DEFAULT_SETTINGS } from '../../types/pipeline';
import { createGridStore, type GridStore } from '../gridStore';
import {
  MAX_PROJECT_FILE_BYTES,
  PROJECT_FILE_FORMAT,
  PROJECT_FILE_VERSION,
  parseProjectFile,
  projectFileName,
  type ProjectFilePayload,
} from '../projectFile';
import type { ProjectDatabase } from '../projectDb';
import {
  losslessCodec,
  MemoryProjectDatabase,
  MemoryStorage,
  openTestDb,
  sampleBitmap,
} from './support';

let counter = 0;
const dbs: ProjectDatabase[] = [];
const stores: GridStore[] = [];

async function makeDb(): Promise<ProjectDatabase> {
  counter += 1;
  const db = await openTestDb(`file-${counter}-${Math.random().toString(16).slice(2)}`);
  dbs.push(db);
  return db;
}

let clock = 5000;
let idCounter = 0;

function makeStore(db: ProjectDatabase | null): GridStore {
  const store = createGridStore({
    client: { process: async (request) => runPipeline(request) },
    db,
    codec: losslessCodec(),
    storage: new MemoryStorage(),
    now: () => (clock += 1),
    randomId: () => `file-project-${++idCounter}`,
    debounceMs: 5,
    channel: null,
  });
  stores.push(store);
  return store;
}

afterEach(() => {
  while (stores.length > 0) stores.pop()?.dispose();
  while (dbs.length > 0) dbs.pop()?.close();
});

const codec = losslessCodec();

function fileLike(text: string): File {
  return new File([text], 'project.rgbpencil.json', { type: 'application/json' });
}

async function payloadFromStore(store: GridStore): Promise<ProjectFilePayload> {
  const exported = await store.exportProject();
  if (!exported.ok) throw new Error(exported.message);
  return JSON.parse(exported.text) as ProjectFilePayload;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

describe('projectFile', () => {
  it('names the file <project>.rgbpencil.json', () => {
    expect(projectFileName('tree')).toBe('tree.rgbpencil.json');
    expect(projectFileName('a/b:c')).toBe('a-b-c.rgbpencil.json');
  });

  it('exports every part of the project', async () => {
    const db = await makeDb();
    const store = makeStore(db);
    const image = sampleBitmap(32, 24, 4);
    await store.loadImage(image, { name: 'tree.png' });
    store.setCols(32);
    store.toggleCell(1, 1);
    store.toggleCell(2, 4);
    await store.flushNow();

    const exported = await store.exportProject();
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(exported.filename).toBe('tree.rgbpencil.json');

    const payload = JSON.parse(exported.text) as ProjectFilePayload;
    expect(payload.format).toBe(PROJECT_FILE_FORMAT);
    expect(payload.version).toBe(PROJECT_FILE_VERSION);
    expect(payload.cols).toBe(32);
    expect(payload.settings.paletteId).toBe('reflective');
    expect(payload.name).toBe('tree');
    expect(typeof payload.sourceHash).toBe('string');
    expect(payload.completed.length).toBeGreaterThan(0);
    expect(payload.bitmap.png.length).toBeGreaterThan(0);
    expect(payload.bitmap.width).toBe(32);
    expect(payload.bitmap.height).toBe(24);
  });

  it('round-trips export, delete, and import under a new id', async () => {
    const db = await makeDb();
    const store = makeStore(db);
    const image = sampleBitmap(32, 24, 6);
    const hash = runPipeline({ image: prepareWorkingBitmap(image), settings: DEFAULT_SETTINGS }).grid
      .sourceHash;
    await store.loadImage(image, { name: 'backup.png' });
    store.toggleCell(1, 1);
    store.toggleCell(3, 5);
    await store.flushNow();
    const originalId = store.getState().projectId!;

    const exported = await store.exportProject();
    if (!exported.ok) throw new Error(exported.message);
    await store.deleteProject(originalId);
    await expect(db.list()).resolves.toHaveLength(0);

    const imported = await store.importProject(fileLike(exported.text));
    expect(imported).toMatchObject({ ok: true });
    const state = store.getState();
    expect(state.projectId).not.toBe(originalId);
    expect(state.grid?.sourceHash).toBe(hash);
    expect([...state.completedCells].sort()).toEqual(['1,1', '3,5']);
    expect(state.projectName).toBe('backup');

    const imageRecord = await db.getImage(state.projectId!);
    const restored = await codec.decode(imageRecord!.png);
    expect(restored.data).toEqual(image.data);
  });

  it('rejects malformed and inconsistent files without touching storage', async () => {
    const db = new MemoryProjectDatabase(() => 1);
    const valid = await payloadForRejection();
    const cases: Array<[string, unknown, RegExp]> = [
      ['non-JSON', 'this is not json', /json/i],
      ['wrong format', { ...valid, format: 'other' }, /format/i],
      ['newer version', { ...valid, version: PROJECT_FILE_VERSION + 1 }, /update|version/i],
      ['cols out of range', { ...valid, cols: 15 }, /columns|cols|width/i],
      ['rows out of range', { ...valid, rows: 0 }, /rows/i],
      ['non-integer rows', { ...valid, rows: 2.5 }, /rows/i],
      ['bitset length', { ...valid, completed: bytesToBase64(new Uint8Array(10)) }, /bitset/i],
      ['contrast range', { ...valid, settings: { ...valid.settings, contrast: 3 } }, /contrast/i],
      [
        'dither strength range',
        { ...valid, settings: { ...valid.settings, ditherStrength: 2 } },
        /dither/i,
      ],
      ['unknown palette', { ...valid, settings: { ...valid.settings, paletteId: 'neon' } }, /palette/i],
      [
        'undecodable png',
        { ...valid, bitmap: { ...valid.bitmap, png: bytesToBase64(new Uint8Array([1, 2, 3])) } },
        /png/i,
      ],
      [
        'bitmap too large',
        {
          ...valid,
          bitmap: {
            ...valid.bitmap,
            width: 2000,
            height: 1000,
            png: await encodeBitmap(sampleBitmap(2000, 1000)),
          },
        },
        /1024|large/i,
      ],
    ];

    for (const [label, source, message] of cases) {
      const text = typeof source === 'string' ? source : JSON.stringify(source);
      const result = await parseProjectFile(fileLike(text), codec, {
        id: 'new-id',
        now: 10,
        existingNames: [],
      });
      expect(result.ok, label).toBe(false);
      if (!result.ok) expect(result.message, label).toMatch(message);
    }
    expect(db.projects.size).toBe(0);
  });

  it('rejects a file over 8MB before reading it', async () => {
    const text = vi.fn(async () => '{}');
    const result = await parseProjectFile(
      { size: MAX_PROJECT_FILE_BYTES + 1, text },
      codec,
      { id: 'x', now: 1, existingNames: [] },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/8 ?MB|too large/i);
    expect(text).not.toHaveBeenCalled();
  });

  it('treats names as plain text', async () => {
    const db = await makeDb();
    const store = makeStore(db);
    await store.loadImage(sampleBitmap(32, 24, 8), { name: 'markup.png' });
    store.toggleCell(1, 1);
    await store.flushNow();

    const payload = await payloadFromStore(store);
    const markup = '<img src=x onerror="window.__pwned=1">';
    const parsed = await parseProjectFile(fileLike(JSON.stringify({ ...payload, name: markup })), codec, {
      id: 'safe-id',
      now: 10,
      existingNames: [],
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.project.name).toBe(markup);
  });

  it('shows the backup nudge once at 50 cells and suppresses it on dismiss or export', async () => {
    const db = await makeDb();
    const store = makeStore(db);
    await store.loadImage(sampleBitmap(24, 18, 9), { name: 'nudge.png' });
    for (let i = 0; i < 50; i += 1) store.toggleCell(i % 56, Math.floor(i / 56));
    await store.flushNow();
    const dismissedProjectId = store.getState().projectId!;

    expect(store.getState().banners.map((banner) => banner.id)).toContain('backup');
    store.dismissBanner('backup');
    expect(store.getState().banners.map((banner) => banner.id)).not.toContain('backup');
    for (let i = 50; i < 60; i += 1) store.toggleCell(i % 56, Math.floor(i / 56));
    await store.flushNow();
    expect(store.getState().banners.map((banner) => banner.id)).not.toContain('backup');

    // The dismissal is per project and survives a reload.
    const reopened = makeStore(db);
    await reopened.openProject(dismissedProjectId);
    expect(reopened.getState().completedCells.size).toBe(60);
    expect(reopened.getState().banners.map((banner) => banner.id)).not.toContain('backup');

    const second = makeStore(db);
    await second.loadImage(sampleBitmap(24, 18, 19), { name: 'nudge2.png' });
    for (let i = 0; i < 10; i += 1) second.toggleCell(i, 0);
    await second.flushNow();
    await second.exportProject();
    for (let i = 10; i < 50; i += 1) second.toggleCell(i % 56, Math.floor(i / 56));
    await second.flushNow();
    expect(second.getState().banners.map((banner) => banner.id)).not.toContain('backup');
  });

  it('shows the pipeline-version notice for an older file imported in memory-only mode', async () => {
    const db = await makeDb();
    const sourceStore = makeStore(db);
    await sourceStore.loadImage(sampleBitmap(32, 24, 13), { name: 'older-source.png' });
    sourceStore.toggleCell(1, 1);
    sourceStore.toggleCell(2, 2);
    await sourceStore.flushNow();
    const exported = await sourceStore.exportProject();
    if (!exported.ok) throw new Error(exported.message);

    const payload = JSON.parse(exported.text) as ProjectFilePayload;
    payload.pipelineVersion = 0;
    payload.name = 'Older backup';

    const memory = makeStore(null);
    const imported = await memory.importProject(fileLike(JSON.stringify(payload)));
    expect(imported).toMatchObject({ ok: true });
    expect(memory.getState().banners.map((banner) => banner.id)).toContain(
      'pipeline-version',
    );
    expect([...memory.getState().completedCells].sort()).toEqual(['1,1', '2,2']);
  });

  it('rejects a PNG whose IHDR declares dimensions beyond the cap without decoding', async () => {
    const valid = await payloadForRejection();
    const decode = vi.fn(async () => {
      throw new Error('decode should not run');
    });
    const result = await parseProjectFile(
      fileLike(
        JSON.stringify({
          ...valid,
          bitmap: { ...valid.bitmap, png: pngWithIhdr(30000, 30000) },
        }),
      ),
      { ...codec, decode },
      { id: 'ihdr-cap', now: 10, existingNames: [] },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/1024|large/i);
    expect(decode).not.toHaveBeenCalled();
  });

  it('rejects an IHDR that disagrees with the declared bitmap size', async () => {
    const valid = await payloadForRejection();
    const result = await parseProjectFile(
      fileLike(
        JSON.stringify({
          ...valid,
          bitmap: { ...valid.bitmap, width: 40, height: 30, png: pngWithIhdr(32, 24) },
        }),
      ),
      codec,
      { id: 'ihdr-mismatch', now: 10, existingNames: [] },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/match|dimension/i);
  });

  it('rejects a non-PNG signature at the IHDR guard', async () => {
    const valid = await payloadForRejection();
    const decode = vi.fn(
      async () => ({ width: 32, height: 24, data: new Uint8ClampedArray(32 * 24 * 4) }),
    );
    const result = await parseProjectFile(
      fileLike(
        JSON.stringify({
          ...valid,
          bitmap: { ...valid.bitmap, png: bytesToBase64(new Uint8Array(64).fill(7)) },
        }),
      ),
      { ...codec, decode },
      { id: 'not-png', now: 10, existingNames: [] },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/png/i);
    expect(decode).not.toHaveBeenCalled();
  });

  it('sourceHash must be 1-8 hex characters', async () => {
    const valid = await payloadForRejection();
    const options = { id: 'hash-check', now: 10, existingNames: [] };
    for (const bad of ['', 'zz', '123456789']) {
      const result = await parseProjectFile(
        fileLike(JSON.stringify({ ...valid, sourceHash: bad })),
        codec,
        options,
      );
      expect(result.ok, `sourceHash ${JSON.stringify(bad)}`).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/hash/i);
    }

    const accepted = await parseProjectFile(
      fileLike(JSON.stringify({ ...valid, sourceHash: 'deadbeef' })),
      codec,
      options,
    );
    expect(accepted.ok).toBe(true);
    if (accepted.ok) expect(accepted.project.sourceHash).toBe('deadbeef');
  });

  it('exports from in-memory state when storage is unavailable', async () => {
    const store = makeStore(null);
    await store.loadImage(sampleBitmap(32, 24, 10), { name: 'memory.png' });
    store.toggleCell(1, 2);
    await store.flushNow();
    expect(store.getState().memoryOnly).toBe(true);

    const exported = await store.exportProject();
    expect(exported.ok).toBe(true);
    if (exported.ok) {
      const parsed = await parseProjectFile(fileLike(exported.text), codec, {
        id: 'other',
        now: 1,
        existingNames: [],
      });
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect([...parsed.completed]).toEqual(['1,2']);
    }
  });
});

/** Valid PNG signature + IHDR chunk carrying the given dimensions. */
function pngWithIhdr(width: number, height: number): string {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = 8;
  bytes[25] = 6;
  view.setUint32(29, 0);
  return bytesToBase64(bytes);
}

async function encodeBitmap(bitmap: ReturnType<typeof sampleBitmap>): Promise<string> {
  const blob = await codec.encode(bitmap);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return bytesToBase64(bytes);
}

async function payloadForRejection(): Promise<ProjectFilePayload> {
  const db = await makeDb();
  const store = makeStore(db);
  await store.loadImage(sampleBitmap(32, 24, 11), { name: 'valid.png' });
  store.setCols(32);
  store.toggleCell(1, 1);
  await store.flushNow();
  return payloadFromStore(store);
}
