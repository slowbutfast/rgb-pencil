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

function byUi<T extends Element = HTMLElement>(name: string): T | null {
  return document.querySelector<T>(`[data-ui="${name}"]`);
}

/** Dispatch a pointer-originated click (`detail > 0`) or a keyboard one (`0`). */
function pointerClick(target: Element, detail = 1): void {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail }));
}

function spaceKey(type: 'keydown' | 'keyup', init: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent(type, {
    key: ' ',
    code: 'Space',
    bubbles: true,
    cancelable: true,
    ...init,
  });
}

function setVisibility(value: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
}

interface FakeMediaQuery {
  queries: string[];
  setMatches(matches: boolean): void;
  fireChange(): void;
}

/** jsdom ships no `matchMedia`; the top bar decides hover vs tap through it. */
function installMatchMedia(initial: boolean): FakeMediaQuery {
  let matches = initial;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const legacyListeners = new Set<(event: MediaQueryListEvent) => void>();
  const queries: string[] = [];

  const media = vi.fn((query: string): MediaQueryList => {
    queries.push(query);
    return {
      get matches() {
        return matches;
      },
      media: query,
      onchange: null,
      addEventListener(type: string, listener: unknown) {
        if (type === 'change' && typeof listener === 'function') {
          listeners.add(listener as (event: MediaQueryListEvent) => void);
        }
      },
      removeEventListener(type: string, listener: unknown) {
        if (type === 'change') {
          listeners.delete(listener as (event: MediaQueryListEvent) => void);
        }
      },
      addListener(listener: (event: MediaQueryListEvent) => void) {
        legacyListeners.add(listener);
      },
      removeListener(listener: (event: MediaQueryListEvent) => void) {
        legacyListeners.delete(listener);
      },
      dispatchEvent() {
        return true;
      },
    } as unknown as MediaQueryList;
  });
  vi.stubGlobal('matchMedia', media);

  return {
    queries,
    setMatches(next) {
      matches = next;
    },
    fireChange() {
      const event = {
        matches,
        media: '(hover: hover) and (pointer: fine)',
      } as MediaQueryListEvent;
      for (const listener of [...listeners]) listener(event);
      for (const listener of [...legacyListeners]) listener(event);
    },
  };
}

interface FakeCanvas {
  ctx: CanvasRenderingContext2D;
  fillRecords: Array<{ style: string; x: number; y: number; width: number; height: number }>;
  fillRect: ReturnType<typeof vi.fn>;
  fillText: ReturnType<typeof vi.fn>;
  stroke: ReturnType<typeof vi.fn>;
  strokeRect: ReturnType<typeof vi.fn>;
  putImageData: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  getContext: ReturnType<typeof vi.fn>;
}

/** jsdom has no 2D implementation, so record the draw calls the canvas makes. */
function installCanvasContext(): FakeCanvas {
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
  const fillRect = vi.fn((x: number, y: number, width: number, height: number) => {
    fillRecords.push({ style: String(context.fillStyle), x, y, width, height });
  });
  context.fillRect = fillRect;

  const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
  getContext.mockImplementation(((contextId: string) =>
    contextId === '2d' ? context : null) as never);

  return {
    ctx: context as unknown as CanvasRenderingContext2D,
    fillRecords,
    fillRect,
    fillText: context.fillText as ReturnType<typeof vi.fn>,
    stroke: context.stroke as ReturnType<typeof vi.fn>,
    strokeRect: context.strokeRect as ReturnType<typeof vi.fn>,
    putImageData: context.putImageData as ReturnType<typeof vi.fn>,
    drawImage: context.drawImage as ReturnType<typeof vi.fn>,
    getContext: getContext as unknown as ReturnType<typeof vi.fn>,
  };
}

/** Deterministic animation frames: nothing draws until the test flushes. */
function installFrameQueue(): { flush(): void; pending(): number } {
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
    pending() {
      return callbacks.length;
    },
  };
}

function viewOptions(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-ui="view-mode-option"]'));
}

