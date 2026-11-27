import { renderSampleScene, SAMPLE_SCENE_NAMES, type SampleSceneName } from '../engine/sampleScenes';
import type { GridStore, GridStoreState } from '../store/gridStore';
import type { PageSize, PaletteKey } from '../types/pipeline';
import { readImageElement } from './dropZone';

function element<T extends HTMLElement>(root: HTMLElement, name: string): T {
  const found = root.querySelector<T>(`[data-ui="${name}"]`);
  if (!found) throw new Error(`Missing [data-ui="${name}"] element`);
  return found;
}

function isSampleScene(value: string): value is SampleSceneName {
  return (SAMPLE_SCENE_NAMES as readonly string[]).includes(value);
}

/**
 * Collapsed-by-default Settings popover: sample scenes, grid width, contrast,
 * palette, and Floyd–Steinberg dithering.
 */
export function mountSettingsPopover(root: HTMLElement, store: GridStore): () => void {
  const trigger = element<HTMLButtonElement>(root, 'settings-trigger');
  const popover = element(root, 'settings-popover');
  const colsInput = element<HTMLInputElement>(root, 'cols-input');
  const colsValue = element(root, 'cols-value');
  const contrastInput = element<HTMLInputElement>(root, 'contrast-input');
  const contrastValue = element(root, 'contrast-value');
  const paletteInput = element<HTMLSelectElement>(root, 'palette-input');
  const ditherInput = element<HTMLInputElement>(root, 'dither-input');
  const chips = Array.from(root.querySelectorAll<HTMLElement>('[data-ui="sample"]'));

  // Export options (kept inside the existing collapsed-by-default popover).
  const pageSizeRow = document.createElement('div');
  pageSizeRow.className = 'setting-row';
  const pageSizeHead = document.createElement('div');
  pageSizeHead.className = 'setting-head';
  const pageSizeLabel = document.createElement('span');
  pageSizeLabel.textContent = 'Page Size';
  pageSizeHead.appendChild(pageSizeLabel);
  const pageSizeInput = document.createElement('select');
  pageSizeInput.dataset.ui = 'page-size';
  for (const [value, label] of [
    ['a4', 'A4'],
    ['letter', 'US Letter'],
  ] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    pageSizeInput.appendChild(option);
  }
  pageSizeRow.append(pageSizeHead, pageSizeInput);

  const templateRow = document.createElement('label');
  templateRow.className = 'toggle-line';
  const templateLabel = document.createElement('span');
  templateLabel.textContent = 'Include faint template';
  const templateInput = document.createElement('input');
  templateInput.type = 'checkbox';
  templateInput.dataset.ui = 'template-toggle';
  templateRow.append(templateLabel, templateInput);

  const cellRow = document.createElement('div');
  cellRow.className = 'setting-row';
  const cellHead = document.createElement('div');
  cellHead.className = 'setting-head';
  const cellLabel = document.createElement('span');
  cellLabel.textContent = 'Template Cell Size';
  const cellValue = document.createElement('span');
  cellValue.dataset.ui = 'template-mm-value';
  cellValue.textContent = '6 mm';
  cellHead.append(cellLabel, cellValue);
  const cellInput = document.createElement('input');
  cellInput.type = 'range';
  cellInput.min = '4';
  cellInput.max = '12';
  cellInput.step = '1';
  cellInput.value = '6';
  cellInput.dataset.ui = 'template-mm';
  cellRow.append(cellHead, cellInput);

  popover.append(pageSizeRow, templateRow, cellRow);

  function setOpen(open: boolean): void {
    popover.classList.toggle('open', open);
    trigger.classList.toggle('active', open);
    trigger.setAttribute('aria-expanded', String(open));
  }

  function render(state: GridStoreState): void {
    colsInput.value = String(state.settings.cols);
    colsValue.textContent = `${state.settings.cols} px`;
    contrastInput.value = state.settings.contrast.toFixed(2);
    contrastValue.textContent = `${state.settings.contrast.toFixed(2)}×`;
    paletteInput.value = state.settings.palette;
    ditherInput.checked = state.settings.dither;

    pageSizeInput.value = state.exportOptions.pageSize;
    templateInput.checked = state.exportOptions.includeTemplate;
    cellInput.value = String(state.exportOptions.templateCellMm);
    cellValue.textContent = `${state.exportOptions.templateCellMm} mm`;
  }

  const onTrigger = (event: MouseEvent): void => {
    event.stopPropagation();
    setOpen(!popover.classList.contains('open'));
  };

  const onDocumentClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (popover.contains(target) || trigger.contains(target)) return;
    setOpen(false);
  };

  const onCols = (): void => {
    void store.setCols(Number(colsInput.value));
  };

  const onContrast = (): void => {
    void store.setContrast(Number(contrastInput.value));
  };

  const onPalette = (): void => {
    void store.setPalette(paletteInput.value as PaletteKey);
  };

  const onDither = (): void => {
    void store.setDither(ditherInput.checked);
  };

  const onPageSize = (): void => {
    store.setExportOptions({ pageSize: pageSizeInput.value as PageSize });
  };

  const onTemplate = (): void => {
    store.setExportOptions({ includeTemplate: templateInput.checked });
  };

  const onTemplateCell = (): void => {
    store.setExportOptions({ templateCellMm: Number(cellInput.value) });
  };

  const onSample = (chip: HTMLElement): void => {
    const scene = chip.dataset.scene ?? '';
    if (!isSampleScene(scene)) return;
    chips.forEach((candidate) => candidate.classList.toggle('active', candidate === chip));
    const canvas = renderSampleScene(scene);
    const image = readImageElement(canvas);
    if (image) void store.loadImage(image);
  };

  const sampleHandlers = chips.map((chip) => {
    const handler = (): void => onSample(chip);
    chip.addEventListener('click', handler);
    return { chip, handler };
  });

  trigger.setAttribute('aria-expanded', 'false');
  trigger.addEventListener('click', onTrigger);
  document.addEventListener('click', onDocumentClick);
  colsInput.addEventListener('input', onCols);
  contrastInput.addEventListener('input', onContrast);
  paletteInput.addEventListener('change', onPalette);
  ditherInput.addEventListener('change', onDither);
  pageSizeInput.addEventListener('change', onPageSize);
  templateInput.addEventListener('change', onTemplate);
  cellInput.addEventListener('input', onTemplateCell);

  const unsubscribe = store.subscribe(render);
  render(store.getState());

  return () => {
    unsubscribe();
    trigger.removeEventListener('click', onTrigger);
    document.removeEventListener('click', onDocumentClick);
    colsInput.removeEventListener('input', onCols);
    contrastInput.removeEventListener('input', onContrast);
    paletteInput.removeEventListener('change', onPalette);
    ditherInput.removeEventListener('change', onDither);
    pageSizeInput.removeEventListener('change', onPageSize);
    templateInput.removeEventListener('change', onTemplate);
    cellInput.removeEventListener('input', onTemplateCell);
    pageSizeRow.remove();
    templateRow.remove();
    cellRow.remove();
    sampleHandlers.forEach(({ chip, handler }) => chip.removeEventListener('click', handler));
  };
}
