import { afterEach, describe, expect, it, vi } from 'vitest';

import shellHtml from '../../../index.html?raw';

import { createLocalEngineClient } from '../../engine/engineClient';
import { getPalette } from '../../engine/palettes';
import { createGridStore, type StorageLike } from '../../store/gridStore';
import {
  type EngineClient,
  type MatchedGrid,
  type PipelineRequest,
  type SourceImage,
} from '../../types/pipeline';
import { mountGridCanvas } from '../gridCanvas';
import { mountInspectorSidebar } from '../inspectorSidebar';
import { mountSettingsPopover } from '../settingsPopover';
import { mountTopBar } from '../topBar';

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
}

function sourceImage(): SourceImage {
  const width = 320;
  const height = 240;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = 100;
    data[i * 4 + 1] = 120;
    data[i * 4 + 2] = 140;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

function makeGrid(cols: number, rows: number): MatchedGrid {
  const count = cols * rows;
  return {
    cols,
    rows,
    ri: new Uint8Array(count).fill(1),
    gi: new Uint8Array(count).fill(2),
    bi: new Uint8Array(count).fill(4),
    deltaE: new Float32Array(count).fill(4.2),
    target: new Uint8ClampedArray(count * 3).fill(10),
    palette: getPalette('reflective'),
    sourceHash: 'deadbeef',
  };
}

function recordingClient(requests: PipelineRequest[]): EngineClient {
  return {
    async process(request) {
      requests.push(request);
      const cols = request.settings.cols;
      const rows = Math.max(8, Math.round(cols * (request.image.height / request.image.width)));
      return { grid: makeGrid(cols, rows) };
    },
  };
}

function loadShell(): void {
  const start = shellHtml.indexOf('<body>');
  const end = shellHtml.indexOf('</body>');
  if (start === -1 || end === -1) throw new Error('index.html is missing a body');
  const body = shellHtml
    .slice(start + '<body>'.length, end)
    .replace(/<script[\s\S]*?<\/script>/g, '');
  document.body.innerHTML = body;
}

function byUi<T extends Element = HTMLElement>(name: string): T | null {
  return document.querySelector<T>(`[data-ui="${name}"]`);
}

function mockStageLayout(width = 1024, height = 800): void {
  const stage = byUi('stage');
  if (!stage) throw new Error('Missing stage');
  stage.getBoundingClientRect = () =>
    ({
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

interface FakeCanvas {
  fillRecords: Array<{ style: string; x: number; y: number; width: number; height: number }>;
}

function installCanvas(): FakeCanvas {
  const fillRecords: FakeCanvas['fillRecords'] = [];
  const context: Record<string, unknown> = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    imageSmoothingEnabled: true,
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    putImageData: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    createImageData: vi.fn((width: number, height: number) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    })),
  };
  context.fillRect = vi.fn((x: number, y: number, width: number, height: number) => {
    fillRecords.push({ style: String(context.fillStyle), x, y, width, height });
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((
    contextId: string,
  ) => (contextId === '2d' ? context : null)) as never);
  return { fillRecords };
}

function installFrames(): { flush(): void } {
  const callbacks: FrameRequestCallback[] = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callbacks.push(callback);
    return callbacks.length;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  return {
    flush() {
      const queued = callbacks.splice(0, callbacks.length);
      for (const callback of queued) callback(0);
    },
  };
}

function installMatchMedia(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function pointerEvent(type: string, clientX: number, clientY: number): Event {
  if (typeof PointerEvent === 'function') {
    return new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      pointerType: 'mouse',
    });
  }
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
    pointerType: { value: 'mouse' },
  });
  return event;
}

async function makeStore(
  client: EngineClient = recordingClient([]),
): Promise<ReturnType<typeof createGridStore>> {
  const store = createGridStore({ client, storage: new MemoryStorage() });
  await store.loadImage(sourceImage());
  return store;
}

const disposers: Array<() => void> = [];

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function filterInput(name: string): HTMLInputElement {
  const control = byUi<HTMLInputElement>(name);
  if (!control) throw new Error(`Missing ${name}`);
  return control;
}

