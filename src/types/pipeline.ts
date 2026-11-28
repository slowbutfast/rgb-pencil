/**
 * Shared domain contracts for the RGB pencil optical-mixing workspace.
 *
 * This module is a pure domain kernel: it contains no DOM, worker, or UI code so
 * that the engine, the observable store, and the UI can all depend on it.
 */

/** The 5 discrete pencil treatments applied to one RGB stripe segment. */
export const SHADING_STATES = [
  { id: 0, symbol: '□', name: 'White Paper', legend: 'White Paper (Highlight)' },
  { id: 1, symbol: '●', name: 'Full Color', legend: 'Full Color' },
  { id: 2, symbol: '◐', name: 'Light Black', legend: 'Color + Light Black' },
  { id: 3, symbol: '◑', name: 'Heavy Black', legend: 'Color + Heavy Black' },
  { id: 4, symbol: '■', name: 'Solid Black', legend: 'Solid Black' },
] as const;

export type ShadingState = (typeof SHADING_STATES)[number];
export type ShadingStateId = ShadingState['id'];

export const PALETTE_KEYS = ['reflective', 'vibrant', 'emissive'] as const;
export type PaletteKey = (typeof PALETTE_KEYS)[number];

export const PALETTE_LABELS: Record<PaletteKey, string> = {
  reflective: 'Reflective Colored Pencils',
  vibrant: 'Vibrant Wax Pencils',
  emissive: 'Ideal Screen RGB',
};

/** sRGB triple in the 0–255 range. */
export type Rgb = readonly [number, number, number];
/** CIE L*a*b* triple (D65 white point). */
export type Lab = readonly [number, number, number];
/** One pencil colour series ordered by shading state id (0–4). */
export type ShadingSeries = readonly [Rgb, Rgb, Rgb, Rgb, Rgb];

export interface PencilPalette {
  key: PaletteKey;
  label: string;
  /** Dark border colour separating adjacent RGB stripe triplets. */
  border: Rgb;
  R: ShadingSeries;
  G: ShadingSeries;
  B: ShadingSeries;
}

/** One of the 125 (5 x 5 x 5) optical average candidates. */
export interface ComboLUTEntry {
  ri: ShadingStateId;
  gi: ShadingStateId;
  bi: ShadingStateId;
  /** Optical average in linear RGB (0–1 floats). */
  lin: Rgb;
  /** Optical average converted back to sRGB (0–255 integers). */
  srgb: Rgb;
  /** Optical average in CIELAB. */
  lab: Lab;
}

export interface PipelineSettings {
  cols: number;
  contrast: number;
  palette: PaletteKey;
  dither: boolean;
  ditherStrength: number;
}

export const MIN_COLS = 16;
export const MAX_COLS = 96;
export const MIN_CONTRAST = 1;
export const MAX_CONTRAST = 2.3;
export const DARK_BORDER_RATIO = 0.15;
export const CONTRAST_CENTER = 0.46;

export const DEFAULT_SETTINGS: PipelineSettings = {
  cols: 56,
  contrast: 1.45,
  palette: 'reflective',
  dither: true,
  ditherStrength: 0.85,
};

/** Colour-difference formula used to pick the nearest stripe combination. */
export type MatchMetric = 'de76' | 'de2000';

/**
 * Optional, session-only colour filters applied between contrast and matching.
 * Every field has an identity value, so `DEFAULT_FILTERS` is the current
 * behaviour. Never persisted and never part of `PipelineSettings`.
 */
export interface ColorFilters {
  /** 8-bit channel values strictly below this become 0. Integer `0-40`. */
  blackPoint: number;
  /** Per-channel multipliers on 8-bit sRGB values, each `0.6-1.4`. */
  gains: readonly [number, number, number];
  /** Multiplier on CIELAB `a*`/`b*`, `0.5-1.5`; `L*` is untouched. */
  chromaScale: number;
  /** Per-channel linear deviation bound, or `null` for unlimited. */
  errorLimit: number | null;
  metric: MatchMetric;
}

export const DEFAULT_FILTERS: ColorFilters = {
  blackPoint: 0,
  gains: [1, 1, 1],
  chromaScale: 1,
  errorLimit: null,
  metric: 'de76',
};

export const FILTER_BOUNDS = {
  blackPoint: [0, 40],
  gain: [0.6, 1.4],
  chromaScale: [0.5, 1.5],
  errorLimit: [0.02, 0.5],
} as const;

export function cloneFilters(filters: ColorFilters): ColorFilters {
  return { ...filters, gains: [...filters.gains] };
}

export function isDefaultFilters(filters: ColorFilters | undefined): boolean {
  if (!filters) return true;
  return (
    filters.blackPoint === DEFAULT_FILTERS.blackPoint &&
    filters.gains[0] === 1 &&
    filters.gains[1] === 1 &&
    filters.gains[2] === 1 &&
    filters.chromaScale === DEFAULT_FILTERS.chromaScale &&
    filters.errorLimit === DEFAULT_FILTERS.errorLimit &&
    filters.metric === DEFAULT_FILTERS.metric
  );
}

export interface FilterPreset {
  key: string;
  label: string;
  filters: ColorFilters;
}

