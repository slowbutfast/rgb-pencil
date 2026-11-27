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
  // Keep the synthetic download click from bubbling to document-level
  // handlers (which would close the Settings popover / dismiss UI).
  anchor.addEventListener('click', (event) => event.stopPropagation());
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
  const reset = element<HTMLButtonElement>(root, 'reset');
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

  const saveStatus = document.createElement('span');
  saveStatus.dataset.ui = 'save-status';
  saveStatus.className = 'save-status';
  saveStatus.setAttribute('role', 'status');
  rightPill.appendChild(saveStatus);

  const topBar = element(root, 'top-bar');
  const stage = root.querySelector<HTMLElement>('[data-ui="stage"]') ?? topBar.parentElement;
  const bannerStack = document.createElement('div');
  bannerStack.dataset.ui = 'banner-stack';
  bannerStack.className = 'banner-stack';
  // Banners live in the stage's normal flow immediately above the canvas, so
  // they reserve vertical space instead of overlaying grid cells.
  const gridFrame = stage?.querySelector<HTMLElement>('.grid-frame') ?? null;
  if (stage && gridFrame) stage.insertBefore(bannerStack, gridFrame);
  else if (stage) stage.appendChild(bannerStack);
  else topBar.appendChild(bannerStack);

  const statusStack = document.createElement('div');
  statusStack.className = 'notice-stack';
  statusStack.style.display = 'flex';
  statusStack.style.flexDirection = 'column';
  statusStack.style.alignItems = 'flex-end';
  statusStack.style.gap = '6px';
  statusStack.style.pointerEvents = 'none';
  bannerStack.appendChild(statusStack);

  const bannerList = document.createElement('div');
  bannerList.dataset.ui = 'banner-list';
  bannerList.className = 'banner-list';
  bannerStack.appendChild(bannerList);

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

  function bannerButton(
    label: string,
    ui: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn banner-action';
    button.dataset.ui = ui;
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }

  let lastBannerHeight = -1;

  function renderBanners(state: GridStoreState): void {
    bannerList.replaceChildren();

    for (const banner of state.banners) {
      const line = document.createElement('div');
      line.className = 'banner';
      line.dataset.ui = `banner-${banner.id}`;
      line.dataset.bannerId = banner.id;

      const text = document.createElement('span');
      text.dataset.ui = `banner-${banner.id}-text`;
      text.textContent = banner.text;
      line.appendChild(text);

      if (banner.id === 'read-only') {
        line.appendChild(
          bannerButton('Take over', 'take-over', () => {
            void store.takeOver();
          }),
        );
      }
      if (banner.id === 'reload') {
        line.appendChild(
          bannerButton('Reload project', 'reload-project', () => {
            void store.reloadProject();
          }),
        );
      }

      // Read-only keeps its Take over control; a dismiss would remove the only
      // way back to write ownership.
      if (banner.id !== 'read-only') {
        const dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.className = 'btn banner-dismiss';
        dismiss.dataset.ui = `banner-${banner.id}-dismiss`;
        dismiss.textContent = '\u00d7';
        dismiss.setAttribute('aria-label', `Dismiss ${banner.id} message`);
        dismiss.addEventListener('click', () => store.dismissBanner(banner.id));
        line.appendChild(dismiss);
      }

      bannerList.appendChild(line);
    }

    if (state.sameImageOffer) {
      const line = document.createElement('div');
      line.className = 'banner';
      line.dataset.ui = 'same-image-offer';
      const text = document.createElement('span');
      text.textContent = 'This image already has a project at this width.';
      line.appendChild(text);
      line.appendChild(
        bannerButton('Resume existing', 'same-image-resume', () => {
          void store.resolveSameImage('resume');
        }),
      );
      line.appendChild(
        bannerButton('Start new copy', 'same-image-copy', () => {
          void store.resolveSameImage('copy');
        }),
      );
      bannerList.appendChild(line);
    }

    bannerList.style.display = bannerList.childElementCount > 0 ? 'flex' : 'none';

    // A banner changing the stack height must make the canvas re-fit so the
    // grid shrinks/shifts instead of colliding with the new lines.
    const height = bannerStack.getBoundingClientRect().height;
    if (height !== lastBannerHeight) {
      lastBannerHeight = height;
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('resize'));
    }
  }

  let busy = false;
  let exportError: string | null = null;
  let pipelineDismissed = false;
  let lastStatus: GridStoreState['status'] = 'idle';

  function render(state: GridStoreState): void {
    const grid = state.grid;
    const total = grid ? grid.cols * grid.rows : 0;
    const pending = state.status === 'pending';

    progress.textContent = pending ? 'Updating…' : `${state.completedCells.size} / ${total} done`;

    if (state.saveStatus === 'saving') {
      saveStatus.textContent = 'Saving…';
      saveStatus.className = 'save-status';
    } else if (state.saveStatus === 'saved') {
      saveStatus.textContent = 'Saved';
      saveStatus.className = 'save-status';
    } else if (state.saveStatus === 'memory-only') {
      saveStatus.textContent = 'Storage unavailable';
      saveStatus.className = 'save-status warning';
      saveStatus.title = state.banners.find((b) => b.id === 'memory-only')?.text ?? '';
    } else if (state.saveStatus === 'error') {
      saveStatus.textContent = state.saveError ?? 'Save failed';
      saveStatus.className = 'save-status warning';
    } else {
      saveStatus.textContent = '';
      saveStatus.className = 'save-status';
    }

    reset.disabled = state.readOnly;
    reset.title = state.readOnly ? 'Read-only: another tab owns this project' : 'Reset all completed pixels';

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

    // An empty status stack must not contribute a flex gap, otherwise the
    // no-banner layout would shift the grid by a few pixels.
    statusStack.style.display = showExportError || showPipelineError ? 'flex' : 'none';

    renderBanners(state);

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
      void store.loadImage(image, { name: file.name });
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
    saveStatus.remove();
    bannerStack.remove();
  };
}