function filterSelect(name: string): HTMLSelectElement {
  const control = byUi<HTMLSelectElement>(name);
  if (!control) throw new Error(`Missing ${name}`);
  return control;
}

describe('experimental filters settings section', () => {
  it('is collapsed with neutral defaults and no active filter', async () => {
    loadShell();
    const store = await makeStore();
    disposers.push(mountSettingsPopover(document.body, store));

    const section = byUi<HTMLDetailsElement>('filters-section');
    expect(section).not.toBeNull();
    expect(section!.open).toBe(false);
    expect(filterSelect('filters-preset').value).toBe('none');
    expect(filterSelect('filters-metric').value).toBe('de76');
    expect(filterSelect('filters-error-limit').value).toBe('off');
    expect(filterInput('filters-chroma').value).toBe('1');
    expect(filterInput('filters-gain-r').value).toBe('1');
    expect(filterInput('filters-gain-g').value).toBe('1');
    expect(filterInput('filters-gain-b').value).toBe('1');
    expect(filterInput('filters-black-point').value).toBe('0');
    expect(byUi<HTMLButtonElement>('filters-reset')!.disabled).toBe(true);
    expect(store.getState().filtersActive).toBe(false);
  });

  it('applies a preset to every control and issues one run', async () => {
    loadShell();
    const requests: PipelineRequest[] = [];
    const store = await makeStore(recordingClient(requests));
    disposers.push(mountSettingsPopover(document.body, store));
    const before = requests.length;

    const preset = filterSelect('filters-preset');
    preset.value = 'gamut-soft';
    preset.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(store.getState().filters.chromaScale).toBe(0.85));

    expect(requests.length).toBe(before + 1);
    expect(requests[requests.length - 1]!.filters).toMatchObject({
      chromaScale: 0.85,
      errorLimit: 0.1,
      metric: 'de2000',
      gains: [1, 1, 1],
      blackPoint: 0,
    });
    expect(filterInput('filters-chroma').value).toBe('0.85');
    expect(filterSelect('filters-error-limit').value).toBe('0.1');
    expect(filterSelect('filters-metric').value).toBe('de2000');
    expect(byUi('filters-preset-summary')?.textContent).toBe('Gamut-soft');
  });

  it('marks the preset Custom when a control is edited', async () => {
    loadShell();
    const store = await makeStore();
    disposers.push(mountSettingsPopover(document.body, store));

    const preset = filterSelect('filters-preset');
    preset.value = 'warm-bias';
    preset.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(store.getState().filters.blackPoint).toBe(25));

    const chroma = filterInput('filters-chroma');
    chroma.value = '0.95';
    chroma.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => expect(store.getState().filters.chromaScale).toBe(0.95));
    await vi.waitFor(() => expect(filterSelect('filters-preset').value).toBe('custom'));
    expect(byUi('filters-preset-summary')?.textContent).toBe('Custom');
  });

  it('restores defaults from Reset filters', async () => {
    loadShell();
    const store = await makeStore();
    disposers.push(mountSettingsPopover(document.body, store));

    const preset = filterSelect('filters-preset');
    preset.value = 'warm-bias';
    preset.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() =>
      expect(byUi('filters-preset-summary')?.textContent).toBe('Assessment: warm bias'),
    );
    byUi<HTMLButtonElement>('filters-reset')!.click();
    await vi.waitFor(() => expect(store.getState().filtersActive).toBe(false));
    expect(byUi('filters-preset-summary')?.textContent).toBe('None (baseline)');
    expect(byUi<HTMLButtonElement>('filters-reset')!.disabled).toBe(true);
  });

  it('locks every control while a cell is done', async () => {
    loadShell();
    const store = await makeStore();
    disposers.push(mountSettingsPopover(document.body, store));

    store.toggleCell(0, 0);
    await vi.waitFor(() => expect(filterSelect('filters-preset').disabled).toBe(true));
    for (const name of [
      'filters-metric',
      'filters-error-limit',
      'filters-chroma',
      'filters-gain-r',
      'filters-gain-g',
      'filters-gain-b',
      'filters-black-point',
      'filters-reset',
    ]) {
      expect(byUi<HTMLInputElement>(name)!.disabled).toBe(true);
    }
    expect(byUi('filters-lock-caption')?.hidden).toBe(false);

    store.resetCompleted();
    await vi.waitFor(() => expect(filterSelect('filters-preset').disabled).toBe(false));
    expect(byUi('filters-lock-caption')?.hidden).toBe(true);
  });
});

