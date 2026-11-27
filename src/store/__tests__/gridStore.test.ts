import { describe, expect, it, vi } from 'vitest';

import { getPalette } from '../../engine/palettes';
import {
  DEFAULT_SETTINGS,
  type EngineClient,
  type MatchedGrid,
  type ShadingStateId,
  type SourceImage,
} from '../../types/pipeline';
import { createGridStore, type StorageLike } from '../gridStore';

function image(width: number, height: number, seed = 0): SourceImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = (i + seed) % 256;
    data[i * 4 + 1] = (i * 3 + seed) % 256;
    data[i * 4 + 2] = (i * 7 + seed) % 256;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

function makeGrid(
  cols: number,
  rows: number,
  hash = `h${cols}x${rows}`,
): MatchedGrid {
  const count = cols * rows;
  const ri = new Uint8Array(count);
  const gi = new Uint8Array(count);
  const bi = new Uint8Array(count);
  const target = new Uint8ClampedArray(count * 3);
  for (let i = 0; i < count; i += 1) {
    ri[i] = (i % 5) as ShadingStateId;
    gi[i] = ((i + 1) % 5) as ShadingStateId;
    bi[i] = ((i + 2) % 5) as ShadingStateId;
    target[i * 3] = 10;
    target[i * 3 + 1] = 20;
    target[i * 3 + 2] = 30;
  }
  return {
    cols,
    rows,
    ri,
    gi,
    bi,
    deltaE: new Float32Array(count).fill(1.5),
    target,
    palette: getPalette('reflective'),
    sourceHash: hash,
  };
}

function fakeClient(): EngineClient {
  return {
    async process(request) {
      const cols = request.settings.cols;
      const rows = Math.max(8, Math.round(cols * (request.image.height / request.image.width)));
      return { grid: makeGrid(cols, rows, `h${cols}x${rows}-${request.image.data.length}`) };
    },
  };
}

class MemoryStorage implements StorageLike {
  readonly map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  keys(): string[] {
    return [...this.map.keys()];
  }
}

const throwingStorage: StorageLike = {
  getItem() {
    throw new Error('SecurityError: storage denied');
  },
  setItem() {
    throw new Error('SecurityError: storage denied');
  },
  removeItem() {
    throw new Error('SecurityError: storage denied');
  },
};

