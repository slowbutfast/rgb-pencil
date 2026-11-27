import { exportGuidePdf, guideFilename } from '../engine/pdfExporter';
import type { GridStore, GridStoreState } from '../store/gridStore';
import type { ExportOptions, MatchedGrid, PencilPalette } from '../types/pipeline';
import { readImageFile } from './dropZone';

export interface TopBarDependencies {
  exportPdf?: (
    grid: MatchedGrid,
    palette: PencilPalette,
    options: ExportOptions,
  ) => Promise<Uint8Array>;
  download?: (bytes: Uint8Array, filename: string) => void;
}

function element<T extends HTMLElement>(root: HTMLElement, name: string): T {
  const found = root.querySelector<T>(`[data-ui="${name}"]`);
  if (!found) throw new Error(`Missing [data-ui="${name}"] element`);
  return found;
}

/** Trigger a browser download and revoke the Blob URL once the click is done. */
export function downloadPdf(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Floating top-bar pills: upload, progress readout, Reset, view toggle, and the
 * single Export PDF action (plus its dismissible inline error).
 */
export function mountTopBar(
  root: HTMLElement,
  store: GridStore,
  dependencies: TopBarDependencies = {},
): () => void {
  const progress = element(root, 'progress');
  const reset = element(root, 'reset');
  const modeGrid = element(root, 'mode-grid');
  const modeStripes = element(root, 'mode-stripes');
  const fileInput = element<HTMLInputElement>(root, 'file-input');
  const gridMeta = element(root, 'grid-meta');

  const exportPdf = dependencies.exportPdf ?? exportGuidePdf;
  const download = dependencies.download ?? downloadPdf;

  const pillGroups = root.querySelectorAll<HTMLElement>('.pill-group');
  const rightPill = pillGroups[pillGroups.length - 1] ?? element(root, 'top-bar');

  const exportButton = document.createElement('button');
  exportButton.type = 'button';
  exportButton.className = 'btn';
  exportButton.dataset.ui = 'export-pdf';
  exportButton.textContent = 'Export PDF';
  exportButton.disabled = true;
  rightPill.appendChild(exportButton);

  const topBar = element(root, 'top-bar');
  const statusStack = document.createElement('div');
  statusStack.style.position = 'absolute';
  statusStack.style.top = 'calc(100% + 6px)';
  statusStack.style.right = '0';
  statusStack.style.display = 'flex';
  statusStack.style.flexDirection = 'column';
  statusStack.style.alignItems = 'flex-end';
  statusStack.style.gap = '6px';
  statusStack.style.pointerEvents = 'none';
  topBar.appendChild(statusStack);

  function createInlineLine(ui: string, dismissLabel: string): {
    line: HTMLDivElement;
    text: HTMLSpanElement;
    dismiss: HTMLButtonElement;
  } {
    const line = document.createElement('div');
    line.dataset.ui = ui;
    line.hidden = true;
    line.style.display = 'none';
    line.style.alignItems = 'center';
    line.style.gap = '6px';
    line.style.padding = '3px 8px';
    line.style.borderRadius = '9999px';
    line.style.background = 'var(--surface-pill)';
    line.style.border = '1px solid var(--line)';
    line.style.boxShadow = 'var(--shadow-pill)';
    line.style.fontSize = '0.72rem';
    line.style.color = 'var(--ink-muted)';
    line.style.pointerEvents = 'auto';

    const text = document.createElement('span');
    text.dataset.ui = `${ui}-text`;
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'btn';
    dismiss.dataset.ui = `${ui}-dismiss`;
    dismiss.textContent = '\u00d7';
    dismiss.setAttribute('aria-label', dismissLabel);
    dismiss.style.padding = '0 4px';
    dismiss.style.fontSize = '0.9rem';
    dismiss.style.lineHeight = '1';
    line.append(text, dismiss);
    statusStack.appendChild(line);
    return { line, text, dismiss };
  }

  const exportLine = createInlineLine('export-error', 'Dismiss export error');
  const pipelineLine = createInlineLine('pipeline-error', 'Dismiss pipeline error');

  let busy = false;
  let exportError: string | null = null;
  let pipelineDismissed = false;
  let lastStatus: GridStoreState['status'] = 'idle';

  function render(state: GridStoreState): void {
    const grid = state.grid;
    const total = grid ? grid.cols * grid.rows : 0;
    const pending = state.status === 'pending';

    progress.textContent = pending ? 'Updating…' : `${state.completedCells.size} / ${total} done`;

    modeGrid.classList.toggle('active', state.viewMode === 'grid');
    modeStripes.classList.toggle('active', state.viewMode === 'stripes');

    exportButton.disabled = busy || !grid || pending;
    exportButton.textContent = busy ? 'Exporting…' : 'Export PDF';
    exportButton.title = !grid
      ? 'Load an image before exporting'
      : pending
        ? 'Waiting for the current grid to finish'
        : 'Export a printable drawing guide';

    const showExportError = exportError !== null;
    exportLine.line.hidden = !showExportError;
    exportLine.line.style.display = showExportError ? 'flex' : 'none';
    exportLine.text.textContent = exportError ?? '';

    if (state.status === 'error' && lastStatus !== 'error') pipelineDismissed = false;
    lastStatus = state.status;
    const showPipelineError = state.status === 'error' && !pipelineDismissed;
    pipelineLine.line.hidden = !showPipelineError;
    pipelineLine.line.style.display = showPipelineError ? 'flex' : 'none';
    pipelineLine.text.textContent = showPipelineError ? (state.error ?? 'Pipeline failed') : '';

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

  const onExport = async (): Promise<void> => {
    const state = store.getState();
    if (busy || !state.grid || state.status === 'pending') return;

    busy = true;
    exportError = null;
    render(store.getState());

    try {
      const bytes = await exportPdf(state.grid, state.grid.palette, state.exportOptions);
      download(bytes, guideFilename(state.grid.cols, state.grid.rows));
    } catch (error) {
      exportError = error instanceof Error ? error.message : 'PDF export failed';
    } finally {
      busy = false;
      render(store.getState());
    }
  };

  const onDismissError = (): void => {
    exportError = null;
    render(store.getState());
  };

  const onDismissPipelineError = (): void => {
    pipelineDismissed = true;
    render(store.getState());
  };

  reset.addEventListener('click', onReset);
  modeGrid.addEventListener('click', onModeGrid);
  modeStripes.addEventListener('click', onModeStripes);
  fileInput.addEventListener('change', onUpload);
  exportButton.addEventListener('click', onExport);
  exportLine.dismiss.addEventListener('click', onDismissError);
  pipelineLine.dismiss.addEventListener('click', onDismissPipelineError);

  const unsubscribe = store.subscribe(render);
  render(store.getState());

  return () => {
    unsubscribe();
    reset.removeEventListener('click', onReset);
    modeGrid.removeEventListener('click', onModeGrid);
    modeStripes.removeEventListener('click', onModeStripes);
    fileInput.removeEventListener('change', onUpload);
    exportButton.removeEventListener('click', onExport);
    exportLine.dismiss.removeEventListener('click', onDismissError);
    pipelineLine.dismiss.removeEventListener('click', onDismissPipelineError);
    exportButton.remove();
    statusStack.remove();
  };
}
