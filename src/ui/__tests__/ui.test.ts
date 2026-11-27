import { afterEach, describe, expect, it, vi } from 'vitest';

import shellHtml from '../../../index.html?raw';

import { getPalette } from '../../engine/palettes';
import { createGridStore, type StorageLike } from '../../store/gridStore';
import {
  type EngineClient,
  type MatchedGrid,
  type SourceImage,
} from '../../types/pipeline';
import { mountDropZone, readImageFile } from '../dropZone';
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

function fixedClient(): EngineClient {
  return {
    async process(request) {
      const cols = request.settings.cols;
      const rows = Math.max(8, Math.round(cols * (request.image.height / request.image.width)));
      const count = cols * rows;
      const grid: MatchedGrid = {
        cols,
        rows,
        ri: new Uint8Array(count).fill(1),
        gi: new Uint8Array(count).fill(2),
        bi: new Uint8Array(count).fill(4),
        deltaE: new Float32Array(count).fill(4.2),
        target: new Uint8ClampedArray(count * 3).fill(10),
        palette: getPalette(request.settings.palette),
        sourceHash: 'testhash',
      };
      return { grid };
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

/** Build a pointer event even on jsdom builds without PointerEvent. */
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

/** jsdom performs no layout, so pin the stage box for deterministic cells. */
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

async function makeStore(): Promise<ReturnType<typeof createGridStore>> {
  const store = createGridStore({ client: fixedClient(), storage: new MemoryStorage() });
  await store.loadImage(sourceImage());
  return store;
}

const disposers: Array<() => void> = [];

afterEach(() => {
  while (disposers.length > 0) {
    disposers.pop()?.();
  }
  document.body.innerHTML = '';
});

describe('UI modules bind to the static shell', () => {
  it('finds every data-ui hook and renders the initial progress readout', async () => {
    loadShell();
    const store = await makeStore();

    disposers.push(mountGridCanvas(document.body, store));
    disposers.push(mountInspectorSidebar(document.body, store));
    disposers.push(mountTopBar(document.body, store));
    disposers.push(mountSettingsPopover(document.body, store));
    disposers.push(mountDropZone(document.body, store));

    expect(document.querySelector('[data-ui="grid-canvas"]')).not.toBeNull();
    expect(document.querySelector('[data-ui="progress"]')?.textContent).toBe('0 / 2352 done');
    expect(document.querySelector('[data-ui="grid-meta"]')?.textContent).toContain('56 × 42 grid');
  });

  it('renders the 5-state legend from the shell', async () => {
    loadShell();
    const store = await makeStore();
    disposers.push(mountInspectorSidebar(document.body, store));

    const legend = document.querySelector('[data-ui="legend"]');
    expect(legend).not.toBeNull();
    expect(legend?.textContent).toContain('White Paper');
    expect(legend?.textContent).toContain('Solid Black');
    expect(document.querySelectorAll('[data-ui="legend-line"]')).toHaveLength(5);
  });
});

describe('Settings popover', () => {
  it('is closed by default and toggles from the trigger', async () => {
    loadShell();
    const store = await makeStore();
    disposers.push(mountSettingsPopover(document.body, store));

    const popover = document.querySelector<HTMLElement>('[data-ui="settings-popover"]')!;
    const trigger = document.querySelector<HTMLElement>('[data-ui="settings-trigger"]')!;

    expect(popover.classList.contains('open')).toBe(false);
    trigger.click();
    expect(popover.classList.contains('open')).toBe(true);
  });

  it('closes on an outside click', async () => {
    loadShell();
    const store = await makeStore();
    disposers.push(mountSettingsPopover(document.body, store));

    const popover = document.querySelector<HTMLElement>('[data-ui="settings-popover"]')!;
    const trigger = document.querySelector<HTMLElement>('[data-ui="settings-trigger"]')!;
    trigger.click();
    expect(popover.classList.contains('open')).toBe(true);

    document.body.click();
    expect(popover.classList.contains('open')).toBe(false);
  });

  it('keeps the popover open when clicking inside it', async () => {
    loadShell();
    const store = await makeStore();
    disposers.push(mountSettingsPopover(document.body, store));

    const popover = document.querySelector<HTMLElement>('[data-ui="settings-popover"]')!;
    document.querySelector<HTMLElement>('[data-ui="settings-trigger"]')!.click();
    popover.click();
    expect(popover.classList.contains('open')).toBe(true);
  });

  it('reflects settings changes through the store', async () => {
    loadShell();
    const store = await makeStore();
    disposers.push(mountSettingsPopover(document.body, store));

    const cols = document.querySelector<HTMLInputElement>('[data-ui="cols-input"]')!;
    cols.value = '32';
    cols.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => expect(store.getState().settings.cols).toBe(32));
    expect(document.querySelector('[data-ui="cols-value"]')?.textContent).toBe('32 px');

    const palette = document.querySelector<HTMLSelectElement>('[data-ui="palette-input"]')!;
    palette.value = 'vibrant';
    palette.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(store.getState().settings.palette).toBe('vibrant'));
  });
});

describe('Pixel inspector sidebar', () => {
  it('shows the empty state before any hover', async () => {
    loadShell();
    const store = await makeStore();
    disposers.push(mountInspectorSidebar(document.body, store));

    const empty = document.querySelector<HTMLElement>('[data-ui="empty-state"]')!;
    const active = document.querySelector<HTMLElement>('[data-ui="inspector-active"]')!;
    expect(empty.style.display).not.toBe('none');
    expect(active.classList.contains('visible')).toBe(false);
    expect(empty.textContent).toContain('Hover over any cell');
  });

  it('renders the live 3-stripe readout for a hovered cell', async () => {
    loadShell();
    const store = await makeStore();
    disposers.push(mountInspectorSidebar(document.body, store));

    store.setHovered({ col: 11, row: 7 });

    expect(document.querySelector('[data-ui="empty-state"]')?.getAttribute('style')).toContain(
      'display: none',
    );
    expect(document.querySelector('[data-ui="inspector-active"]')?.classList.contains('visible')).toBe(
      true,
    );
    expect(document.querySelector('[data-ui="coord"]')?.textContent).toBe('X12, Y8');
    expect(document.querySelector('[data-ui="status"]')?.textContent).toBe('To Do');
    expect(document.querySelector('[data-ui="label-r"]')?.textContent).toBe('Full Color');
    expect(document.querySelector('[data-ui="label-g"]')?.textContent).toBe('Light Black');
    expect(document.querySelector('[data-ui="label-b"]')?.textContent).toBe('Solid Black');
    expect(document.querySelector('[data-ui="sub-r"]')?.textContent).toBe('● Red Stripe');
    expect(document.querySelector('[data-ui="sub-g"]')?.textContent).toBe('◐ Green Stripe');
    expect(document.querySelector('[data-ui="sub-b"]')?.textContent).toBe('■ Blue Stripe');
    expect(document.querySelector('[data-ui="delta"]')?.textContent).toBe('ΔE 4.2');
    expect(document.querySelector('[data-ui="hint"]')?.textContent).toBe('Click cell to mark done');
    expect(document.querySelector<HTMLElement>('[data-ui="bar-r"]')?.style.background).toContain(
      'rgb(198, 46, 42)',
    );
  });

  it('updates the status pill the moment the hovered cell is completed', async () => {
    loadShell();
    const store = await makeStore();
    disposers.push(mountInspectorSidebar(document.body, store));

    store.setHovered({ col: 11, row: 7 });
    store.toggleCell(11, 7);

    const status = document.querySelector<HTMLElement>('[data-ui="status"]')!;
    expect(status.textContent).toBe('Completed');
    expect(status.classList.contains('done')).toBe(true);
    expect(document.querySelector('[data-ui="hint"]')?.textContent).toBe('Click cell to undo');
  });

  it('unsubscribes when disposed', async () => {
    loadShell();
    const store = await makeStore();
    const dispose = mountInspectorSidebar(document.body, store);
    dispose();

    store.setHovered({ col: 2, row: 2 });
    expect(document.querySelector('[data-ui="coord"]')?.textContent).toBe('X1, Y1');
  });
});

describe('Pixel Grid / Stripes view toggle', () => {
  it('switches view mode and active styling cleanly', async () => {
    loadShell();
    const store = await makeStore();
    disposers.push(mountTopBar(document.body, store));

    const gridButton = document.querySelector<HTMLElement>('[data-ui="mode-grid"]')!;
    const stripesButton = document.querySelector<HTMLElement>('[data-ui="mode-stripes"]')!;
    expect(gridButton.classList.contains('active')).toBe(true);

    stripesButton.click();
    expect(store.getState().viewMode).toBe('stripes');
    expect(stripesButton.classList.contains('active')).toBe(true);
    expect(gridButton.classList.contains('active')).toBe(false);

    gridButton.click();
    expect(store.getState().viewMode).toBe('grid');
    expect(gridButton.classList.contains('active')).toBe(true);
  });

  it('resets every completed cell from the top bar', async () => {
    loadShell();
    const store = await makeStore();
    disposers.push(mountTopBar(document.body, store));

    store.toggleCell(1, 1);
    store.toggleCell(2, 2);
    document.querySelector<HTMLElement>('[data-ui="reset"]')!.click();

    expect(store.getState().completedCells.size).toBe(0);
    expect(document.querySelector('[data-ui="progress"]')?.textContent).toBe('0 / 2352 done');
  });
});

describe('Drop zone', () => {
  it('ignores non-image files without clearing the current grid', async () => {
    loadShell();
    const store = await makeStore();
    disposers.push(mountDropZone(document.body, store));

    const result = await readImageFile(new File(['hello'], 'notes.txt', { type: 'text/plain' }));
    expect(result).toBeNull();
    expect(store.getState().grid?.cols).toBe(56);
  });

  it('ignores non-image drops and clears the dragover state', async () => {
    loadShell();
    const store = await makeStore();
    disposers.push(mountDropZone(document.body, store));

    const stage = document.querySelector<HTMLElement>('[data-ui="stage"]')!;
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', {
      value: { files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] },
    });
    stage.dispatchEvent(drop);

    expect(stage.classList.contains('dragover')).toBe(false);
    expect(store.getState().grid?.cols).toBe(56);
  });
});

