import { describe, expect, it, vi } from 'vitest';

import { getPalette } from '../../engine/palettes';
import {
  DEFAULT_SETTINGS,
  type EngineClient,
  type MatchedCell,
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

function fakeClient(): EngineClient {
  return {
    async process(request) {
      const cols = request.settings.cols;
      const rows = Math.max(8, Math.round(cols * (request.image.height / request.image.width)));
      const cells: MatchedCell[] = Array.from({ length: cols * rows }, (_, i) => ({
        ri: (i % 5) as ShadingStateId,
        gi: ((i + 1) % 5) as ShadingStateId,
        bi: ((i + 2) % 5) as ShadingStateId,
        rgb: [10, 20, 30],
        srgb: [40, 50, 60],
        deltaE: 1.5,
      }));
      return {
        grid: {
          cols,
          rows,
          cells,
          palette: getPalette(request.settings.palette),
          sourceHash: `h${cols}x${rows}-${request.image.data.length}`,
        },
      };
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
});