/** The presets offered in Settings; `None` is the identity default. */
export const FILTER_PRESETS: readonly FilterPreset[] = [
  { key: 'none', label: 'None (baseline)', filters: { ...DEFAULT_FILTERS } },
  {
    key: 'warm-bias',
    label: 'Assessment: warm bias',
    filters: {
      blackPoint: 25,
      gains: [1.15, 0.8, 0.85],
      chromaScale: 1.2,
      errorLimit: null,
      metric: 'de76',
    },
  },
  {
    key: 'gamut-soft',
    label: 'Gamut-soft',
    filters: {
      blackPoint: 0,
      gains: [1, 1, 1],
      chromaScale: 0.85,
      errorLimit: 0.1,
      metric: 'de2000',
    },
  },
  {
    key: 'de2000',
    label: 'CIEDE2000 only',
    filters: {
      blackPoint: 0,
      gains: [1, 1, 1],
      chromaScale: 1,
      errorLimit: null,
      metric: 'de2000',
    },
  },
  {
    key: 'error-limit',
    label: 'Error limit only',
    filters: {
      blackPoint: 0,
      gains: [1, 1, 1],
      chromaScale: 1,
      errorLimit: 0.1,
      metric: 'de76',
    },
  },
];

/** Preset key matching the value exactly, or `custom` for any other value. */
export function presetKeyForFilters(filters: ColorFilters): string {
  for (const preset of FILTER_PRESETS) {
    if (
      preset.filters.blackPoint === filters.blackPoint &&
      preset.filters.gains[0] === filters.gains[0] &&
      preset.filters.gains[1] === filters.gains[1] &&
      preset.filters.gains[2] === filters.gains[2] &&
      preset.filters.chromaScale === filters.chromaScale &&
      preset.filters.errorLimit === filters.errorLimit &&
      preset.filters.metric === filters.metric
    ) {
      return preset.key;
    }
  }
  return 'custom';
}

/** Raw RGBA pixel buffer extracted from an image or canvas. */
export interface SourceImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface MatchedCell {
  ri: ShadingStateId;
  gi: ShadingStateId;
  bi: ShadingStateId;
  /** Contrast-boosted source colour (0–255 integers). */
  rgb: Rgb;
  /** Optical mix of the matched stripes in sRGB (0–255 integers). */
  srgb: Rgb;
  /** CIELAB ΔE76 distance between the boosted source and the optical mix. */
  deltaE: number;
}

/**
 * Flat, structured-clone-safe result grid. Per-cell values live in typed
 * arrays indexed row-major by `i = row * cols + col`; `target` stores the
 * contrast-boosted source colour as three consecutive bytes per cell.
 */
export interface MatchedGrid {
  cols: number;
  rows: number;
  ri: Uint8Array;
  gi: Uint8Array;
  bi: Uint8Array;
  deltaE: Float32Array;
  /** Contrast-boosted source RGB, length `3 * cols * rows`. */
  target: Uint8ClampedArray;
  palette: PencilPalette;
  sourceHash: string;
}

/** Bounded RGBA source sent to the pipeline (longest edge <= 512 px). */
export interface WorkingBitmap {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type ChannelId = 'R' | 'G' | 'B';

/** One maximal vertical run of a single shading state inside a stripe column. */
export interface RleRun {
  state: ShadingStateId;
  startRow: number;
  length: number;
}

/** The ordered top-to-bottom runs of one of the `3 * cols` stripe columns. */
export interface ColumnInstruction {
  stripeColumn: number;
  logicalColumn: number;
  channel: ChannelId;
  runs: RleRun[];
}

export type StateCounts = [number, number, number, number, number];

/** Inclusive 0-based rectangular window of the symbol chart. */
export interface ChartTile {
  colStart: number;
  colEnd: number;
  rowStart: number;
  rowEnd: number;
}

export type PageSize = 'a4' | 'letter';

export interface ExportOptions {
  pageSize: PageSize;
  includeTemplate: boolean;
  templateCellMm: number;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  pageSize: 'a4',
  includeTemplate: false,
  templateCellMm: 6,
};

export const MIN_TEMPLATE_MM = 4;
export const MAX_TEMPLATE_MM = 12;

export type PipelineStatus = 'idle' | 'pending' | 'error';
export type PointerType = 'mouse' | 'pen' | 'touch';

export interface PipelineRequest {
  image: SourceImage;
  settings: PipelineSettings;
  /** Experimental, session-only filters; omitted or `DEFAULT_FILTERS` is the baseline. */
  filters?: ColorFilters;
}

export interface PipelineResult {
  grid: MatchedGrid;
}

/** One worker round trip; `jobId` is echoed back in the response. */
export interface PipelineJobRequest {
  jobId: number;
  request: PipelineRequest;
}

export type PipelineResponse =
  | { ok: true; jobId: number; grid: MatchedGrid }
  | { ok: false; jobId: number; error: string };

/** The single seam between UI/state and computation. */
export interface EngineClient {
  process(request: PipelineRequest): Promise<PipelineResult>;
  /** Drop any in-flight/pending work after the source image changes. */
  invalidate?(): void;
  /** Release the worker (if any). */
  dispose?(): void;
}

export interface CellCoord {
  col: number;
  row: number;
}

export type ViewMode = 'grid' | 'stripes' | 'squint';

/** Fixed display order of the view-mode dropdown. */
export const VIEW_MODE_ORDER = ['grid', 'stripes', 'squint'] as const satisfies readonly ViewMode[];

export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  grid: 'Pixel Grid',
  stripes: 'Stripes',
  squint: 'Squint',
};

/** Focus radius bounds in logical cells. */
export const MIN_BLUR_CELLS = 0;
export const MAX_BLUR_CELLS = 1.5;
export const DEFAULT_BLUR_CELLS = 0.75;

export function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}

export function parseCellKey(key: string): CellCoord | null {
  const parts = key.split(',');
  if (parts.length !== 2) return null;
  const col = Number(parts[0]);
  const row = Number(parts[1]);
  if (!Number.isInteger(col) || !Number.isInteger(row)) return null;
  return { col, row };
}
