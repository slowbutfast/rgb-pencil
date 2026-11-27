import { afterEach, describe, expect, it, vi } from 'vitest';

import shellHtml from '../../../index.html?raw';

import { runPipeline } from '../../engine/pipeline';
import { DEFAULT_SETTINGS } from '../../types/pipeline';
import { createGridStore, type GridStore } from '../../store/gridStore';
import { encodeCompleted } from '../../store/completedCodec';
import type { ProjectRecord } from '../../store/projectDb';
import { losslessCodec, MemoryProjectDatabase, MemoryStorage, sampleBitmap } from '../../store/__tests__/support';
import { mountGridCanvas } from '../gridCanvas';
import { mountInspectorSidebar } from '../inspectorSidebar';
import { mountSettingsPopover } from '../settingsPopover';
import { mountTopBar } from '../topBar';

function loadShell(): void {
  const start = shellHtml.indexOf('<body>');
  const end = shellHtml.indexOf('</body>');
  if (start === -1 || end === -1) throw new Error('index.html is missing a body');
  const body = shellHtml
    .slice(start + '<body>'.length, end)
    .replace(/<script[\s\S]*?<\/script>/g, '');
  document.body.innerHTML = body;
}

let clock = 1000;
let idCounter = 0;

function makeStore(db: MemoryProjectDatabase | null): GridStore {
  return createGridStore({
    client: { process: async (request) => runPipeline(request) },
    db,
    codec: losslessCodec(),
    storage: new MemoryStorage(),
    locks: null,
    now: () => (clock += 1),
    randomId: () => `ui-project-${++idCounter}`,
    debounceMs: 50,
    channel: null,
  });
}

function record(
  id: string,
  name: string,
  updatedAt: number,
  doneCount: number,
  hash: string,
): ProjectRecord {
  return {
    id,
    name,
    createdAt: updatedAt - 10,
    updatedAt,
    schemaVersion: 1,
    pipelineVersion: 1,
    sourceHash: hash,
    cols: 56,
    rows: 42,
    settings: {
      cols: 56,
      contrast: 1.45,
      dither: true,
      ditherStrength: 0.85,
      paletteId: 'reflective',
    },
    completedBits: encodeCompleted(
      new Set(doneCount > 0 ? ['1,1'] : []),
      56,
      42,
    ),
    doneCount,
  };
}

const disposers: Array<() => void> = [];

