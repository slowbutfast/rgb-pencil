import {
  buildComboLUT,
  buildLabTable,
  deltaE2000Raw,
  labToLinearRgb,
  linearRgbToLab,
  linearToSrgb,
  srgbToLinear,
  type Lab,
} from './colorMath';
import { buildContrastLUT } from './contrast';
import { getPalette } from './palettes';
import {
  MAX_COLS,
  MIN_COLS,
  isDefaultFilters,
  type ColorFilters,
  type ComboLUTEntry,
  type MatchedCell,
  type MatchedGrid,
  type PencilPalette,
  type PipelineSettings,
  type ShadingStateId,
  type SourceImage,
} from '../types/pipeline';

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * Aspect-preserving row count for a given column width. Minimum 8 rows keeps
 * extremely wide panoramas inspectable.
 */
export function computeRows(cols: number, sourceWidth: number, sourceHeight: number): number {
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) return 8;
  const aspect = sourceHeight / sourceWidth;
  return Math.max(8, Math.round(cols * aspect));
}

/**
 * Area-average (box filter) downsample of an RGBA source into `cols x rows`
 * RGB triples. Each destination cell is the exact weighted average of the
 * source pixels it covers, so resampling is deterministic and aspect-safe.
 */
export function downsampleAreaAverage(
  image: SourceImage,
  cols: number,
  rows: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(cols * rows * 3);
  const data = image.data;
  const scaleX = image.width / cols;
  const scaleY = image.height / rows;

  for (let row = 0; row < rows; row += 1) {
    const y0 = row * scaleY;
    const y1 = y0 + scaleY;
    const iy0 = Math.floor(y0);
    const iy1 = Math.min(image.height, Math.ceil(y1));

    for (let col = 0; col < cols; col += 1) {
      const x0 = col * scaleX;
      const x1 = x0 + scaleX;
      const ix0 = Math.floor(x0);
      const ix1 = Math.min(image.width, Math.ceil(x1));

      let red = 0;
      let green = 0;
      let blue = 0;
      let total = 0;

      for (let sy = iy0; sy < iy1; sy += 1) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        if (wy <= 0) continue;
        for (let sx = ix0; sx < ix1; sx += 1) {
          const wx = Math.min(x1, sx + 1) - Math.max(x0, sx);
          if (wx <= 0) continue;
          const weight = wx * wy;
          const p = (sy * image.width + sx) * 4;
          red += data[p]! * weight;
          green += data[p + 1]! * weight;
          blue += data[p + 2]! * weight;
          total += weight;
        }
      }

      const index = (row * cols + col) * 3;
      out[index] = total > 0 ? red / total : 0;
      out[index + 1] = total > 0 ? green / total : 0;
      out[index + 2] = total > 0 ? blue / total : 0;
    }
  }

  return out;
}

function mixByte(hash: number, byte: number): number {
  return Math.imul((hash ^ (byte & 0xff)) >>> 0, FNV_PRIME) >>> 0;
}

/**
 * FNV-1a 32-bit fingerprint over the pre-contrast downsampled RGB bytes plus
 * the grid width and row count. Contrast, palette, and dither changes do not
 * alter the fingerprint; a different image or width does.
 */
export function fingerprint(
  downsampled: Uint8ClampedArray,
  cols: number,
  rows: number,
): string {
  let hash = FNV_OFFSET_BASIS >>> 0;
  for (let i = 0; i < downsampled.length; i += 1) {
    hash = mixByte(hash, downsampled[i]!);
  }
  for (const dimension of [cols, rows]) {
    hash = mixByte(hash, dimension);
    hash = mixByte(hash, dimension >>> 8);
    hash = mixByte(hash, dimension >>> 16);
    hash = mixByte(hash, dimension >>> 24);
  }
  return hash.toString(16).padStart(8, '0');
}

function assertSettings(settings: PipelineSettings): void {
  const { cols } = settings;
  if (!Number.isInteger(cols) || cols < MIN_COLS || cols > MAX_COLS) {
    throw new RangeError(
      `Grid width must be an integer between ${MIN_COLS} and ${MAX_COLS} (received ${cols})`,
    );
  }
}

