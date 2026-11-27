import { buildComboLUT, buildLabTable, linearRgbToLab, srgbToLinear, type Lab } from './colorMath';
import { buildContrastLUT } from './contrast';
import { getPalette } from './palettes';
import {
  MAX_COLS,
  MIN_COLS,
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
 * Full optical-mixing pass: area-average downsample, contrast boost, CIELAB
 * ΔE76 match against the 125-combo LUT, and optional Floyd–Steinberg error
 * diffusion in linear RGB. Repeated pixels reuse a precomputed flat Lab table.
 */
export function matchGrid(image: SourceImage, settings: PipelineSettings): MatchedGrid {
  assertSettings(settings);

  const cols = settings.cols;
  const rows = computeRows(cols, image.width, image.height);
  const count = cols * rows;

  const downsampled = downsampleAreaAverage(image, cols, rows);
  const sourceHash = fingerprint(downsampled, cols, rows);

  const palette = getPalette(settings.palette);
  const lut = lutFor(palette);
  const labTable = buildLabTable(lut);
  const contrastLUT = buildContrastLUT(settings.contrast);

  const linear = new Float32Array(count * 3);
  const target = new Uint8ClampedArray(count * 3);
  for (let i = 0; i < count; i += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      const value = contrastLUT[downsampled[i * 3 + channel]!]!;
      target[i * 3 + channel] = value;
      linear[i * 3 + channel] = srgbToLinear(value);
    }
  }

  const ditherStrength = settings.dither
    ? Math.max(0, Math.min(1, settings.ditherStrength))
    : 0;

  const riOut = new Uint8Array(count);
  const giOut = new Uint8Array(count);
  const biOut = new Uint8Array(count);
  const deltaEOut = new Float32Array(count);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const i = row * cols + col;
      const targetR = clamp01(linear[i * 3]!);
      const targetG = clamp01(linear[i * 3 + 1]!);
      const targetB = clamp01(linear[i * 3 + 2]!);

      const { index, distanceSquared } = nearestComboIndex(
        labTable,
        linearRgbToLab(targetR, targetG, targetB),
      );
      const combo = lut[index]!;

      riOut[i] = combo.ri;
      giOut[i] = combo.gi;
      biOut[i] = combo.bi;
      deltaEOut[i] = Math.sqrt(distanceSquared);

      if (ditherStrength > 0) {
        const errorR = (targetR - combo.lin[0]) * ditherStrength;
        const errorG = (targetG - combo.lin[1]) * ditherStrength;
        const errorB = (targetB - combo.lin[2]) * ditherStrength;

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