afterEach(() => {
  while (disposers.length > 0) disposers.pop()?.();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

async function setup(
  options: { db?: MemoryProjectDatabase | null; load?: boolean; name?: string } = {},
): Promise<{ store: GridStore; db: MemoryProjectDatabase | null }> {
  loadShell();
  const db = options.db === undefined ? new MemoryProjectDatabase(() => (clock += 1)) : options.db;
  const store = makeStore(db);
  if (options.load !== false) {
    await store.loadImage(sampleBitmap(32, 24, 2), { name: options.name ?? 'ui.png' });
  }
  return { store, db };
}

describe('persistence UI', () => {
  it('shows the quiet save status through the write lifecycle', async () => {
    const { store } = await setup();
    disposers.push(mountTopBar(document.body, store));

    expect(document.querySelector('[data-ui="save-status"]')?.textContent).toBe('');
    // With no banners the stack is empty, so it reserves zero height.
    expect(
      document.querySelector('[data-ui="banner-list"]')?.childElementCount,
    ).toBe(0);

    store.toggleCell(1, 1);
    await vi.waitFor(() =>
      expect(document.querySelector('[data-ui="save-status"]')?.textContent).toBe('Saving…'),
    );

    await store.flushNow();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-ui="save-status"]')?.textContent).toBe('Saved'),
    );
  });

  it('closes Settings when the same-image offer appears so the offer is clickable', async () => {
    const { store } = await setup();
    store.toggleCell(1, 1);
    await store.flushNow();
    disposers.push(mountTopBar(document.body, store));
    disposers.push(mountSettingsPopover(document.body, store));

    const popover = document.querySelector<HTMLElement>('[data-ui="settings-popover"]')!;
    document.querySelector<HTMLElement>('[data-ui="settings-trigger"]')!.click();
    expect(popover.classList.contains('open')).toBe(true);

    await store.loadImage(sampleBitmap(32, 24, 2), { name: 'ui.png' });
    await vi.waitFor(() => expect(popover.classList.contains('open')).toBe(false));
    expect(store.getState().sameImageOffer).not.toBeNull();
    expect(document.querySelector('[data-ui="same-image-resume"]')).not.toBeNull();
    expect(document.querySelector('[data-ui="same-image-copy"]')).not.toBeNull();
  });

  it('shows a full quota-failure banner with the backup suggestion', async () => {
    const { store, db } = await setup();
    store.toggleCell(1, 1);
    await store.flushNow();
    disposers.push(mountTopBar(document.body, store));
    expect(db).not.toBeNull();

    const message =
      'Storage quota exceeded. Delete a project or export a backup, then retry.';
    vi.spyOn(db!, 'put').mockResolvedValue({
      ok: false,
      quotaExceeded: true,
      message,
    });

    store.toggleCell(2, 2);
    await store.flushNow();

    const banner = document.querySelector<HTMLElement>('[data-ui="banner-save-error"]');
    expect(banner).not.toBeNull();
    const bannerText = banner?.textContent ?? '';
    expect(bannerText).toMatch(/Delete a project or export a backup[,.]/);
    expect(
      bannerText.match(/Delete a project or export a backup[,.]/g),
    ).toHaveLength(1);
    expect(document.querySelector('[data-ui="save-status"]')?.textContent).toContain(
      'quota',
    );

    document.querySelector<HTMLElement>('[data-ui="banner-save-error-dismiss"]')!.click();
    expect(document.querySelector('[data-ui="banner-save-error"]')).toBeNull();
  });

  it('shows a persistent memory-only warning and a dismissible banner below the pills', async () => {
    const { store } = await setup({ db: null });
    disposers.push(mountTopBar(document.body, store));

    expect(document.querySelector('[data-ui="save-status"]')?.textContent).toContain(
      'Storage unavailable',
    );

    const banner = document.querySelector<HTMLElement>('[data-ui="banner-memory-only"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('not be saved');
    const stack = document.querySelector<HTMLElement>('[data-ui="banner-stack"]')!;
    const stage = document.querySelector<HTMLElement>('[data-ui="stage"]')!;
    const gridFrame = document.querySelector<HTMLElement>('.grid-frame')!;
    // The stack lives in the stage flow immediately above the canvas, not in
    // the absolutely-positioned top bar, so it cannot overlay grid cells.
    expect(stack.parentElement).toBe(stage);
    expect(stack.closest('[data-ui="top-bar"]')).toBeNull();
    expect(stack.nextElementSibling).toBe(gridFrame);
    expect(stack.contains(document.querySelector('[data-ui="grid-canvas"]'))).toBe(false);

    document.querySelector<HTMLElement>('[data-ui="banner-memory-only-dismiss"]')!.click();
    expect(document.querySelector('[data-ui="banner-memory-only"]')).toBeNull();
    expect(document.querySelector('[data-ui="save-status"]')?.textContent).toContain(
      'Storage unavailable',
    );
  });

  it('locks width and palette while cells are done and confirms contrast changes', async () => {
    const { store } = await setup();
    disposers.push(mountSettingsPopover(document.body, store));

    const cols = document.querySelector<HTMLInputElement>('[data-ui="cols-input"]')!;
    const palette = document.querySelector<HTMLSelectElement>('[data-ui="palette-input"]')!;
    const contrast = document.querySelector<HTMLInputElement>('[data-ui="contrast-input"]')!;
    const lockCaption = document.querySelector<HTMLElement>('[data-ui="settings-lock-caption"]')!;

    expect(cols.disabled).toBe(false);
    store.toggleCell(1, 1);
    await store.flushNow();
    await vi.waitFor(() => expect(cols.disabled).toBe(true));
    expect(palette.disabled).toBe(true);
    expect(lockCaption.hidden).toBe(false);
    expect(lockCaption.textContent).toContain('locked');

    const before = store.getState().settings.contrast;
    contrast.value = '2.00';
    contrast.dispatchEvent(new Event('input', { bubbles: true }));

    const confirm = document.querySelector<HTMLElement>('[data-ui="settings-confirm"]')!;
    expect(confirm.hidden).toBe(false);
    expect(store.getState().settings.contrast).toBe(before);

    document.querySelector<HTMLElement>('[data-ui="settings-confirm-cancel"]')!.click();
    expect(store.getState().settings.contrast).toBe(before);
    expect(contrast.value).toBe(before.toFixed(2));
    expect(confirm.hidden).toBe(true);

    contrast.value = '2.00';
    contrast.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector<HTMLElement>('[data-ui="settings-confirm-apply"]')!.click();
    await vi.waitFor(() => expect(store.getState().settings.contrast).toBe(2));
  });

  it('lists projects newest first with done / total and inline delete confirmation', async () => {
    const db = new MemoryProjectDatabase(() => (clock += 1));
    const codec = losslessCodec();
    const png = await codec.encode(sampleBitmap());
    await db.putWithImage(record('old', 'Old drawing', 100, 3, 'hash-old'), {
      projectId: 'old',
      width: 32,
      height: 24,
      png,
      thumb: png,
    });
    await db.putWithImage(record('new', '<img src=x onerror="window.__pwned=1">', 200, 7, 'hash-new'), {
      projectId: 'new',
      width: 32,
      height: 24,
      png,
      thumb: png,
    });

    const { store } = await setup({ db });
    await store.refreshProjects();
    disposers.push(mountSettingsPopover(document.body, store));

    const rows = [...document.querySelectorAll<HTMLElement>('[data-ui="project-row"]')];
    expect(rows).toHaveLength(2);
    expect(rows[0]?.dataset.projectId).toBe('new');
    expect(rows[0]?.textContent).toContain('7 / 2352');
    expect(rows[1]?.dataset.projectId).toBe('old');
    expect(rows[1]?.textContent).toContain('3 / 2352');
    expect(rows[0]?.querySelector('img:not(.project-thumb)')).toBeNull();
    expect(rows[0]?.querySelector('[data-ui="project-name"]')?.textContent).toBe(
      '<img src=x onerror="window.__pwned=1">',
    );
    expect(rows[0]?.textContent).toContain('<img src=x');

    const currentRow = (): HTMLElement =>
      document.querySelector<HTMLElement>('[data-ui="project-row"]')!;

    currentRow().querySelector<HTMLElement>('[data-ui="project-delete"]')!.click();
    const confirm = currentRow().querySelector<HTMLElement>(
      '[data-ui="project-delete-confirm"]',
    )!;
    expect(confirm).not.toBeNull();
    currentRow()
      .querySelector<HTMLElement>('[data-ui="project-delete-cancel"]')!
      .click();
    expect(db.removeCalls).toHaveLength(0);

    currentRow().querySelector<HTMLElement>('[data-ui="project-delete"]')!.click();
    currentRow()
      .querySelector<HTMLElement>('[data-ui="project-delete-confirm-yes"]')!
      .click();
    await vi.waitFor(() => expect(db.removeCalls).toContain('new'));
    await vi.waitFor(() =>
      expect(document.querySelectorAll('[data-ui="project-row"]')).toHaveLength(1),
    );
  });

  it('keeps the Settings popover open across project row actions', async () => {
    const db = new MemoryProjectDatabase(() => (clock += 1));
    const png = await losslessCodec().encode(sampleBitmap());
    await db.putWithImage(record('edit', 'Editable', 100, 2, 'hash-edit'), {
      projectId: 'edit',
      width: 32,
      height: 24,
      png,
      thumb: png,
    });

    const { store } = await setup({ db });
    await store.refreshProjects();
    disposers.push(mountSettingsPopover(document.body, store));

    const popover = document.querySelector<HTMLElement>('[data-ui="settings-popover"]')!;
    document.querySelector<HTMLElement>('[data-ui="settings-trigger"]')!.click();
    expect(popover.classList.contains('open')).toBe(true);

    const row = (): HTMLElement =>
      document.querySelector<HTMLElement>('[data-ui="project-row"]')!;

    row().querySelector<HTMLElement>('[data-ui="project-rename"]')!.click();
    expect(popover.classList.contains('open')).toBe(true);
    const input = document.querySelector<HTMLInputElement>(
      '[data-ui="project-rename-input"]',
    )!;
    expect(input).not.toBeNull();
    expect(input.value).toBe('Editable');

    input.value = 'Renamed';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector<HTMLElement>('[data-ui="project-rename-save"]')!.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-ui="project-name"]')?.textContent).toBe('Renamed'),
    );
    expect(popover.classList.contains('open')).toBe(true);

    row().querySelector<HTMLElement>('[data-ui="project-delete"]')!.click();
    expect(popover.classList.contains('open')).toBe(true);
    expect(
      document.querySelector('[data-ui="project-delete-confirm"]'),
    ).not.toBeNull();
    document.querySelector<HTMLElement>('[data-ui="project-delete-cancel"]')!.click();
    expect(popover.classList.contains('open')).toBe(true);
  });

  it('keeps the Settings popover open while exporting a project', async () => {
    const db = new MemoryProjectDatabase(() => (clock += 1));
    const png = await losslessCodec().encode(sampleBitmap());
    await db.putWithImage(record('export', 'Exportable', 100, 2, 'hash-export'), {
      projectId: 'export',
      width: 32,
      height: 24,
      png,
      thumb: png,
    });

    const { store } = await setup({ db });
    await store.refreshProjects();
    const exported = vi.spyOn(store, 'exportProject').mockResolvedValue({
      ok: true,
      filename: 'exportable.rgbpencil.json',
      text: '{}',
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    // Simulate a real anchor click that bubbles to document.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      this.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    disposers.push(mountSettingsPopover(document.body, store));
    const popover = document.querySelector<HTMLElement>('[data-ui="settings-popover"]')!;
    document.querySelector<HTMLElement>('[data-ui="settings-trigger"]')!.click();
    expect(popover.classList.contains('open')).toBe(true);

    document.querySelector<HTMLElement>('[data-ui="project-export"]')!.click();
    await vi.waitFor(() => expect(exported).toHaveBeenCalled());
    expect(popover.classList.contains('open')).toBe(true);
  });

  it('disables paint and Mark Done while read-only but keeps inspection live', async () => {
    loadShell();
    const db = new MemoryProjectDatabase(() => (clock += 1));
    const image = sampleBitmap(32, 24, 9);
    const hash = runPipeline({ image, settings: DEFAULT_SETTINGS }).grid.sourceHash;
    const png = await losslessCodec().encode(image);
    await db.putWithImage(record('shared', 'Shared', 100, 1, hash), {
      projectId: 'shared',
      width: 32,
      height: 24,
      png,
      thumb: png,
    });
    await db.setLastOpenedId('shared');

    const store = createGridStore({
      client: { process: async (request) => runPipeline(request) },
      db,
      codec: losslessCodec(),
      storage: new MemoryStorage(),
      locks: {
        async request(_name, _options, callback) {
          await callback(null);
          return null;
        },
      },
      now: () => (clock += 1),
      randomId: () => 'ro',
      debounceMs: 5,
    });
    await expect(store.resumeLastProject()).resolves.toBe(true);
    expect(store.getState().readOnly).toBe(true);

    disposers.push(mountGridCanvas(document.body, store));
    disposers.push(mountInspectorSidebar(document.body, store));
    disposers.push(mountTopBar(document.body, store));

    expect(document.querySelector('[data-ui="banner-read-only"]')).not.toBeNull();
    expect(document.querySelector('[data-ui="banner-read-only-dismiss"]')).toBeNull();
    expect(document.querySelector('[data-ui="take-over"]')).not.toBeNull();

    const stage = document.querySelector<HTMLElement>('[data-ui="stage"]')!;
    stage.getBoundingClientRect = () =>
      ({
        width: 1024,
        height: 800,
        top: 0,
        left: 0,
        right: 1024,
        bottom: 800,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    store.setHovered({ col: 4, row: 5 });
    expect(document.querySelector('[data-ui="coord"]')?.textContent).toBe('X5, Y6');
    const markDone = document.querySelector<HTMLButtonElement>('[data-ui="mark-done"]')!;
    expect(markDone.disabled).toBe(true);
    expect(markDone.textContent).toMatch(/read-only/i);

    const canvas = document.querySelector<HTMLCanvasElement>('[data-ui="grid-canvas"]')!;
    const point = { clientX: 34 + 10 * 15 + 7, clientY: 28 + 10 * 15 + 7, pointerType: 'mouse' };
    const down = new Event('pointerdown', { bubbles: true, cancelable: true });
    Object.defineProperties(down, {
      clientX: { value: point.clientX },
      clientY: { value: point.clientY },
      pointerType: { value: point.pointerType },
    });
    canvas.dispatchEvent(down);
    expect(store.getState().completedCells.size).toBe(1);

    store.dispose();
  });
});