describe('createGridStore', () => {
  it('starts with the specified default settings and no grid', () => {
    const store = createGridStore({ client: fakeClient() });
    const state = store.getState();

    expect(state.settings).toEqual(DEFAULT_SETTINGS);
    expect(state.settings).toMatchObject({
      cols: 56,
      contrast: 1.45,
      palette: 'reflective',
      dither: true,
      ditherStrength: 0.85,
    });
    expect(state.grid).toBeNull();
    expect(state.viewMode).toBe('grid');
    expect(state.hoveredCell).toBeNull();
    expect(state.completedCells.size).toBe(0);
  });

  it('toggles a single cell on click and notifies subscribers', async () => {
    const store = createGridStore({ client: fakeClient(), storage: new MemoryStorage() });
    await store.loadImage(image(320, 240));

    const listener = vi.fn();
    store.subscribe(listener);

    store.toggleCell(10, 5);
    expect(store.getState().completedCells.has('10,5')).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    store.toggleCell(10, 5);
    expect(store.getState().completedCells.has('10,5')).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('paints a drag gesture in one consistent direction', async () => {
    const store = createGridStore({ client: fakeClient(), storage: new MemoryStorage() });
    await store.loadImage(image(320, 240));

    store.paintCell(0, 0, true);
    store.paintCell(1, 0, true);
    store.paintCell(2, 0, true);
    expect(store.getState().completedCells.size).toBe(3);

    // A second drag starting on a completed cell paints the undo direction.
    store.paintCell(2, 0, false);
    store.paintCell(1, 0, false);
    expect([...store.getState().completedCells]).toEqual(['0,0']);
  });

  it('clears every completed cell on reset', async () => {
    const storage = new MemoryStorage();
    const store = createGridStore({ client: fakeClient(), storage });
    await store.loadImage(image(320, 240));

    store.toggleCell(1, 1);
    store.toggleCell(2, 2);
    store.resetCompleted();

    expect(store.getState().completedCells.size).toBe(0);
    const values = storage.keys().map((key) => storage.getItem(key));
    expect(values).toContain(JSON.stringify([]));
  });

  it('prunes out-of-bounds completions when the grid width shrinks', async () => {
    const store = createGridStore({ client: fakeClient(), storage: new MemoryStorage() });
    await store.loadImage(image(320, 240));

    store.toggleCell(55, 41);
    store.toggleCell(10, 5);
    expect(store.getState().completedCells.size).toBe(2);

    await store.setCols(16);
    const state = store.getState();
    expect(state.grid?.cols).toBe(16);
    expect(state.grid?.rows).toBe(12);
    expect(state.completedCells.has('55,41')).toBe(false);
    expect(state.completedCells.has('10,5')).toBe(true);
  });

  it('unsubscribes cleanly', async () => {
    const store = createGridStore({ client: fakeClient(), storage: new MemoryStorage() });
    await store.loadImage(image(320, 240));

    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();

    store.toggleCell(3, 3);
    expect(listener).not.toHaveBeenCalled();
  });

  it('persists completions under the rgb-pencil:v1 fingerprint key and restores them', async () => {
    const storage = new MemoryStorage();
    const first = createGridStore({ client: fakeClient(), storage });
    await first.loadImage(image(320, 240));
    first.toggleCell(4, 4);
    first.toggleCell(5, 6);
    first.toggleCell(7, 8);

    const keys = storage.keys();
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^rgb-pencil:v1:/);

    const second = createGridStore({ client: fakeClient(), storage });
    await second.loadImage(image(320, 240));

    expect([...second.getState().completedCells].sort()).toEqual(['4,4', '5,6', '7,8']);
  });

  it('falls back to in-memory progress when localStorage throws', async () => {
    const store = createGridStore({ client: fakeClient(), storage: throwingStorage });
    await store.loadImage(image(320, 240));

    expect(() => store.toggleCell(1, 2)).not.toThrow();
    expect(store.getState().completedCells.has('1,2')).toBe(true);

    expect(() => store.resetCompleted()).not.toThrow();
    expect(store.getState().completedCells.size).toBe(0);
  });

  it('clears previous completions when a different image is loaded', async () => {
    const store = createGridStore({ client: fakeClient(), storage: new MemoryStorage() });
    await store.loadImage(image(320, 240));
    store.toggleCell(9, 9);

    await store.loadImage(image(160, 120, 17));
    expect(store.getState().completedCells.size).toBe(0);
  });

  it('tracks view mode and the hovered cell', async () => {
    const store = createGridStore({ client: fakeClient(), storage: new MemoryStorage() });
    await store.loadImage(image(320, 240));

    store.setViewMode('stripes');
    expect(store.getState().viewMode).toBe('stripes');

    store.setHovered({ col: 3, row: 4 });
    expect(store.getState().hoveredCell).toEqual({ col: 3, row: 4 });

    store.setHovered(null);
    expect(store.getState().hoveredCell).toBeNull();
  });

  it('clamps width changes into the 16-96 range', async () => {
    const store = createGridStore({ client: fakeClient(), storage: new MemoryStorage() });
    await store.loadImage(image(320, 240));

    await store.setCols(4);
    expect(store.getState().settings.cols).toBe(16);

    await store.setCols(400);
    expect(store.getState().settings.cols).toBe(96);
  });

  it('tracks pending and idle pipeline status and a monotonic latestJobId', async () => {
    const store = createGridStore({ client: fakeClient(), storage: new MemoryStorage() });
    expect(store.getState().status).toBe('idle');
    expect(store.getState().latestJobId).toBe(0);

    const loading = store.loadImage(image(320, 240));
    expect(store.getState().status).toBe('pending');
    const firstJobId = store.getState().latestJobId;
    expect(firstJobId).toBeGreaterThan(0);

    await loading;
    expect(store.getState().status).toBe('idle');
    expect(store.getState().latestJobId).toBeGreaterThanOrEqual(firstJobId);

    await store.setCols(64);
    expect(store.getState().status).toBe('idle');
    expect(store.getState().latestJobId).toBeGreaterThan(firstJobId);
  });

  it('keeps the last good grid and surfaces an error when a run fails', async () => {
    let calls = 0;
    const flaky: EngineClient = {
      async process(request) {
        calls += 1;
        if (calls > 1) throw new Error('worker crashed');
        const cols = request.settings.cols;
        return { grid: makeGrid(cols, 42, 'good') };
      },
    };
    const store = createGridStore({ client: flaky, storage: new MemoryStorage() });
    await store.loadImage(image(320, 240));
    const goodGrid = store.getState().grid;
    expect(goodGrid).not.toBeNull();

    await store.setCols(64);
    const state = store.getState();
    expect(state.grid).toBe(goodGrid);
    expect(state.status).toBe('error');
    expect(state.error).toContain('worker crashed');
  });

  it('prepares the working bitmap once per image, bounded to 512 px', async () => {
    const seen: Array<{ width: number; height: number }> = [];
    const recording: EngineClient = {
      async process(request) {
        seen.push({ width: request.image.width, height: request.image.height });
        return { grid: makeGrid(request.settings.cols, 12, 'bounded') };
      },
    };
    const store = createGridStore({ client: recording, storage: new MemoryStorage() });
    const photo: SourceImage = {
      width: 4032,
      height: 3024,
      data: new Uint8ClampedArray(4032 * 3024 * 4),
    };

    await store.loadImage(photo);
    expect(seen[0]).toEqual({ width: 512, height: 384 });

    await store.setCols(64);
    expect(seen[1]).toEqual({ width: 512, height: 384 });
    expect(seen).toHaveLength(2);
  });

  it('invalidates client work when a new image is loaded', async () => {
    let invalidations = 0;
    const client: EngineClient = {
      ...fakeClient(),
      invalidate() {
        invalidations += 1;
      },
    };
    const store = createGridStore({ client, storage: new MemoryStorage() });

    await store.loadImage(image(320, 240));
    expect(invalidations).toBe(1);
    await store.loadImage(image(160, 120, 17));
    expect(invalidations).toBe(2);
  });

  it('tracks the last pointer type and clamps export options', async () => {
    const store = createGridStore({ client: fakeClient(), storage: new MemoryStorage() });
    expect(store.getState().lastPointerType).toBe('mouse');
    store.setLastPointerType('touch');
    expect(store.getState().lastPointerType).toBe('touch');
    store.setLastPointerType('pen');
    expect(store.getState().lastPointerType).toBe('pen');

    expect(store.getState().exportOptions).toEqual({
      pageSize: 'a4',
      includeTemplate: false,
      templateCellMm: 6,
    });
    store.setExportOptions({ pageSize: 'letter', includeTemplate: true, templateCellMm: 99 });
    expect(store.getState().exportOptions).toEqual({
      pageSize: 'letter',
      includeTemplate: true,
      templateCellMm: 12,
    });
    store.setExportOptions({ templateCellMm: 1 });
    expect(store.getState().exportOptions.templateCellMm).toBe(4);
  });
});
