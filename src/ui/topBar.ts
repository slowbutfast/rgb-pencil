import { exportGuidePdf, guideFilename } from '../engine/pdfExporter';
import type { GridStore, GridStoreState } from '../store/gridStore';
import {
  VIEW_MODE_LABELS,
  VIEW_MODE_ORDER,
  type ExportOptions,
  type MatchedGrid,
  type PencilPalette,
  type ViewMode,
} from '../types/pipeline';
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
  const viewModeMenu = element<HTMLElement>(root, 'view-mode-menu');
  const viewModeTrigger = element<HTMLButtonElement>(root, 'view-mode-trigger');
  const viewModeDropdown = element<HTMLElement>(root, 'view-mode-dropdown');
  const viewModeLabel = element<HTMLElement>(root, 'view-mode-label');
  const viewModeOptions = Array.from(
    root.querySelectorAll<HTMLButtonElement>('[data-ui="view-mode-option"]'),
  );
  const focusBar = element<HTMLElement>(root, 'focus-bar');
  const focusInput = element<HTMLInputElement>(root, 'focus-input');
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
      line.dataset.ui = banner.id === 'filters' ? 'filters-banner' : `banner-${banner.id}`;
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

  // --- View-mode dropdown ---------------------------------------------------
  const hoverQuery =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(hover: hover) and (pointer: fine)')
      : null;
  let hoverCapable = hoverQuery?.matches ?? false;
  let menuOpen = false;

  function setMenuOpen(open: boolean): void {
    menuOpen = open;
    viewModeMenu.classList.toggle('open', open);
    viewModeDropdown.classList.toggle('open', open);
    viewModeTrigger.setAttribute('aria-expanded', String(open));
  }

  function optionIndex(element: Element | null): number {
    return viewModeOptions.indexOf(element as HTMLButtonElement);
  }

  function focusOption(index: number): void {
    const count = viewModeOptions.length;
    if (count === 0) return;
    viewModeOptions[((index % count) + count) % count]?.focus();
  }

  const onViewModeTriggerClick = (): void => {
    if (hoverCapable) {
      // Hover already drives the open state on desktop; a click must not fight it.
      if (!menuOpen) setMenuOpen(true);
      return;
    }
    setMenuOpen(!menuOpen);
  };

  const onViewModeMenuEnter = (): void => {
    if (hoverCapable) setMenuOpen(true);
  };

  const onViewModeMenuLeave = (): void => {
    if (hoverCapable) setMenuOpen(false);
  };

  const onDocumentPointerDown = (event: PointerEvent): void => {
    if (!menuOpen) return;
    const target = event.target;
    if (target instanceof Node && viewModeMenu.contains(target)) return;
    // Never consume the press: it must still reach the element that was hit.
    setMenuOpen(false);
  };

  const onViewModeMenuFocusOut = (event: FocusEvent): void => {
    if (!menuOpen) return;
    const next = event.relatedTarget;
    // Safari does not focus buttons on click, so a null destination means the
    // option press itself is still in flight; closing here would swallow it.
    if (next === null) return;
    if (next instanceof Node && viewModeMenu.contains(next)) return;
    setMenuOpen(false);
  };

  const onHoverCapabilityChange = (event: MediaQueryListEvent): void => {
    hoverCapable = event.matches;
    if (!hoverCapable) setMenuOpen(false);
  };

  const onViewModeTriggerKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      setMenuOpen(false);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    setMenuOpen(true);
    focusOption(event.key === 'ArrowDown' ? 0 : viewModeOptions.length - 1);
  };

  const onViewModeDropdownKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setMenuOpen(false);
      viewModeTrigger.focus();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const current = optionIndex(document.activeElement);
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    focusOption(current === -1 ? 0 : current + delta);
  };

  const onViewModeOptionClick = (event: MouseEvent): void => {
    const option = event.currentTarget as HTMLButtonElement;
    const mode = option.dataset.mode as ViewMode | undefined;
    if (!mode) return;
    store.setViewMode(mode);
    setMenuOpen(false);
    // Pointer users must not leave the trigger focused (Space would activate
    // it); keyboard users should land back on the trigger per the menu pattern.
    if (event.detail === 0) viewModeTrigger.focus();
    else viewModeTrigger.blur();
  };

  // --- Focus pill -----------------------------------------------------------
  let pendingBlurFrame: number | null = null;
  let latestBlurCells = 0;

  const onFocusInput = (): void => {
    const value = Number(focusInput.value);
    if (!Number.isFinite(value)) return;
    latestBlurCells = value;
    if (pendingBlurFrame !== null) return;
    pendingBlurFrame = requestAnimationFrame(() => {
      pendingBlurFrame = null;
      store.setBlurCells(latestBlurCells);
    });
  };

  // --- Hold Space to squint -------------------------------------------------
  const NON_TEXT_INPUT_TYPES = new Set([
    'range',
    'checkbox',
    'radio',
    'button',
    'submit',
    'reset',
    'color',
    'file',
    'image',
    'hidden',
  ]);

  function isTextEntryTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true;
    if (target.tagName === 'INPUT') {
      const type = (target as HTMLInputElement).type;
      return !NON_TEXT_INPUT_TYPES.has(type);
    }
    return false;
  }

  function isNativeSpaceControl(target: Element | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.tagName === 'BUTTON' || target.tagName === 'SUMMARY') return true;
    if (target.tagName === 'INPUT') {
      const type = (target as HTMLInputElement).type;
      return (
        type === 'checkbox' ||
        type === 'radio' ||
        type === 'button' ||
        type === 'submit' ||
        type === 'reset'
      );
    }
    const role = target.getAttribute('role');
    return role === 'button' || role === 'menuitemradio';
  }

  function isSpaceKey(event: KeyboardEvent): boolean {
    return event.code === 'Space' || event.key === ' ';
  }

  const onSpaceKeyDown = (event: KeyboardEvent): void => {
    if (!isSpaceKey(event) || event.repeat) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const state = store.getState();
    if (state.painting || state.viewMode === 'squint') return;
    if (isTextEntryTarget(event.target)) return;
    // A keyboard-focused activatable control keeps its native Space activation.
    if (isNativeSpaceControl(document.activeElement)) return;
    store.setSquintPeek(true);
    event.preventDefault();
  };

  const onSpaceKeyUp = (event: KeyboardEvent): void => {
    if (!isSpaceKey(event)) return;
    if (!store.getState().squintPeek) return;
    store.setSquintPeek(false);
    event.preventDefault();
  };

  const releasePeek = (): void => {
    if (store.getState().squintPeek) store.setSquintPeek(false);
  };

  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') releasePeek();
  };

  const onTopBarPointerClick = (event: MouseEvent): void => {
    if (event.detail <= 0) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && topBar.contains(active)) active.blur();
  };

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

    viewModeLabel.textContent = VIEW_MODE_LABELS[state.viewMode];
    viewModeOptions.forEach((option, index) => {
      option.setAttribute('aria-checked', String(VIEW_MODE_ORDER[index] === state.viewMode));
    });

    const showFocusBar = state.viewMode === 'squint' && !state.squintPeek;
    focusBar.hidden = !showFocusBar;
    if (showFocusBar) {
      // The DOM value is the drag source of truth until the coalesced frame
      // commits; an unrelated render must not snap the thumb back.
      if (pendingBlurFrame === null) {
        focusInput.value = String(state.blurCells);
      }
      focusInput.setAttribute(
        'aria-valuetext',
        `${Number(state.blurCells.toFixed(2))} cells`,
      );
    }
    exportButton.disabled = busy || !grid || pending || state.filtersActive;
    exportButton.textContent = busy ? 'Exporting…' : 'Export PDF';
    exportButton.title = state.filtersActive
      ? 'Disabled while experimental colour filters are active'
      : !grid
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
    if (busy || !state.grid || state.status === 'pending' || state.filtersActive) return;

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
  viewModeTrigger.addEventListener('click', onViewModeTriggerClick);
  viewModeMenu.addEventListener('mouseenter', onViewModeMenuEnter);
  viewModeMenu.addEventListener('mouseleave', onViewModeMenuLeave);
  viewModeTrigger.addEventListener('keydown', onViewModeTriggerKeyDown);
  viewModeDropdown.addEventListener('keydown', onViewModeDropdownKeyDown);
  viewModeMenu.addEventListener('focusout', onViewModeMenuFocusOut);
  viewModeOptions.forEach((option) =>
    option.addEventListener('click', onViewModeOptionClick),
  );
  focusInput.addEventListener('input', onFocusInput);
  document.addEventListener('pointerdown', onDocumentPointerDown, true);
  if (hoverQuery) {
    if (typeof hoverQuery.addEventListener === 'function') {
      hoverQuery.addEventListener('change', onHoverCapabilityChange);
    } else if (typeof hoverQuery.addListener === 'function') {
      hoverQuery.addListener(onHoverCapabilityChange);
    }
  }
  document.addEventListener('keydown', onSpaceKeyDown);
  document.addEventListener('keyup', onSpaceKeyUp);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('blur', releasePeek);
  topBar.addEventListener('click', onTopBarPointerClick);
  fileInput.addEventListener('change', onUpload);
  exportButton.addEventListener('click', onExport);
  exportLine.dismiss.addEventListener('click', onDismissError);
  pipelineLine.dismiss.addEventListener('click', onDismissPipelineError);

  const unsubscribe = store.subscribe(render);
  render(store.getState());

  return () => {
    unsubscribe();
    reset.removeEventListener('click', onReset);
    viewModeTrigger.removeEventListener('click', onViewModeTriggerClick);
    viewModeMenu.removeEventListener('mouseenter', onViewModeMenuEnter);
    viewModeMenu.removeEventListener('mouseleave', onViewModeMenuLeave);
    viewModeTrigger.removeEventListener('keydown', onViewModeTriggerKeyDown);
    viewModeDropdown.removeEventListener('keydown', onViewModeDropdownKeyDown);
    viewModeMenu.removeEventListener('focusout', onViewModeMenuFocusOut);
    viewModeOptions.forEach((option) =>
      option.removeEventListener('click', onViewModeOptionClick),
    );
    focusInput.removeEventListener('input', onFocusInput);
    document.removeEventListener('pointerdown', onDocumentPointerDown, true);
    if (hoverQuery) {
      if (typeof hoverQuery.removeEventListener === 'function') {
        hoverQuery.removeEventListener('change', onHoverCapabilityChange);
      } else if (typeof hoverQuery.removeListener === 'function') {
        hoverQuery.removeListener(onHoverCapabilityChange);
      }
    }
    document.removeEventListener('keydown', onSpaceKeyDown);
    document.removeEventListener('keyup', onSpaceKeyUp);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('blur', releasePeek);
    topBar.removeEventListener('click', onTopBarPointerClick);
    if (pendingBlurFrame !== null) cancelAnimationFrame(pendingBlurFrame);
    pendingBlurFrame = null;
    fileInput.removeEventListener('change', onUpload);
    exportButton.removeEventListener('click', onExport);
    exportLine.dismiss.removeEventListener('click', onDismissError);
    pipelineLine.dismiss.removeEventListener('click', onDismissPipelineError);
    exportButton.remove();
    saveStatus.remove();
    bannerStack.remove();
  };
}
