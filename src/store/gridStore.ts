import { prepareWorkingBitmap } from '../engine/workingBitmap';
import {
  MAX_COLS,
  MAX_CONTRAST,
  MAX_TEMPLATE_MM,
  MIN_COLS,
  MIN_CONTRAST,
  MIN_TEMPLATE_MM,
  DEFAULT_EXPORT_OPTIONS,
  DEFAULT_SETTINGS,
  cellKey,
  parseCellKey,
  type CellCoord,
  type EngineClient,
  type ExportOptions,
  type MatchedGrid,
  type PaletteKey,
  type PipelineSettings,
  type PipelineStatus,
  type PointerType,
  type SourceImage,
  type ViewMode,
} from '../types/pipeline';

export const STORAGE_PREFIX = 'rgb-pencil:v1:';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface GridStoreOptions {
  client: EngineClient;
  /** `undefined` uses the browser localStorage; `null` disables persistence. */
  storage?: StorageLike | null;
}

export interface GridStoreState {
  settings: PipelineSettings;
  grid: MatchedGrid | null;
  viewMode: ViewMode;
  hoveredCell: CellCoord | null;
  completedCells: ReadonlySet<string>;
  status: PipelineStatus;
  error: string | null;
  latestJobId: number;
  lastPointerType: PointerType;
  exportOptions: ExportOptions;
}

export interface GridStore {
  getState(): GridStoreState;
  subscribe(listener: (state: GridStoreState) => void): () => void;
  loadImage(image: SourceImage): Promise<void>;
  setCols(cols: number): Promise<void>;
  setContrast(contrast: number): Promise<void>;
  setPalette(palette: PaletteKey): Promise<void>;
  setDither(dither: boolean): Promise<void>;
  setViewMode(mode: ViewMode): void;
  setHovered(cell: CellCoord | null): void;
  setLastPointerType(type: PointerType): void;
  setExportOptions(patch: Partial<ExportOptions>): void;
  toggleCell(col: number, row: number): void;
  paintCell(col: number, row: number, done: boolean): void;
  resetCompleted(): void;
}

function browserStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function isInside(grid: MatchedGrid, coord: CellCoord): boolean {
  return coord.col >= 0 && coord.col < grid.cols && coord.row >= 0 && coord.row < grid.rows;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Framework-free observable store for grid state and drawing progress. */
export function createGridStore(options: GridStoreOptions): GridStore {
  const client = options.client;
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const memory = new Map<string, string>();

  const listeners = new Set<(state: GridStoreState) => void>();
  let source: SourceImage | null = null;
  let jobToken = 0;

  let state: GridStoreState = {
    settings: { ...DEFAULT_SETTINGS },
    grid: null,
    viewMode: 'grid',
    hoveredCell: null,
    completedCells: new Set<string>(),
    status: 'idle',
    error: null,
    latestJobId: 0,
    lastPointerType: 'mouse',
    exportOptions: { ...DEFAULT_EXPORT_OPTIONS },
  };

  function readStorage(key: string): string | null {
    if (storage) {
      try {
        const value = storage.getItem(key);
        if (value !== null) {
          memory.set(key, value);
          return value;
        }
      } catch {
        /* fall through to the in-memory mirror */
      }
    }
    return memory.get(key) ?? null;
  }

  function writeStorage(key: string, value: string): void {
    memory.set(key, value);
    if (!storage) return;
    try {
      storage.setItem(key, value);
    } catch {
      /* quota/security failures degrade to in-memory persistence */
    }
  }

  function emit(): void {
    for (const listener of listeners) listener(state);
  }

  function setState(patch: Partial<GridStoreState>): void {
    state = { ...state, ...patch };
    emit();
  }

  function sanitizeCompleted(candidates: Iterable<string>, grid: MatchedGrid | null): Set<string> {
    const next = new Set<string>();
    if (!grid) return next;
    for (const key of candidates) {
      const coord = parseCellKey(key);
      if (coord && isInside(grid, coord)) next.add(cellKey(coord.col, coord.row));
    }
    return next;
  }

  function restoredFor(grid: MatchedGrid): Set<string> | null {
    const stored = readStorage(STORAGE_PREFIX + grid.sourceHash);
    if (!stored) return null;
    try {
      const parsed: unknown = JSON.parse(stored);
      if (!Array.isArray(parsed)) return null;
      return sanitizeCompleted(
        parsed.filter((entry): entry is string => typeof entry === 'string'),
        grid,
      );
    } catch {
      return null;
    }
  }

  function persist(): void {
    const grid = state.grid;
    if (!grid) return;
    const keys = [...state.completedCells].sort();
    writeStorage(STORAGE_PREFIX + grid.sourceHash, JSON.stringify(keys));
  }

  async function recompute(restore: boolean): Promise<void> {
    if (!source) return;
    const token = ++jobToken;
    setState({ status: 'pending', latestJobId: token, error: null });
    try {
      const result = await client.process({ image: source, settings: { ...state.settings } });
      if (token !== jobToken || !source) return;

      const grid = result.grid;
      let completed = sanitizeCompleted(state.completedCells, grid);
      if (restore) {
        const restored = restoredFor(grid);
        if (restored) completed = restored;
      }

      setState({ grid, completedCells: completed, status: 'idle', error: null });
      persist();
    } catch (error) {
      if (token !== jobToken) return;
      setState({ status: 'error', error: errorMessage(error) });
    }
  }

  async function updateSettings(patch: Partial<PipelineSettings>): Promise<void> {
    setState({ settings: { ...state.settings, ...patch } });
    await recompute(false);
  }

  return {
    getState() {
      return state;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async loadImage(image) {
      source = prepareWorkingBitmap(image);
      jobToken += 1;
      client.invalidate?.();
      setState({
        completedCells: new Set<string>(),
        latestJobId: jobToken,
        status: 'pending',
        error: null,
      });
      await recompute(true);
    },

    async setCols(cols) {
      const next = clamp(Math.round(cols), MIN_COLS, MAX_COLS);
      if (next === state.settings.cols) return;
      await updateSettings({ cols: next });
    },

    async setContrast(contrast) {
      const next = Math.round(clamp(contrast, MIN_CONTRAST, MAX_CONTRAST) * 100) / 100;
      if (next === state.settings.contrast) return;
      await updateSettings({ contrast: next });
    },

    async setPalette(palette) {
      if (palette === state.settings.palette) return;
      await updateSettings({ palette });
    },

    async setDither(dither) {
      if (dither === state.settings.dither) return;
      await updateSettings({ dither });
    },

    setViewMode(mode) {
      if (mode === state.viewMode) return;
      setState({ viewMode: mode });
    },

    setHovered(cell) {
      const current = state.hoveredCell;
      if (current === cell) return;
      if (current && cell && current.col === cell.col && current.row === cell.row) return;
      if (!current && !cell) return;
      setState({ hoveredCell: cell });
    },

    setLastPointerType(type) {
      if (type === state.lastPointerType) return;
      setState({ lastPointerType: type });
    },

    setExportOptions(patch) {
      const next: ExportOptions = { ...state.exportOptions, ...patch };
      next.templateCellMm = clamp(
        Math.round(next.templateCellMm),
        MIN_TEMPLATE_MM,
        MAX_TEMPLATE_MM,
      );
      setState({ exportOptions: next });
    },

    toggleCell(col, row) {
      const grid = state.grid;
      if (!grid) return;
      const coord = { col, row };
      if (!isInside(grid, coord)) return;
      const key = cellKey(col, row);
      const completed = new Set(state.completedCells);
      if (completed.has(key)) completed.delete(key);
      else completed.add(key);
      setState({ completedCells: completed });
      persist();
    },

    paintCell(col, row, done) {
      const grid = state.grid;
      if (!grid) return;
      const coord = { col, row };
      if (!isInside(grid, coord)) return;
      const key = cellKey(col, row);
      if (state.completedCells.has(key) === done) return;
      const completed = new Set(state.completedCells);
      if (done) completed.add(key);
      else completed.delete(key);
      setState({ completedCells: completed });
      persist();
    },

    resetCompleted() {
      if (state.completedCells.size === 0) return;
      setState({ completedCells: new Set<string>() });
      persist();
    },
  };
}