describe('experimental filters safety rails', () => {
  it('shows a dismissible banner, disables Export PDF, and re-enables after reset', async () => {
    loadShell();
    installMatchMedia();
    const store = await makeStore();
    disposers.push(mountTopBar(document.body, store));

    const exportButton = byUi<HTMLButtonElement>('export-pdf')!;
    expect(exportButton.disabled).toBe(false);
    expect(byUi('filters-banner')).toBeNull();

    await store.setFilters({ metric: 'de2000' });
    await vi.waitFor(() => expect(byUi('filters-banner')).not.toBeNull());
    expect(byUi('filters-banner')?.textContent).toContain('preview only');
    expect(exportButton.disabled).toBe(true);
    expect(exportButton.title).toContain('experimental colour filters');

    byUi<HTMLButtonElement>('banner-filters-dismiss')!.click();
    expect(byUi('filters-banner')).toBeNull();

    await store.setFilters({ chromaScale: 0.9 });
    await vi.waitFor(() => expect(byUi('filters-banner')).not.toBeNull());

    await store.resetFilters();
    await vi.waitFor(() => expect(byUi('filters-banner')).toBeNull());
    expect(exportButton.disabled).toBe(false);
  });

  it('blocks canvas clicks and shows the inspect-only inspector hint', async () => {
    loadShell();
    installMatchMedia();
    mockStageLayout();
    const frames = installFrames();
    installCanvas();
    const store = await makeStore();
    disposers.push(mountGridCanvas(document.body, store));
    disposers.push(mountInspectorSidebar(document.body, store));
    frames.flush();

    await store.setFilters({ blackPoint: 25 });
    await vi.waitFor(() => expect(store.getState().filtersActive).toBe(true));
    const canvas = byUi<HTMLCanvasElement>('grid-canvas')!;
    canvas.dispatchEvent(pointerEvent('pointerdown', 34 + 7.5, 28 + 7.5));
    canvas.dispatchEvent(pointerEvent('pointerup', 34 + 7.5, 28 + 7.5));
    expect(store.getState().completedCells.size).toBe(0);

    store.setHovered({ col: 12, row: 8 });
    store.setLastPointerType('mouse');
    await vi.waitFor(() =>
      expect(byUi('hint')?.textContent).toBe('Experimental filters — clicks inspect only'),
    );
    expect(byUi('coord')?.textContent).toBe('X13, Y9');
    expect(byUi<HTMLButtonElement>('mark-done')?.disabled).toBe(true);

    await store.resetFilters();
    canvas.dispatchEvent(pointerEvent('pointerdown', 34 + 7.5, 28 + 7.5));
    canvas.dispatchEvent(pointerEvent('pointerup', 34 + 7.5, 28 + 7.5));
    expect(store.getState().completedCells.size).toBe(1);
  });

  it('draws the post-filter target in Pixel Grid', async () => {
    loadShell();
    installMatchMedia();
    mockStageLayout();
    const frames = installFrames();
    const canvas = installCanvas();
    const store = await makeStore(createLocalEngineClient());
    disposers.push(mountGridCanvas(document.body, store));
    frames.flush();

    const baseline = store.getState().grid!;
    const baselineRgb = [
      baseline.target[0],
      baseline.target[1],
      baseline.target[2],
    ] as const;

    await store.setFilters({ gains: [1.2, 0.9, 0.8] });
    await vi.waitFor(() => expect(store.getState().filtersActive).toBe(true));
    frames.flush();

    const filtered = store.getState().grid!;
    const filteredRgb = [filtered.target[0], filtered.target[1], filtered.target[2]] as const;
    expect(filteredRgb).not.toEqual(baselineRgb);
    const expected = `rgb(${filteredRgb[0]}, ${filteredRgb[1]}, ${filteredRgb[2]})`;
    expect(
      canvas.fillRecords.some(
        (record) => record.style === expected && record.x === 34 && record.y === 28,
      ),
    ).toBe(true);
  });
});
