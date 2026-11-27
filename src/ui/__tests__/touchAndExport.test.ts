import { afterEach, describe, expect, it, vi } from 'vitest';

import shellHtml from '../../../index.html?raw';

import { getPalette } from '../../engine/palettes';
import { createGridStore, type StorageLike } from '../../store/gridStore';
import {
  type EngineClient,
  type MatchedGrid,
  type SourceImage,
} from '../../types/pipeline';
import { mountGridCanvas } from '../gridCanvas';
import { mountInspectorSidebar } from '../inspectorSidebar';
import { mountSettingsPopover } from '../settingsPopover';
import { downloadPdf, mountTopBar } from '../topBar';

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
    sourceHash: 'testhash',
  };
}

function fixedClient(): EngineClient {
  return {
    async process(request) {
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

interface PointerInit {
  clientX: number;
  clientY: number;
  pointerType: string;
}

function pointerEvent(type: string, init: PointerInit): Event {
  if (typeof PointerEvent === 'function') {
    return new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: init.clientX,
      clientY: init.clientY,
      pointerType: init.pointerType,
    });
  }
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: init.clientX },
    clientY: { value: init.clientY },
    pointerType: { value: init.pointerType },
  });
  return event;
}

function mockStageLayout(width = 1024, height = 800): void {
  const stage = document.querySelector<HTMLElement>('[data-ui="stage"]');
  if (!stage) throw new Error('Missing [data-ui="stage"] element');
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

/** Centre of a cell for the 1024x800 stage mock (56x42 grid -> 15px cells). */
function cellCenter(col: number, row: number, cellSize = 15): PointerInit {
  return {
    clientX: 34 + col * cellSize + cellSize / 2,
    clientY: 28 + row * cellSize + cellSize / 2,
    pointerType: 'mouse',
  };
}

async function makeStore(client: EngineClient = fixedClient()): Promise<ReturnType<typeof createGridStore>> {
  const store = createGridStore({ client, storage: new MemoryStorage() });
  await store.loadImage(sourceImage());
  return store;
}

const disposers: Array<() => void> = [];

afterEach(() => {
  while (disposers.length > 0) disposers.pop()?.();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

function mountCanvasAndInspector(store: ReturnType<typeof createGridStore>): {
  canvas: HTMLCanvasElement;
  button: HTMLButtonElement;
} {
  mockStageLayout();
  disposers.push(mountGridCanvas(document.body, store));
  disposers.push(mountInspectorSidebar(document.body, store));
  const canvas = document.querySelector<HTMLCanvasElement>('[data-ui="grid-canvas"]')!;
  const button = document.querySelector<HTMLButtonElement>('[data-ui="mark-done"]')!;
  return { canvas, button };
}

describe('Touch interaction', () => {
  it('inspects without completing on tap and never paints on touch drag', async () => {
    loadShell();
    const store = await makeStore();
    const { canvas, button } = mountCanvasAndInspector(store);

    const tap = { ...cellCenter(10, 5), pointerType: 'touch' };
    canvas.dispatchEvent(pointerEvent('pointerdown', tap));
    window.dispatchEvent(pointerEvent('pointerup', tap));
    canvas.dispatchEvent(pointerEvent('pointerleave', tap));

    expect(store.getState().hoveredCell).toEqual({ col: 10, row: 5 });
    expect(store.getState().completedCells.size).toBe(0);
    expect(document.querySelector('[data-ui="coord"]')?.textContent).toBe('X11, Y6');
    expect(document.querySelector('[data-ui="status"]')?.textContent).toBe('To Do');
    expect(button.hidden).toBe(false);
    expect(button.style.display).not.toBe('none');
    expect(button.textContent).toBe('Mark Done');
    expect(button.style.minWidth).toBe('44px');
    expect(button.style.minHeight).toBe('44px');
    expect(button.closest('[data-ui="inspector"]')).not.toBeNull();

    canvas.dispatchEvent(pointerEvent('pointerdown', { ...cellCenter(1, 1), pointerType: 'touch' }));
    canvas.dispatchEvent(pointerEvent('pointermove', { ...cellCenter(2, 1), pointerType: 'touch' }));
    canvas.dispatchEvent(pointerEvent('pointermove', { ...cellCenter(3, 1), pointerType: 'touch' }));
    window.dispatchEvent(pointerEvent('pointerup', { ...cellCenter(3, 1), pointerType: 'touch' }));

    expect(store.getState().hoveredCell).toEqual({ col: 3, row: 1 });
    expect(store.getState().completedCells.size).toBe(0);
  });

  it('toggles the inspected cell with Mark Done / Undo and updates progress', async () => {
    loadShell();
    const store = await makeStore();
    const { canvas, button } = mountCanvasAndInspector(store);

    const tap = { ...cellCenter(10, 5), pointerType: 'touch' };
    canvas.dispatchEvent(pointerEvent('pointerdown', tap));
    window.dispatchEvent(pointerEvent('pointerup', tap));

    button.click();
    expect(store.getState().completedCells.has('10,5')).toBe(true);
    expect(button.textContent).toBe('Undo');
    expect(document.querySelector('[data-ui="status"]')?.textContent).toBe('Completed');

    disposers.push(mountTopBar(document.body, store));
    expect(document.querySelector('[data-ui="progress"]')?.textContent).toBe('1 / 2352 done');

    button.click();
    expect(store.getState().completedCells.has('10,5')).toBe(false);
    expect(button.textContent).toBe('Mark Done');
    expect(document.querySelector('[data-ui="progress"]')?.textContent).toBe('0 / 2352 done');
  });

  it('changes nothing on a double-tap', async () => {
    loadShell();
    const store = await makeStore();
    const { canvas } = mountCanvasAndInspector(store);
    const tap = { ...cellCenter(4, 4), pointerType: 'touch' };

    canvas.dispatchEvent(pointerEvent('pointerdown', tap));
    window.dispatchEvent(pointerEvent('pointerup', tap));
    canvas.dispatchEvent(pointerEvent('pointerdown', tap));
    window.dispatchEvent(pointerEvent('pointerup', tap));

    expect(store.getState().hoveredCell).toEqual({ col: 4, row: 4 });
    expect(store.getState().completedCells.size).toBe(0);
  });

  it('hides the Mark Done button after a mouse interaction and when nothing is inspected', async () => {
    loadShell();
    const store = await makeStore();
    const { canvas, button } = mountCanvasAndInspector(store);

    expect(button.hidden).toBe(true);
    expect(button.style.display).toBe('none');

    const tap = { ...cellCenter(6, 6), pointerType: 'touch' };
    canvas.dispatchEvent(pointerEvent('pointerdown', tap));
    window.dispatchEvent(pointerEvent('pointerup', tap));
    expect(button.hidden).toBe(false);
    expect(button.style.display).not.toBe('none');

    const hover = { ...cellCenter(7, 7), pointerType: 'mouse' };
    canvas.dispatchEvent(pointerEvent('pointermove', hover));
    expect(button.hidden).toBe(true);
    expect(button.style.display).toBe('none');
  });

  it('keeps mouse click, drag-paint, and re-click undo unchanged', async () => {
    loadShell();
    const store = await makeStore();
    const { canvas, button } = mountCanvasAndInspector(store);

    const point = { ...cellCenter(8, 8), pointerType: 'mouse' };
    canvas.dispatchEvent(pointerEvent('pointerdown', point));
    expect(store.getState().completedCells.has('8,8')).toBe(true);
    expect(button.hidden).toBe(true);
    expect(button.style.display).toBe('none');

    canvas.dispatchEvent(pointerEvent('pointerdown', point));
    expect(store.getState().completedCells.has('8,8')).toBe(false);

    canvas.dispatchEvent(pointerEvent('pointerdown', { ...cellCenter(2, 2), pointerType: 'mouse' }));
    canvas.dispatchEvent(pointerEvent('pointermove', { ...cellCenter(3, 2), pointerType: 'mouse' }));
    canvas.dispatchEvent(pointerEvent('pointermove', { ...cellCenter(4, 2), pointerType: 'mouse' }));
    window.dispatchEvent(pointerEvent('pointerup', { ...cellCenter(4, 2), pointerType: 'mouse' }));
    expect([...store.getState().completedCells].sort()).toEqual(['2,2', '3,2', '4,2']);
  });

  it('sets touch-action none on the canvas', async () => {
    loadShell();
    const store = await makeStore();
    const { canvas } = mountCanvasAndInspector(store);
    expect(canvas.style.touchAction).toBe('none');
  });
});

describe('Export PDF button', () => {
  it('is disabled before any grid exists', () => {
    loadShell();
    const store = createGridStore({ client: fixedClient(), storage: new MemoryStorage() });
    disposers.push(mountTopBar(document.body, store));

    const button = document.querySelector<HTMLButtonElement>('[data-ui="export-pdf"]')!;
    expect(button).not.toBeNull();
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe('Export PDF');
    expect(button.closest('.pill-group')).toBe(document.querySelectorAll('.pill-group')[1]);
  });

  it('is disabled and captions the readout while a run is pending', async () => {
    loadShell();
    let resolveGrid!: (grid: MatchedGrid) => void;
    const pendingClient: EngineClient = {
      process: () =>
        new Promise((resolve) => {
          resolveGrid = (grid) => resolve({ grid });
        }),
    };
    const store = createGridStore({ client: pendingClient, storage: new MemoryStorage() });
    const loading = store.loadImage(sourceImage());
    disposers.push(mountTopBar(document.body, store));

    const button = document.querySelector<HTMLButtonElement>('[data-ui="export-pdf"]')!;
    expect(store.getState().status).toBe('pending');
    await vi.waitFor(() => expect(typeof resolveGrid).toBe('function'));
    expect(button.disabled).toBe(true);
    expect(document.querySelector('[data-ui="progress"]')?.textContent).toBe('Updating…');

    resolveGrid(makeGrid(56, 42));
    await loading;

    expect(button.disabled).toBe(false);
    expect(document.querySelector('[data-ui="progress"]')?.textContent).toBe('0 / 2352 done');
  });

  it('shows a busy label while exporting and downloads the named PDF', async () => {
    loadShell();
    const store = await makeStore();
    let finishExport!: (bytes: Uint8Array) => void;
    const exportPdf = vi.fn(
      () =>
        new Promise<Uint8Array>((resolve) => {
          finishExport = resolve;
        }),
    );
    const download = vi.fn();
    disposers.push(mountTopBar(document.body, store, { exportPdf, download }));

    const button = document.querySelector<HTMLButtonElement>('[data-ui="export-pdf"]')!;
    button.click();
    await vi.waitFor(() => expect(button.textContent).toBe('Exporting…'));
    expect(button.disabled).toBe(true);
    expect(download).not.toHaveBeenCalled();

    finishExport(new Uint8Array([1, 2, 3]));
    await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect(download).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]), 'rgb-pencil-guide-56x42.pdf');
    expect(button.textContent).toBe('Export PDF');
    expect(button.disabled).toBe(false);
  });

  it('shows one dismissible inline error on failure without touching the grid', async () => {
    loadShell();
    const store = await makeStore();
    store.toggleCell(1, 1);
    const before = store.getState();
    const exportPdf = vi.fn().mockRejectedValue(new Error('render exploded'));
    const download = vi.fn();
    disposers.push(mountTopBar(document.body, store, { exportPdf, download }));

    const button = document.querySelector<HTMLButtonElement>('[data-ui="export-pdf"]')!;
    const error = document.querySelector<HTMLElement>('[data-ui="export-error"]')!;
    expect(error.hidden).toBe(true);

    button.click();
    await vi.waitFor(() => expect(error.hidden).toBe(false));
    expect(error.textContent).toContain('render exploded');
    expect(button.disabled).toBe(false);
    expect(download).not.toHaveBeenCalled();
    expect(store.getState().grid).toBe(before.grid);
    expect([...store.getState().completedCells]).toEqual([...before.completedCells]);
    expect(document.querySelector('[data-ui="progress"]')?.textContent).toBe('1 / 2352 done');

    document.querySelector<HTMLElement>('[data-ui="export-error-dismiss"]')!.click();
    expect(error.hidden).toBe(true);
  });
});