const MIN_GAIN = 0.6;
const MAX_GAIN = 1.4;
const MIN_CHROMA_SCALE = 0.5;
const MAX_CHROMA_SCALE = 1.5;
const MIN_ERROR_LIMIT = 0.02;
const MAX_ERROR_LIMIT = 0.5;

/**
 * Validate the experimental filter payload. `errorLimit >= 1` is accepted and
 * behaves like `null`, matching the "unlimited" contract.
 */
function assertFilters(filters: ColorFilters): void {
  const fail = (message: string): never => {
    throw new RangeError(message);
  };

  if (
    !Number.isInteger(filters.blackPoint) ||
    filters.blackPoint < 0 ||
    filters.blackPoint > 40
  ) {
    fail(`blackPoint must be an integer between 0 and 40 (received ${filters.blackPoint})`);
  }
  if (!Array.isArray(filters.gains) || filters.gains.length !== 3) {
    fail('gains must be a three-element array');
  }
  for (const gain of filters.gains) {
    if (!Number.isFinite(gain) || gain < MIN_GAIN || gain > MAX_GAIN) {
      fail(`each gain must be between ${MIN_GAIN} and ${MAX_GAIN} (received ${gain})`);
    }
  }
  if (
    !Number.isFinite(filters.chromaScale) ||
    filters.chromaScale < MIN_CHROMA_SCALE ||
    filters.chromaScale > MAX_CHROMA_SCALE
  ) {
    fail(
      `chromaScale must be between ${MIN_CHROMA_SCALE} and ${MAX_CHROMA_SCALE} ` +
        `(received ${filters.chromaScale})`,
    );
  }
  if (filters.errorLimit !== null) {
    const limit = filters.errorLimit;
    const valid =
      Number.isFinite(limit) &&
      ((limit >= MIN_ERROR_LIMIT && limit <= MAX_ERROR_LIMIT) || limit >= 1);
    if (!valid) {
      fail(
        `errorLimit must be null, between ${MIN_ERROR_LIMIT} and ${MAX_ERROR_LIMIT}, ` +
          `or at least 1 (received ${limit})`,
      );
    }
  }
  if (filters.metric !== 'de76' && filters.metric !== 'de2000') {
    fail(`metric must be "de76" or "de2000" (received ${String(filters.metric)})`);
  }
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function nearestComboIndex(
  table: Float32Array,
  target: Lab,
): { index: number; distanceSquared: number } {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  const candidates = table.length / 3;
  for (let i = 0; i < candidates; i += 1) {
    const dL = target[0] - table[i * 3]!;
    const da = target[1] - table[i * 3 + 1]!;
    const db = target[2] - table[i * 3 + 2]!;
    const distance = dL * dL + da * da + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return { index: bestIndex, distanceSquared: bestDistance };
}

/** Exact-precision Lab table for the CIEDE2000 search (the ΔE76 table stays Float32). */
function buildLabTable64(lut: readonly ComboLUTEntry[]): Float64Array {
  const table = new Float64Array(lut.length * 3);
  for (let i = 0; i < lut.length; i += 1) {
    const lab = lut[i]!.lab;
    table[i * 3] = lab[0];
    table[i * 3 + 1] = lab[1];
    table[i * 3 + 2] = lab[2];
  }
  return table;
}

/** Exact CIEDE2000 scan over all 125 combos; no shortlist. */
function nearestComboIndex2000(
  table: Float64Array,
  target: Lab,
): { index: number; distance: number } {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  const candidates = table.length / 3;
  for (let i = 0; i < candidates; i += 1) {
    const distance = deltaE2000Raw(
      target[0],
      target[1],
      target[2],
      table[i * 3]!,
      table[i * 3 + 1]!,
      table[i * 3 + 2]!,
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return { index: bestIndex, distance: bestDistance };
}

/** Test-only observation hook; it cannot influence the match. */
export interface MatchHooks {
  onCell?: (
    index: number,
    used: readonly [number, number, number],
    original: readonly [number, number, number],
  ) => void;
}

const lutCache = new Map<string, ComboLUTEntry[]>();

function lutFor(palette: PencilPalette): ComboLUTEntry[] {
  const cached = lutCache.get(palette.key);
  if (cached) return cached;
  const lut = buildComboLUT(palette);
  lutCache.set(palette.key, lut);
  return lut;
}

/**
 * Read one cell of the flat grid as a derived view. `rgb` is the
 * contrast-boosted target; `srgb` is the optical mix of the matched stripes.
 */
export function readMatchedCell(grid: MatchedGrid, col: number, row: number): MatchedCell | null {
  if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return null;
  const index = row * grid.cols + col;
  const ri = grid.ri[index] as ShadingStateId;
  const gi = grid.gi[index] as ShadingStateId;
  const bi = grid.bi[index] as ShadingStateId;
  const combo = lutFor(grid.palette)[ri * 25 + gi * 5 + bi]!;
  return {
    ri,
    gi,
    bi,
    rgb: [grid.target[index * 3]!, grid.target[index * 3 + 1]!, grid.target[index * 3 + 2]!],
    srgb: combo.srgb,
    deltaE: grid.deltaE[index]!,
  };
}

/**
 * Full optical-mixing pass: area-average downsample, contrast boost, optional
 * colour filters, CIELAB match against the 125-combo LUT, and optional
 * Floyd–Steinberg error diffusion in linear RGB. With no filters (or
 * `DEFAULT_FILTERS`) the output is byte-identical to the pre-filter engine.
 */
export function matchGrid(
  image: SourceImage,
  settings: PipelineSettings,
  filters?: ColorFilters,
  hooks?: MatchHooks,
): MatchedGrid {
  assertSettings(settings);
  if (filters) assertFilters(filters);

  const cols = settings.cols;
  const rows = computeRows(cols, image.width, image.height);
  const count = cols * rows;

  const downsampled = downsampleAreaAverage(image, cols, rows);
  const sourceHash = fingerprint(downsampled, cols, rows);

  const palette = getPalette(settings.palette);
  const lut = lutFor(palette);
  const labTable = buildLabTable(lut);
  const metric = filters?.metric ?? 'de76';
  const de2000Table = metric === 'de2000' ? buildLabTable64(lut) : null;
  const contrastLUT = buildContrastLUT(settings.contrast);

  const target = new Uint8ClampedArray(count * 3);
  for (let i = 0; i < count * 3; i += 1) {
    target[i] = contrastLUT[downsampled[i]!]!;
  }

  if (filters && !isDefaultFilters(filters)) {
    // Stage 1: black-point gate on 8-bit encoded values.
    if (filters.blackPoint > 0) {
      const gate = filters.blackPoint;
      for (let i = 0; i < target.length; i += 1) {
        if (target[i]! < gate) target[i] = 0;
      }
    }

    // Stage 2: per-channel gains on 8-bit encoded sRGB.
    const gains = filters.gains;
    if (gains[0] !== 1 || gains[1] !== 1 || gains[2] !== 1) {
      for (let i = 0; i < count; i += 1) {
        for (let channel = 0; channel < 3; channel += 1) {
          target[i * 3 + channel] = Math.round(target[i * 3 + channel]! * gains[channel]!);
        }
      }
    }

    // Stage 3: CIELAB chroma scale, preserving L*.
    if (filters.chromaScale !== 1) {
      for (let i = 0; i < count; i += 1) {
        const r = target[i * 3]!;
        const g = target[i * 3 + 1]!;
        const b = target[i * 3 + 2]!;
        const lab = linearRgbToLab(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b));
        const [lr, lg, lb] = labToLinearRgb(
          lab[0],
          lab[1] * filters.chromaScale,
          lab[2] * filters.chromaScale,
        );
        target[i * 3] = linearToSrgb(lr);
        target[i * 3 + 1] = linearToSrgb(lg);
        target[i * 3 + 2] = linearToSrgb(lb);
      }
    }
  }

  // Linearize the final (post-filter) 8-bit target.
  const linear = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i += 1) {
    linear[i] = srgbToLinear(target[i]!);
  }

  const ditherStrength = settings.dither
    ? Math.max(0, Math.min(1, settings.ditherStrength))
    : 0;

  const rawLimit = filters?.errorLimit ?? null;
  const errorLimit = rawLimit !== null && rawLimit < 1 ? rawLimit : null;
  // The bound is measured against each cell's own post-filter target, before
  // any diffusion lands on it.
  const originalLinear =
    errorLimit !== null || hooks?.onCell ? Float32Array.from(linear) : null;

  const riOut = new Uint8Array(count);
  const giOut = new Uint8Array(count);
  const biOut = new Uint8Array(count);
  const deltaEOut = new Float32Array(count);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const i = row * cols + col;
      const origR = originalLinear ? originalLinear[i * 3]! : clamp01(linear[i * 3]!);
      const origG = originalLinear ? originalLinear[i * 3 + 1]! : clamp01(linear[i * 3 + 1]!);
      const origB = originalLinear ? originalLinear[i * 3 + 2]! : clamp01(linear[i * 3 + 2]!);

      let usedR = clamp01(linear[i * 3]!);
      let usedG = clamp01(linear[i * 3 + 1]!);
      let usedB = clamp01(linear[i * 3 + 2]!);

      if (errorLimit !== null) {
        usedR = clamp01(Math.min(origR + errorLimit, Math.max(origR - errorLimit, usedR)));
        usedG = clamp01(Math.min(origG + errorLimit, Math.max(origG - errorLimit, usedG)));
        usedB = clamp01(Math.min(origB + errorLimit, Math.max(origB - errorLimit, usedB)));
      }

      hooks?.onCell?.(i, [usedR, usedG, usedB], [origR, origG, origB]);

      const targetLab = linearRgbToLab(usedR, usedG, usedB);
      let index: number;
      let combo: ComboLUTEntry;
      if (metric === 'de2000') {
        index = nearestComboIndex2000(de2000Table!, targetLab).index;
        combo = lut[index]!;
        const comboLab = combo.lab;
        const dL = targetLab[0] - comboLab[0];
        const da = targetLab[1] - comboLab[1];
        const db = targetLab[2] - comboLab[2];
        // The inspector's ΔE keeps its ΔE76 meaning under both metrics.
        deltaEOut[i] = Math.sqrt(dL * dL + da * da + db * db);
      } else {
        const found = nearestComboIndex(labTable, targetLab);
        index = found.index;
        combo = lut[index]!;
        deltaEOut[i] = Math.sqrt(found.distanceSquared);
      }

      riOut[i] = combo.ri;
      giOut[i] = combo.gi;
      biOut[i] = combo.bi;

      if (ditherStrength > 0) {
        const errorR = (usedR - combo.lin[0]) * ditherStrength;
        const errorG = (usedG - combo.lin[1]) * ditherStrength;
        const errorB = (usedB - combo.lin[2]) * ditherStrength;

        const spread = (x: number, y: number, weight: number): void => {
          if (x < 0 || x >= cols || y < 0 || y >= rows) return;
          const targetIndex = (y * cols + x) * 3;
          linear[targetIndex] = linear[targetIndex]! + errorR * weight;
          linear[targetIndex + 1] = linear[targetIndex + 1]! + errorG * weight;
          linear[targetIndex + 2] = linear[targetIndex + 2]! + errorB * weight;
        };

        spread(col + 1, row, 7 / 16);
        spread(col - 1, row + 1, 3 / 16);
        spread(col, row + 1, 5 / 16);
        spread(col + 1, row + 1, 1 / 16);
      }
    }
  }

  return {
    cols,
    rows,
    ri: riOut,
    gi: giOut,
    bi: biOut,
    deltaE: deltaEOut,
    target,
    palette,
    sourceHash,
  };
}