describe('Touch inspection', () => {
  it('keeps the sidebar readout visible after a touch tap, then clears on mouse leave', async () => {
    loadShell();
    const store = await makeStore();
    mockStageLayout();
    disposers.push(mountGridCanvas(document.body, store));
    disposers.push(mountInspectorSidebar(document.body, store));

    const canvas = document.querySelector<HTMLCanvasElement>('[data-ui="grid-canvas"]')!;
    const active = document.querySelector<HTMLElement>('[data-ui="inspector-active"]')!;
    const empty = document.querySelector<HTMLElement>('[data-ui="empty-state"]')!;
    const tap = { ...cellCenter(10, 10), pointerType: 'touch' };

    // A touch tap emits down -> up -> out/leave in real browsers.
    canvas.dispatchEvent(pointerEvent('pointerdown', tap));
    window.dispatchEvent(pointerEvent('pointerup', tap));
    canvas.dispatchEvent(pointerEvent('pointerleave', tap));

    expect(store.getState().hoveredCell).toEqual({ col: 10, row: 10 });
    expect(store.getState().completedCells.size).toBe(0);
    expect(document.querySelector('[data-ui="coord"]')?.textContent).toBe('X11, Y11');
    expect(document.querySelector('[data-ui="status"]')?.textContent).toBe('To Do');
    expect(active.classList.contains('visible')).toBe(true);
    expect(empty.style.display).toBe('none');

    // A later mouse interaction resumes normal hover clearing.
    const mouseMove = { ...cellCenter(5, 5), pointerType: 'mouse' };
    canvas.dispatchEvent(pointerEvent('pointermove', mouseMove));
    expect(document.querySelector('[data-ui="coord"]')?.textContent).toBe('X6, Y6');

    canvas.dispatchEvent(pointerEvent('pointerleave', { ...mouseMove, clientX: 0, clientY: 0 }));
    expect(store.getState().hoveredCell).toBeNull();
    expect(active.classList.contains('visible')).toBe(false);
    expect(empty.style.display).not.toBe('none');
  });

  it('still clears the hover on a mouse-only pointerleave', async () => {
    loadShell();
    const store = await makeStore();
    mockStageLayout();
    disposers.push(mountGridCanvas(document.body, store));
    disposers.push(mountInspectorSidebar(document.body, store));

    const canvas = document.querySelector<HTMLCanvasElement>('[data-ui="grid-canvas"]')!;
    const active = document.querySelector<HTMLElement>('[data-ui="inspector-active"]')!;
    const point = { ...cellCenter(3, 4), pointerType: 'mouse' };

    canvas.dispatchEvent(pointerEvent('pointerdown', point));
    window.dispatchEvent(pointerEvent('pointerup', point));
    canvas.dispatchEvent(pointerEvent('pointermove', point));
    canvas.dispatchEvent(pointerEvent('pointerleave', point));

    expect(store.getState().hoveredCell).toBeNull();
    expect(active.classList.contains('visible')).toBe(false);
  });
});