describe('Pipeline error line', () => {
  it('shows a dismissible error on failure, hides on success, and leaves the grid intact', async () => {
    loadShell();
    let fail = false;
    const client: EngineClient = {
      async process(request) {
        if (fail) throw new Error('pipeline exploded');
        const cols = request.settings.cols;
        const rows = Math.max(8, Math.round(cols * (request.image.height / request.image.width)));
        return { grid: makeGrid(cols, rows) };
      },
    };
    const store = createGridStore({ client, storage: new MemoryStorage() });
    await store.loadImage(sourceImage());
    store.toggleCell(1, 1);
    disposers.push(mountTopBar(document.body, store));

    const line = document.querySelector<HTMLElement>('[data-ui="pipeline-error"]')!;
    const text = document.querySelector<HTMLElement>('[data-ui="pipeline-error-text"]')!;
    expect(line.hidden).toBe(true);
    expect(line.style.display).toBe('none');

    fail = true;
    await store.setContrast(2.0, { confirmed: true });
    expect(store.getState().status).toBe('error');
    expect(line.hidden).toBe(false);
    expect(line.style.display).not.toBe('none');
    expect(text.textContent).toContain('pipeline exploded');
    // Last good grid and drawing progress survive the failure.
    expect(store.getState().grid?.cols).toBe(56);
    expect(document.querySelector('[data-ui="progress"]')?.textContent).toBe('1 / 2352 done');

    fail = false;
    await store.setContrast(1.2, { confirmed: true });
    expect(store.getState().status).toBe('idle');
    expect(line.hidden).toBe(true);
    expect(line.style.display).toBe('none');

    fail = true;
    await store.setContrast(1.8, { confirmed: true });
    expect(line.hidden).toBe(false);
    document.querySelector<HTMLElement>('[data-ui="pipeline-error-dismiss"]')!.click();
    expect(line.hidden).toBe(true);
    expect(line.style.display).toBe('none');
  });
});

