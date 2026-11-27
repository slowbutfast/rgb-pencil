import { renderSampleScene, SAMPLE_SCENE_NAMES, type SampleSceneName } from '../engine/sampleScenes';
import type { GridStore, GridStoreState } from '../store/gridStore';
import type { PaletteKey } from '../types/pipeline';
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
    sampleHandlers.forEach(({ chip, handler }) => chip.removeEventListener('click', handler));
  };
}