function optionFor(label: string): HTMLElement {
  const option = viewOptions().find((candidate) => candidate.textContent?.includes(label));
  if (!option) throw new Error(`Missing [data-ui="view-mode-option"] labelled ${label}`);
  return option;
}

afterEach(() => {
  while (disposers.length > 0) {
    disposers.pop()?.();
  }
  document.body.innerHTML = '';
  setVisibility('visible');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

describe('Top bar Reset', () => {
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

describe('View-mode dropdown', () => {
  it('renders one trigger and a fixed-order three-item menuitemradio list', async () => {
    loadShell();
    installMatchMedia(false);
    const store = await makeStore();
    disposers.push(mountTopBar(document.body, store));

    expect(document.querySelectorAll('[data-ui="view-mode-trigger"]')).toHaveLength(1);
    expect(byUi('mode-grid')).toBeNull();
    expect(byUi('mode-stripes')).toBeNull();

    const trigger = byUi('view-mode-trigger');
    expect(trigger).not.toBeNull();
    expect(trigger!.textContent).toContain('Pixel Grid');
    expect(trigger!.getAttribute('aria-expanded')).toBe('false');

    const dropdown = byUi('view-mode-dropdown');
    expect(dropdown).not.toBeNull();
    expect(dropdown!.getAttribute('role')).toBe('menu');

    const options = viewOptions();
    expect(options).toHaveLength(3);
    expect(options.map((option) => option.getAttribute('role'))).toEqual([
      'menuitemradio',
      'menuitemradio',
      'menuitemradio',
    ]);
    expect(options[0]!.textContent).toContain('Pixel Grid');
    expect(options[1]!.textContent).toContain('Stripes');
    expect(options[2]!.textContent).toContain('Squint');
    expect(options.map((option) => option.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
      'false',
    ]);
  });

  it('opens on tap when hover is unavailable and closes on a second tap', async () => {
    loadShell();
    installMatchMedia(false);
    const store = await makeStore();
    disposers.push(mountTopBar(document.body, store));

    const trigger = byUi('view-mode-trigger')!;
    const dropdown = byUi('view-mode-dropdown')!;

    pointerClick(trigger);
    expect(dropdown.classList.contains('open')).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    pointerClick(trigger);
    expect(dropdown.classList.contains('open')).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens on hover without click-toggle and re-evaluates on a media change', async () => {
    loadShell();
    const media = installMatchMedia(true);
    const store = await makeStore();
    disposers.push(mountTopBar(document.body, store));

    const menu = byUi('view-mode-menu')!;
    const trigger = byUi('view-mode-trigger')!;
    const dropdown = byUi('view-mode-dropdown')!;

    expect(media.queries.some((query) => query.includes('hover: hover'))).toBe(true);

    menu.dispatchEvent(new MouseEvent('mouseenter'));
    expect(dropdown.classList.contains('open')).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    // Hovering already opened it; a click must not immediately close it.
    pointerClick(trigger);
    expect(dropdown.classList.contains('open')).toBe(true);

    menu.dispatchEvent(new MouseEvent('mouseleave'));
    expect(dropdown.classList.contains('open')).toBe(false);

    media.setMatches(false);
    media.fireChange();
    pointerClick(trigger);
    expect(dropdown.classList.contains('open')).toBe(true);
    pointerClick(trigger);
    expect(dropdown.classList.contains('open')).toBe(false);
  });

  it('roves focus with arrow keys and returns focus to the trigger on Escape', async () => {
    loadShell();
    installMatchMedia(false);
    const store = await makeStore();
    disposers.push(mountTopBar(document.body, store));

    const trigger = byUi('view-mode-trigger')!;
    const dropdown = byUi('view-mode-dropdown')!;
    trigger.focus();

    trigger.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );
    expect(dropdown.classList.contains('open')).toBe(true);
    const first = viewOptions()[0]!;
    expect(document.activeElement).toBe(first);

    first.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(viewOptions()[1]);

    (document.activeElement as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(viewOptions()[0]);

    (document.activeElement as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(dropdown.classList.contains('open')).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('selects Squint with a pointer, updates the label, checks it, and blurs the trigger', async () => {
    loadShell();
    installMatchMedia(false);
    const store = await makeStore();
    disposers.push(mountTopBar(document.body, store));

    const trigger = byUi('view-mode-trigger')!;
    trigger.focus();
    pointerClick(trigger);

    const squint = optionFor('Squint');
    squint.focus();
    pointerClick(squint);

    expect(store.getState().viewMode).toBe('squint');
    expect(trigger.textContent).toContain('Squint');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(byUi('view-mode-dropdown')!.classList.contains('open')).toBe(false);
    expect(optionFor('Squint').getAttribute('aria-checked')).toBe('true');
    expect(viewOptions()[0]!.getAttribute('aria-checked')).toBe('false');
    expect(document.activeElement).not.toBe(trigger);
  });
});

describe('Focus bar', () => {
  it('shows only in explicit Squint mode and exposes the cell value text', async () => {
    loadShell();
    installMatchMedia(false);
    const store = await makeStore();
    const frames = installFrameQueue();
    disposers.push(mountTopBar(document.body, store));

    const bar = byUi('focus-bar');
    expect(bar).not.toBeNull();
    expect(bar!.hidden).toBe(true);

    const input = byUi<HTMLInputElement>('focus-input');
    expect(input).not.toBeNull();
    expect(input!.min).toBe('0');
    expect(input!.max).toBe('1.5');
    expect(input!.step).toBe('0.05');

    store.setViewMode('stripes');
    expect(bar!.hidden).toBe(true);

    // A transient peek never flashes the pill.
    store.setSquintPeek(true);
    expect(bar!.hidden).toBe(true);
    store.setSquintPeek(false);

    store.setViewMode('squint');
    expect(bar!.hidden).toBe(false);
    expect(input!.value).toBe('0.75');
    expect(input!.getAttribute('aria-valuetext')).toBe('0.75 cells');

    input!.value = '1.05';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    frames.flush();
    expect(store.getState().blurCells).toBeCloseTo(1.05, 5);
    expect(input!.getAttribute('aria-valuetext')).toBe('1.05 cells');

    store.setViewMode('grid');
    expect(bar!.hidden).toBe(true);
  });

  it('coalesces ten input events into one blur update per frame', async () => {
    loadShell();
    installMatchMedia(false);
    const store = await makeStore();
    const frames = installFrameQueue();
    disposers.push(mountTopBar(document.body, store));
    store.setViewMode('squint');

    const input = byUi<HTMLInputElement>('focus-input')!;
    const setBlurCells = vi.spyOn(store, 'setBlurCells');

    for (let step = 1; step <= 10; step += 1) {
      input.value = (step * 0.05).toFixed(2);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    expect(setBlurCells).not.toHaveBeenCalled();
    expect(frames.pending()).toBe(1);

    frames.flush();
    expect(setBlurCells).toHaveBeenCalledTimes(1);
    expect(setBlurCells).toHaveBeenCalledWith(0.5);
  });
});

describe('Spacebar squint peek', () => {
  it('peeks on Space without mutating viewMode and releases on keyup', async () => {
    loadShell();
    installMatchMedia(false);
    const store = await makeStore();
    disposers.push(mountTopBar(document.body, store));
    expect(store.getState().viewMode).toBe('grid');

    const down = spaceKey('keydown');
    document.dispatchEvent(down);
    expect(store.getState().squintPeek).toBe(true);
    expect(store.getState().viewMode).toBe('grid');
    expect(down.defaultPrevented).toBe(true);

    const up = spaceKey('keyup');
    document.dispatchEvent(up);
    expect(store.getState().squintPeek).toBe(false);
    expect(store.getState().viewMode).toBe('grid');
    expect(up.defaultPrevented).toBe(true);
  });

  it('ignores repeats, modifiers, text-entry controls, and an active drag-paint', async () => {
    loadShell();
    installMatchMedia(false);
    const store = await makeStore();
    disposers.push(mountTopBar(document.body, store));

    document.dispatchEvent(spaceKey('keydown', { repeat: true }));
    expect(store.getState().squintPeek).toBe(false);
    document.dispatchEvent(spaceKey('keyup', { repeat: true }));

    for (const modifier of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      document.dispatchEvent(spaceKey('keydown', modifier));
      expect(store.getState().squintPeek).toBe(false);
      document.dispatchEvent(spaceKey('keyup', modifier));
    }

    const text = document.createElement('input');
    text.type = 'text';
    document.body.appendChild(text);
    text.focus();
    text.dispatchEvent(spaceKey('keydown'));
    expect(store.getState().squintPeek).toBe(false);
    text.dispatchEvent(spaceKey('keyup'));

    const select = document.createElement('select');
    select.appendChild(document.createElement('option'));
    document.body.appendChild(select);
    select.focus();
    select.dispatchEvent(spaceKey('keydown'));
    expect(store.getState().squintPeek).toBe(false);
    select.dispatchEvent(spaceKey('keyup'));

    store.setPainting(true);
    document.dispatchEvent(spaceKey('keydown'));
    expect(store.getState().squintPeek).toBe(false);
    document.dispatchEvent(spaceKey('keyup'));
    expect(store.getState().painting).toBe(true);
    store.setPainting(false);
  });

  it('releases the peek when the window blurs or the tab is hidden', async () => {
    loadShell();
    installMatchMedia(false);
    const store = await makeStore();
    disposers.push(mountTopBar(document.body, store));

    document.dispatchEvent(spaceKey('keydown'));
    expect(store.getState().squintPeek).toBe(true);
    window.dispatchEvent(new Event('blur'));
    expect(store.getState().squintPeek).toBe(false);
    document.dispatchEvent(spaceKey('keyup'));

    document.dispatchEvent(spaceKey('keydown'));
    expect(store.getState().squintPeek).toBe(true);
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(store.getState().squintPeek).toBe(false);
    setVisibility('visible');
    document.dispatchEvent(spaceKey('keyup'));
  });

  it('is a no-op while Squint is the explicit mode', async () => {
    loadShell();
    installMatchMedia(false);
    const store = await makeStore();
    disposers.push(mountTopBar(document.body, store));
    store.setViewMode('squint');

    document.dispatchEvent(spaceKey('keydown'));
    expect(store.getState().squintPeek).toBe(false);
    expect(store.getState().viewMode).toBe('squint');
    document.dispatchEvent(spaceKey('keyup'));
    expect(store.getState().squintPeek).toBe(false);
    expect(store.getState().viewMode).toBe('squint');
  });
});


describe('Spacebar activation safety', () => {
  it('runs Reset once when a pointer click is followed by a Space peek', async () => {
    loadShell();
    installMatchMedia(false);
    const store = await makeStore();
    disposers.push(mountTopBar(document.body, store));
    store.toggleCell(1, 1);
    store.toggleCell(2, 2);
    expect(store.getState().completedCells.size).toBe(2);

    const resetCompleted = vi.spyOn(store, 'resetCompleted');
    const reset = document.querySelector<HTMLButtonElement>('[data-ui="reset"]')!;
    reset.focus();
    expect(document.activeElement).toBe(reset);

    pointerClick(reset);
    expect(resetCompleted).toHaveBeenCalledTimes(1);
    expect(store.getState().completedCells.size).toBe(0);
    // The pointer click must blur the button or the next Space release would
    // activate it natively and silently wipe the drawing a second time.
    expect(document.activeElement).not.toBe(reset);

    const down = spaceKey('keydown');
    document.dispatchEvent(down);
    expect(store.getState().squintPeek).toBe(true);
    expect(down.defaultPrevented).toBe(true);

    const up = spaceKey('keyup');
    document.dispatchEvent(up);
    expect(up.defaultPrevented).toBe(true);
    expect(store.getState().squintPeek).toBe(false);
    expect(store.getState().viewMode).toBe('grid');
    expect(resetCompleted).toHaveBeenCalledTimes(1);
  });

  it('keeps native Space activation when a button was focused by keyboard', async () => {
    loadShell();
    installMatchMedia(false);
    const store = await makeStore();
    disposers.push(mountTopBar(document.body, store));
    store.toggleCell(1, 1);

    const resetCompleted = vi.spyOn(store, 'resetCompleted');
    const reset = document.querySelector<HTMLButtonElement>('[data-ui="reset"]')!;
    reset.focus();
    expect(document.activeElement).toBe(reset);

    const down = spaceKey('keydown');
    document.dispatchEvent(down);
    expect(store.getState().squintPeek).toBe(false);
    expect(down.defaultPrevented).toBe(false);

    const up = spaceKey('keyup');
    document.dispatchEvent(up);
    expect(store.getState().squintPeek).toBe(false);
    expect(up.defaultPrevented).toBe(false);

    // Browsers synthesize the activation click at Space keyup.
    pointerClick(reset, 0);
    expect(resetCompleted).toHaveBeenCalledTimes(1);
    expect(store.getState().completedCells.size).toBe(0);
  });

  it('moves focus to the body when an outside click closes Settings', async () => {
    loadShell();
    installMatchMedia(false);
    const store = await makeStore();
    disposers.push(mountSettingsPopover(document.body, store));

    const trigger = document.querySelector<HTMLButtonElement>('[data-ui="settings-trigger"]')!;
    const popover = document.querySelector<HTMLElement>('[data-ui="settings-popover"]')!;
    trigger.focus();
    trigger.click();
    expect(popover.classList.contains('open')).toBe(true);

    document.body.click();
    expect(popover.classList.contains('open')).toBe(false);
    expect(document.activeElement).toBe(document.body);
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

describe('Stripes rendering through the view-mode dropdown', () => {
  it('draws three vertical RGB stripes per cell and desaturates completed cells', async () => {
    loadShell();
    installMatchMedia(false);
    const store = await makeStore();
    mockStageLayout();
    const frames = installFrameQueue();
    const canvas = installCanvasContext();
    disposers.push(mountGridCanvas(document.body, store));
    disposers.push(mountTopBar(document.body, store));

    // Complete cell (1, 0) so the same click path also proves desaturation.
    store.toggleCell(1, 0);

    const trigger = byUi('view-mode-trigger');
    expect(trigger).not.toBeNull();
    pointerClick(trigger!);
    pointerClick(optionFor('Stripes'));
    expect(store.getState().viewMode).toBe('stripes');

    canvas.fillRecords.length = 0;
    frames.flush();

    const firstRow = canvas.fillRecords.filter((fill) => fill.y === 28);
    expect(firstRow.length).toBeGreaterThanOrEqual(6);

    const [r, g, b] = firstRow;
    expect(r!.style).toBe('rgb(198, 46, 42)');
    expect(g!.style).toBe('rgb(36, 104, 48)');
    expect(b!.style).toBe('rgb(28, 27, 29)');
    expect(g!.x).toBeCloseTo(r!.x + r!.width, 5);
    expect(b!.x).toBeCloseTo(r!.x + r!.width * 2, 5);
    expect(g!.width).toBe(r!.width);
    expect(g!.height).toBe(r!.height);

    for (const fill of firstRow.slice(3, 6)) {
      const match = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(fill.style);
      expect(match).not.toBeNull();
      expect(match![1]).toBe(match![2]);
      expect(match![2]).toBe(match![3]);
    }
  });
});

describe('Squint canvas', () => {
  function mountSquint(
    store: ReturnType<typeof createGridStore>,
    options: { inspector?: boolean } = {},
  ): { frames: ReturnType<typeof installFrameQueue>; canvas: FakeCanvas; surface: HTMLCanvasElement } {
    mockStageLayout();
    const frames = installFrameQueue();
    const canvas = installCanvasContext();
    disposers.push(mountGridCanvas(document.body, store));
    if (options.inspector) disposers.push(mountInspectorSidebar(document.body, store));
    store.setViewMode('squint');
    frames.flush();
    return {
      frames,
      canvas,
      surface: document.querySelector<HTMLCanvasElement>('[data-ui="grid-canvas"]')!,
    };
  }

  it('hides axes, grid lines, and the hover ring and uses the default cursor', async () => {
    loadShell();
    installMatchMedia(false);
    const store = await makeStore();
    const { frames, canvas, surface } = mountSquint(store);

    canvas.fillText.mockClear();
    canvas.stroke.mockClear();
    canvas.strokeRect.mockClear();

    store.setHovered({ col: 12, row: 8 });
    frames.flush();

    expect(canvas.fillText).not.toHaveBeenCalled();
    expect(canvas.stroke).not.toHaveBeenCalled();
    // A cell-sized ring is a few pixels wide; the outer border is grid-wide.
    for (const call of canvas.strokeRect.mock.calls) {
      expect(Number(call[2])).toBeGreaterThanOrEqual(100);
    }

    surface.dispatchEvent(pointerEvent('pointermove', cellCenter(12, 8)));
    expect(surface.style.cursor).toBe('default');
  });

  it('ignores clicks and drags for completion but keeps inspector hover live', async () => {
    loadShell();
    installMatchMedia(false);
    const store = await makeStore();
    const { frames, surface } = mountSquint(store, { inspector: true });

    surface.dispatchEvent(pointerEvent('pointerdown', cellCenter(10, 5)));
    surface.dispatchEvent(pointerEvent('pointermove', cellCenter(11, 5)));
    window.dispatchEvent(pointerEvent('pointerup', cellCenter(11, 5)));
    frames.flush();

    expect(store.getState().completedCells.size).toBe(0);
    expect(store.getState().hoveredCell).toEqual({ col: 11, row: 5 });
    expect(document.querySelector('[data-ui="coord"]')?.textContent).toBe('X12, Y6');
    expect(document.querySelector('[data-ui="hint"]')?.textContent).toContain('Squint preview');
    expect(
      document.querySelector('[data-ui="inspector-active"]')?.classList.contains('visible'),
    ).toBe(true);
  });

  it('renders Mark Done / Undo disabled and inert', async () => {
    loadShell();
    installMatchMedia(false);
    const store = await makeStore();
    const { surface } = mountSquint(store, { inspector: true });

    const tap = { ...cellCenter(10, 5), pointerType: 'touch' };
    surface.dispatchEvent(pointerEvent('pointerdown', tap));
    window.dispatchEvent(pointerEvent('pointerup', tap));
    surface.dispatchEvent(pointerEvent('pointerleave', tap));

    const button = document.querySelector<HTMLButtonElement>('[data-ui="mark-done"]')!;
    expect(button.hidden).toBe(false);
    expect(button.style.display).not.toBe('none');
    expect(button.disabled).toBe(true);

    button.click();
    expect(store.getState().completedCells.size).toBe(0);
  });

  it('draws nothing and does not throw when there is no grid', () => {
    loadShell();
    installMatchMedia(false);
    const store = createGridStore({ client: fixedClient(), storage: new MemoryStorage() });
    mockStageLayout();
    const frames = installFrameQueue();
    const canvas = installCanvasContext();

    expect(() => disposers.push(mountGridCanvas(document.body, store))).not.toThrow();
    store.setViewMode('squint');
    frames.flush();

    expect(canvas.ctx.fillRect).not.toHaveBeenCalled();
    expect(canvas.ctx.clearRect).not.toHaveBeenCalled();
  });

  it('uses nearest-neighbor at blurCells 0 and smooth scaling above 0', async () => {
    loadShell();
    installMatchMedia(false);
    const store = await makeStore();
    const { frames, canvas } = mountSquint(store);

    store.setBlurCells(0);
    frames.flush();
    expect(canvas.ctx.imageSmoothingEnabled).toBe(false);

    store.setBlurCells(0.75);
    frames.flush();
    expect(canvas.ctx.imageSmoothingEnabled).toBe(true);
  });

  it('does not recompute the raster or blur when completed cells change', async () => {
    loadShell();
    installMatchMedia(false);
    const store = await makeStore();
    const { frames, canvas } = mountSquint(store);

    canvas.putImageData.mockClear();
    const contextsBefore = canvas.getContext.mock.calls.length;

    store.toggleCell(3, 3);
    frames.flush();
    store.toggleCell(3, 3);
    frames.flush();

    expect(canvas.putImageData).not.toHaveBeenCalled();
    expect(canvas.getContext.mock.calls.length).toBe(contextsBefore);
  });
});
