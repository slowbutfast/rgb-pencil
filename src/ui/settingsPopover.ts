import { renderSampleScene, SAMPLE_SCENE_NAMES, type SampleSceneName } from '../engine/sampleScenes';
import type { GridStore, GridStoreState } from '../store/gridStore';
import type { ProjectSummary } from '../store/projectDb';
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

function formatUpdated(updatedAt: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - updatedAt) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(updatedAt).toLocaleDateString();
}

function downloadText(text: string, filename: string, type: string): void {
  try {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    // The anchor lives on document.body, so a bubbling synthetic click would
    // reach the popover's outside-click handler and close Settings.
    anchor.addEventListener('click', (event) => event.stopPropagation());
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  } catch {
    /* download support is best-effort */
  }
}

/**
 * Collapsed-by-default Settings popover: sample scenes, grid width, contrast,
 * palette, dithering, export options, and the Projects section.
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

  // --- Projects section -----------------------------------------------------
  const projectsSection = document.createElement('div');
  projectsSection.className = 'projects-section';
  projectsSection.dataset.ui = 'projects-section';

  const projectsHead = document.createElement('div');
  projectsHead.className = 'setting-head';
  const projectsLabel = document.createElement('span');
  projectsLabel.textContent = 'Projects';
  projectsHead.appendChild(projectsLabel);

  const projectStatus = document.createElement('div');
  projectStatus.className = 'project-status';
  projectStatus.dataset.ui = 'project-status';
  projectStatus.hidden = true;
  const projectStatusText = document.createElement('span');
  projectStatusText.dataset.ui = 'project-status-text';
  const projectStatusDismiss = document.createElement('button');
  projectStatusDismiss.type = 'button';
  projectStatusDismiss.className = 'btn banner-dismiss';
  projectStatusDismiss.dataset.ui = 'project-status-dismiss';
  projectStatusDismiss.textContent = '\u00d7';
  projectStatusDismiss.setAttribute('aria-label', 'Dismiss project message');
  projectStatus.append(projectStatusText, projectStatusDismiss);

  const projectList = document.createElement('div');
  projectList.className = 'project-list';
  projectList.dataset.ui = 'project-list';

  const projectActions = document.createElement('div');
  projectActions.className = 'project-actions';
  const exportProject = document.createElement('button');
  exportProject.type = 'button';
  exportProject.className = 'btn';
  exportProject.dataset.ui = 'project-export';
  exportProject.textContent = 'Export project';
  const importLabel = document.createElement('label');
  importLabel.className = 'btn';
  importLabel.dataset.ui = 'project-import';
  importLabel.textContent = 'Import project';
  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = '.json,application/json';
  importInput.dataset.ui = 'project-file-input';
  importInput.className = 'upload-input';
  importLabel.appendChild(importInput);
  const startNew = document.createElement('button');
  startNew.type = 'button';
  startNew.className = 'btn';
  startNew.dataset.ui = 'project-new';
  startNew.textContent = 'Start new drawing from this image';
  projectActions.append(exportProject, importLabel, startNew);

  projectsSection.append(projectsHead, projectStatus, projectList, projectActions);
  popover.prepend(projectsSection);

  // --- Lock caption + confirm row ------------------------------------------
  const lockCaption = document.createElement('div');
  lockCaption.className = 'settings-lock-caption';
  lockCaption.dataset.ui = 'settings-lock-caption';
  lockCaption.hidden = true;
  const colsRow = colsInput.closest('.setting-row');
  if (colsRow?.parentElement) colsRow.parentElement.insertBefore(lockCaption, colsRow.nextSibling);
  else popover.appendChild(lockCaption);

  const confirmRow = document.createElement('div');
  confirmRow.className = 'inline-confirm';
  confirmRow.dataset.ui = 'settings-confirm';
  confirmRow.hidden = true;
  const confirmText = document.createElement('span');
  confirmText.dataset.ui = 'settings-confirm-text';
  const confirmApply = document.createElement('button');
  confirmApply.type = 'button';
  confirmApply.className = 'btn';
  confirmApply.dataset.ui = 'settings-confirm-apply';
  confirmApply.textContent = 'Apply';
  const confirmCancel = document.createElement('button');
  confirmCancel.type = 'button';
  confirmCancel.className = 'btn';
  confirmCancel.dataset.ui = 'settings-confirm-cancel';
  confirmCancel.textContent = 'Cancel';
  confirmRow.append(confirmText, confirmApply, confirmCancel);
  const contrastRow = contrastInput.closest('.setting-row');
  if (contrastRow?.parentElement) contrastRow.parentElement.insertBefore(confirmRow, contrastRow.nextSibling);
  else popover.appendChild(confirmRow);

  // --- Export options (Change 2, kept inside the same popover) --------------
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

  // --- Local UI state -------------------------------------------------------
  let renamingId: string | null = null;
  let renameDraft = '';
  let confirmDeleteId: string | null = null;
  let pendingConfirm:
    | { kind: 'contrast'; value: number }
    | { kind: 'dither'; value: boolean }
    | null = null;
  let lastListKey = '';
  let objectUrls: string[] = [];

  function setOpen(open: boolean): void {
    popover.classList.toggle('open', open);
    trigger.classList.toggle('active', open);
    trigger.setAttribute('aria-expanded', String(open));
  }

  function showStatus(message: string): void {
    projectStatusText.textContent = message;
    projectStatus.hidden = false;
  }

  function clearStatus(): void {
    projectStatusText.textContent = '';
    projectStatus.hidden = true;
  }

  function revokeUrls(): void {
    for (const url of objectUrls) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    }
    objectUrls = [];
  }

  function hideConfirm(): void {
    pendingConfirm = null;
    confirmRow.hidden = true;
    confirmText.textContent = '';
  }

  function button(label: string, ui: string, onClick: () => void): HTMLButtonElement {
    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'btn project-action';
    control.dataset.ui = ui;
    control.textContent = label;
    control.addEventListener('click', onClick);
    return control;
  }

  function renderProjectRow(project: ProjectSummary, readOnly: boolean): HTMLElement {
    const row = document.createElement('div');
    row.className = 'project-row';
    row.dataset.ui = 'project-row';
    row.dataset.projectId = project.id;

    if (project.thumb) {
      try {
        const url = URL.createObjectURL(project.thumb);
        objectUrls.push(url);
        const thumb = document.createElement('img');
        thumb.className = 'project-thumb';
        thumb.alt = '';
        thumb.src = url;
        row.appendChild(thumb);
      } catch {
        /* thumbnails are cosmetic */
      }
    }

    const info = document.createElement('div');
    info.className = 'project-info';
    const name = document.createElement('span');
    name.className = 'project-name';
    name.dataset.ui = 'project-name';
    name.textContent = project.name;
    const meta = document.createElement('span');
    meta.className = 'project-meta';
    meta.dataset.ui = 'project-meta';
    meta.textContent = `${project.doneCount} / ${project.cols * project.rows} · ${formatUpdated(project.updatedAt)}`;
    info.append(name, meta);
    row.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'project-row-actions';
    actions.appendChild(
      button('Open', 'project-open', () => {
        void store.openProject(project.id);
      }),
    );
    const rename = button('Rename', 'project-rename', () => {
      renamingId = project.id;
      renameDraft = project.name;
      confirmDeleteId = null;
      render(store.getState());
    });
    rename.disabled = readOnly;
    actions.appendChild(rename);
    const remove = button('Delete', 'project-delete', () => {
      confirmDeleteId = project.id;
      renamingId = null;
      render(store.getState());
    });
    remove.disabled = readOnly;
    actions.appendChild(remove);
    row.appendChild(actions);

    if (renamingId === project.id) {
      const inline = document.createElement('div');
      inline.className = 'inline-confirm';
      inline.dataset.ui = 'project-rename-confirm';
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 60;
      input.value = renameDraft;
      input.dataset.ui = 'project-rename-input';
      input.addEventListener('input', () => {
        renameDraft = input.value;
      });
      const save = button('Save', 'project-rename-save', () => {
        const next = renameDraft;
        renamingId = null;
        void store.renameProject(project.id, next).then((result) => {
          if (!result.ok) showStatus(result.message ?? 'Rename failed');
          render(store.getState());
        });
      });
      const cancel = button('Cancel', 'project-rename-cancel', () => {
        renamingId = null;
        render(store.getState());
      });
      inline.append(input, save, cancel);
      row.appendChild(inline);
    }

    if (confirmDeleteId === project.id) {
      const inline = document.createElement('div');
      inline.className = 'inline-confirm';
      inline.dataset.ui = 'project-delete-confirm';
      const text = document.createElement('span');
      text.textContent = 'Delete this project?';
      const yes = button('Delete', 'project-delete-confirm-yes', () => {
        confirmDeleteId = null;
        void store.deleteProject(project.id).then((result) => {
          if (!result.ok) showStatus(result.message ?? 'Delete failed');
          render(store.getState());
        });
      });
      const cancel = button('Cancel', 'project-delete-cancel', () => {
        confirmDeleteId = null;
        render(store.getState());
      });
      inline.append(text, yes, cancel);
      row.appendChild(inline);
    }

    return row;
  }

  function renderProjects(state: GridStoreState): void {
    const key = [
      state.projects
        .map((p) => `${p.id}:${p.name}:${p.doneCount}:${p.updatedAt}:${p.cols}x${p.rows}`)
        .join('|'),
      renamingId ?? '',
      confirmDeleteId ?? '',
      state.readOnly ? 'ro' : 'rw',
      state.projects.some((p) => p.thumb) ? 'thumbs' : '',
    ].join('#');
    if (key === lastListKey) return;
    lastListKey = key;

    revokeUrls();
    projectList.replaceChildren();
    if (state.projects.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'project-empty';
      empty.textContent = 'No saved projects yet.';
      projectList.appendChild(empty);
      return;
    }
    for (const project of state.projects) {
      projectList.appendChild(renderProjectRow(project, state.readOnly));
    }
  }

  function render(state: GridStoreState): void {
    // The same-image offer is rendered in the top-bar banner slot; close the
    // popover so it cannot cover the Resume / Start-new-copy buttons.
    if (state.sameImageOffer && popover.classList.contains('open')) setOpen(false);

    const doneCount = state.completedCells.size;
    const geometryLocked = doneCount > 0 || state.readOnly;

    colsInput.value = String(state.settings.cols);
    colsValue.textContent = `${state.settings.cols} px`;
    contrastInput.value = state.settings.contrast.toFixed(2);
    contrastValue.textContent = `${state.settings.contrast.toFixed(2)}×`;
    paletteInput.value = state.settings.palette;
    ditherInput.checked = state.settings.dither;

    colsInput.disabled = geometryLocked;
    paletteInput.disabled = geometryLocked;
    contrastInput.disabled = state.readOnly;
    ditherInput.disabled = state.readOnly;

    if (doneCount > 0) {
      lockCaption.hidden = false;
      lockCaption.textContent =
        'Settings are locked while drawing. Undo all completed cells to change width or palette.';
    } else if (state.readOnly) {
      lockCaption.hidden = false;
      lockCaption.textContent = 'Read-only: another tab owns this project.';
    } else {
      lockCaption.hidden = true;
      lockCaption.textContent = '';
    }

    if (pendingConfirm && doneCount === 0) {
      hideConfirm();
      ditherInput.checked = state.settings.dither;
      contrastInput.value = state.settings.contrast.toFixed(2);
    }

    exportProject.disabled = !state.grid;
    startNew.disabled = !state.grid || state.readOnly || state.sameImageOffer !== null;
    importInput.disabled = state.readOnly;

    pageSizeInput.value = state.exportOptions.pageSize;
    templateInput.checked = state.exportOptions.includeTemplate;
    cellInput.value = String(state.exportOptions.templateCellMm);
    cellValue.textContent = `${state.exportOptions.templateCellMm} mm`;

    renderProjects(state);
  }

  const onTrigger = (event: MouseEvent): void => {
    event.stopPropagation();
    const opening = !popover.classList.contains('open');
    setOpen(opening);
    // The list shows live done / total counts, so refresh it when it opens.
    if (opening) void store.refreshProjects();
  };

  const onDocumentClick = (event: MouseEvent): void => {
    // Project-row actions re-render the list, so by the time this handler runs
    // the clicked node may already be detached and `contains` would be false.
    // `composedPath()` is captured at dispatch time, so detached nodes remain in
    // the path and the popover correctly stays open.
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    if (path.includes(popover) || path.includes(trigger)) return;

    const target = event.target;
    if (!(target instanceof Node)) return;
    if (popover.contains(target) || trigger.contains(target)) return;
    setOpen(false);
  };

  const onCols = (): void => {
    void store.setCols(Number(colsInput.value));
  };

  const onContrast = (): void => {
    const value = Number(contrastInput.value);
    if (store.getState().completedCells.size > 0 && value !== store.getState().settings.contrast) {
      pendingConfirm = { kind: 'contrast', value };
      confirmText.textContent =
        'Finished cells may no longer match the paper drawing if contrast changes.';
      confirmRow.hidden = false;
      return;
    }
    void store.setContrast(value);
  };

  const onPalette = (): void => {
    void store.setPalette(paletteInput.value as PaletteKey);
  };

  const onDither = (): void => {
    const value = ditherInput.checked;
    if (store.getState().completedCells.size > 0) {
      ditherInput.checked = store.getState().settings.dither;
      pendingConfirm = { kind: 'dither', value };
      confirmText.textContent =
        'Finished cells may no longer match the paper drawing if dithering changes.';
      confirmRow.hidden = false;
      return;
    }
    void store.setDither(value);
  };

  const onConfirmApply = (): void => {
    const pending = pendingConfirm;
    hideConfirm();
    if (!pending) return;
    if (pending.kind === 'contrast') {
      void store.setContrast(pending.value, { confirmed: true });
    } else {
      void store.setDither(pending.value, { confirmed: true });
    }
  };

  const onConfirmCancel = (): void => {
    hideConfirm();
    const state = store.getState();
    contrastInput.value = state.settings.contrast.toFixed(2);
    ditherInput.checked = state.settings.dither;
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

  const onExportProject = (): void => {
    void store.exportProject().then((result) => {
      if (result.ok) downloadText(result.text, result.filename, 'application/json');
      else showStatus(result.message);
    });
  };

  const onImportProject = (): void => {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (!file) return;
    void store.importProject(file).then((result) => {
      if (!result.ok) showStatus(result.message ?? 'Import failed');
    });
  };

  const onStartNew = (): void => {
    void store.startNewDrawingFromImage().then((result) => {
      if (!result.ok) showStatus(result.message ?? 'Could not start a new drawing');
    });
  };

  const onDismissStatus = (): void => clearStatus();

  const onSample = (chip: HTMLElement): void => {
    const scene = chip.dataset.scene ?? '';
    if (!isSampleScene(scene)) return;
    chips.forEach((candidate) => candidate.classList.toggle('active', candidate === chip));
    const canvas = renderSampleScene(scene);
    const image = readImageElement(canvas);
    if (image) void store.loadImage(image, { name: 'Sample scene' });
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
  confirmApply.addEventListener('click', onConfirmApply);
  confirmCancel.addEventListener('click', onConfirmCancel);
  pageSizeInput.addEventListener('change', onPageSize);
  templateInput.addEventListener('change', onTemplate);
  cellInput.addEventListener('input', onTemplateCell);
  exportProject.addEventListener('click', onExportProject);
  importInput.addEventListener('change', onImportProject);
  startNew.addEventListener('click', onStartNew);
  projectStatusDismiss.addEventListener('click', onDismissStatus);

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
    confirmApply.removeEventListener('click', onConfirmApply);
    confirmCancel.removeEventListener('click', onConfirmCancel);
    pageSizeInput.removeEventListener('change', onPageSize);
    templateInput.removeEventListener('change', onTemplate);
    cellInput.removeEventListener('input', onTemplateCell);
    exportProject.removeEventListener('click', onExportProject);
    importInput.removeEventListener('change', onImportProject);
    startNew.removeEventListener('click', onStartNew);
    projectStatusDismiss.removeEventListener('click', onDismissStatus);
    revokeUrls();
    projectsSection.remove();
    lockCaption.remove();
    confirmRow.remove();
    pageSizeRow.remove();
    templateRow.remove();
    cellRow.remove();
    sampleHandlers.forEach(({ chip, handler }) => chip.removeEventListener('click', handler));
  };
}