describe('Export options', () => {
  it('defaults to A4, no template, and a 6 mm cell', async () => {
    loadShell();
    const store = await makeStore();
    disposers.push(mountSettingsPopover(document.body, store));

    const pageSize = document.querySelector<HTMLSelectElement>('[data-ui="page-size"]')!;
    const template = document.querySelector<HTMLInputElement>('[data-ui="template-toggle"]')!;
    const cell = document.querySelector<HTMLInputElement>('[data-ui="template-mm"]')!;

    expect(pageSize.value).toBe('a4');
    expect(template.checked).toBe(false);
    expect(cell.value).toBe('6');
    expect(store.getState().exportOptions).toEqual({
      pageSize: 'a4',
      includeTemplate: false,
      templateCellMm: 6,
    });
  });

  it('writes changed options back to the store', async () => {
    loadShell();
    const store = await makeStore();
    disposers.push(mountSettingsPopover(document.body, store));

    const pageSize = document.querySelector<HTMLSelectElement>('[data-ui="page-size"]')!;
    pageSize.value = 'letter';
    pageSize.dispatchEvent(new Event('change', { bubbles: true }));

    const template = document.querySelector<HTMLInputElement>('[data-ui="template-toggle"]')!;
    template.checked = true;
    template.dispatchEvent(new Event('change', { bubbles: true }));

    const cell = document.querySelector<HTMLInputElement>('[data-ui="template-mm"]')!;
    cell.value = '9';
    cell.dispatchEvent(new Event('input', { bubbles: true }));

    expect(store.getState().exportOptions).toEqual({
      pageSize: 'letter',
      includeTemplate: true,
      templateCellMm: 9,
    });
    expect(document.querySelector('[data-ui="template-mm-value"]')?.textContent).toBe('9 mm');
  });
});

describe('downloadPdf', () => {
  it('creates and revokes a Blob URL around a hidden anchor click', async () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:rgb-pencil');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });

    let clicked: HTMLAnchorElement | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked = this;
    });

    downloadPdf(new Uint8Array([1, 2, 3]), 'rgb-pencil-guide-56x42.pdf');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]![0] as Blob;
    expect(blob.type).toBe('application/pdf');
    expect(clicked).not.toBeNull();
    expect(clicked!.download).toBe('rgb-pencil-guide-56x42.pdf');
    expect(clicked!.href).toContain('blob:rgb-pencil');
    expect(document.body.contains(clicked!)).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:rgb-pencil');
  });

  it('stops the synthetic download click from reaching document handlers', () => {
    Object.defineProperty(URL, 'createObjectURL', {
      value: () => 'blob:rgb-pencil',
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: () => {},
      configurable: true,
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      this.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    const onDocumentClick = vi.fn();
    document.addEventListener('click', onDocumentClick);
    downloadPdf(new Uint8Array([1, 2, 3]), 'rgb-pencil-guide-56x42.pdf');
    document.removeEventListener('click', onDocumentClick);

    expect(onDocumentClick).not.toHaveBeenCalled();
  });
});
