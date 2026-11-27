import type { GridStore, GridStoreState } from '../store/gridStore';
import { readImageFile } from './dropZone';

function element<T extends HTMLElement>(root: HTMLElement, name: string): T {
  const found = root.querySelector<T>(`[data-ui="${name}"]`);
  if (!found) throw new Error(`Missing [data-ui="${name}"] element`);
  return found;
}

/**
 * Floating top-bar pills: upload, progress readout, Reset, and the
 * Pixel Grid / Stripes view toggle.
 */
export function mountTopBar(root: HTMLElement, store: GridStore): () => void {
  const progress = element(root, 'progress');
  const reset = element(root, 'reset');
  const modeGrid = element(root, 'mode-grid');
  const modeStripes = element(root, 'mode-stripes');
  const fileInput = element<HTMLInputElement>(root, 'file-input');
  const gridMeta = element(root, 'grid-meta');

  function render(state: GridStoreState): void {
    const grid = state.grid;
    const total = grid ? grid.cols * grid.rows : 0;
    progress.textContent = `${state.completedCells.size} / ${total} done`;

    modeGrid.classList.toggle('active', state.viewMode === 'grid');
    modeStripes.classList.toggle('active', state.viewMode === 'stripes');

    if (grid) {
      gridMeta.textContent =
        `${grid.cols} × ${grid.rows} grid (${(grid.cols * grid.rows * 3).toLocaleString()} stripes) · ` +
        'Click (or drag) cells to mark done / undo · Drop any image';
      gridMeta.hidden = false;
    } else {
      gridMeta.hidden = true;
    }
  }

  function clearSampleSelection(): void {
    root.querySelectorAll<HTMLElement>('[data-ui="sample"]').forEach((chip) => {
      chip.classList.remove('active');
    });
  }

  const onReset = (): void => store.resetCompleted();
  const onModeGrid = (): void => store.setViewMode('grid');
  const onModeStripes = (): void => store.setViewMode('stripes');

  const onUpload = (): void => {
    const file = fileInput.files?.[0];
    if (!file) return;
    void readImageFile(file).then((image) => {
      fileInput.value = '';
      if (!image) return;
      clearSampleSelection();
      void store.loadImage(image);
    });
  };

  reset.addEventListener('click', onReset);
  modeGrid.addEventListener('click', onModeGrid);
  modeStripes.addEventListener('click', onModeStripes);
  fileInput.addEventListener('change', onUpload);

  const unsubscribe = store.subscribe(render);
  render(store.getState());

  return () => {
    unsubscribe();
    reset.removeEventListener('click', onReset);
    modeGrid.removeEventListener('click', onModeGrid);
    modeStripes.removeEventListener('click', onModeStripes);
    fileInput.removeEventListener('change', onUpload);
  };
}
