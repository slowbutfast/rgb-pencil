import {
  DARK_BORDER_RATIO,
  MAX_BLUR_CELLS,
  MIN_BLUR_CELLS,
  type MatchedGrid,
  type Rgb,
  type ShadingSeries,
} from '../types/pipeline';
import { linearToSrgb, srgbToLinear } from './colorMath';

/** Linear RGB subpixel buffer (`width` may be `cols * 3`). */
export interface LinearRaster {
  width: number;
  height: number;
  /** Interleaved RGB triples per subpixel: `(y * width + x) * 3 + channel`. */
  data: Float32Array;
}

/** sRGB RGBA subpixel buffer, directly consumable by `ImageData`. */
export interface SrgbRaster {
  width: number;
  height: number;
  /** Interleaved RGBA quads per subpixel: `(y * width + x) * 4 + channel`. */
  data: Uint8ClampedArray;
}

/** The real-valued box width whose single-pass variance is `sigmaSubpx² / 3`. */
export interface BoxWidthSolution {
  blurCells: number;
  sigmaSubpx: number;
  width: number;
}

const ENCODE_TABLE_SIZE = 4096;
const ENCODE_TABLE_MAX_INDEX = ENCODE_TABLE_SIZE - 1;
const BOX_PASSES = 3;
const BISECTION_LIMIT = 80;
const BISECTION_TOLERANCE = 1e-12;

/** 4096-entry linear-light -> 8-bit sRGB table (`index / 4095` is the input). */
export const LINEAR_TO_SRGB_TABLE: Uint8Array = (() => {
  const table = new Uint8Array(ENCODE_TABLE_SIZE);
  for (let index = 0; index < ENCODE_TABLE_SIZE; index += 1) {
    table[index] = linearToSrgb(index / ENCODE_TABLE_MAX_INDEX);
  }
  return table;
})();

function clampBlurCells(value: number): number {
  if (!Number.isFinite(value)) return MIN_BLUR_CELLS;
  return Math.min(MAX_BLUR_CELLS, Math.max(MIN_BLUR_CELLS, value));
}

function linearTriples(series: ShadingSeries): ReadonlyArray<readonly [number, number, number]> {
  return series.map(
    (rgb) => [srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2])] as const,
  );
}

function linearTriple(rgb: Rgb): readonly [number, number, number] {
  return [srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2])];
}

/**
 * Rasterize every matched cell as three square RGB subpixel columns across
 * three identical rows. `DARK_BORDER_RATIO` is folded into each stripe's
 * linear coverage so each 3 x 3 cell mean equals `buildComboLUT`'s `lin`.
 */
export function buildLinearStripeRaster(grid: MatchedGrid): LinearRaster {
  const width = grid.cols * 3;
  const height = grid.rows * 3;
  const data = new Float32Array(width * height * 3);

  const border = linearTriple(grid.palette.border);
  const folded = (series: ShadingSeries): ReadonlyArray<readonly [number, number, number]> =>
    linearTriples(series).map(
      (stripe) =>
        [
          (1 - DARK_BORDER_RATIO) * stripe[0] + DARK_BORDER_RATIO * border[0],
          (1 - DARK_BORDER_RATIO) * stripe[1] + DARK_BORDER_RATIO * border[1],
          (1 - DARK_BORDER_RATIO) * stripe[2] + DARK_BORDER_RATIO * border[2],
        ] as const,
    );
  const stripes = [folded(grid.palette.R), folded(grid.palette.G), folded(grid.palette.B)];
  const stateIds = [grid.ri, grid.gi, grid.bi];

  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const cellIndex = row * grid.cols + col;
      const subpixelColumn = col * 3;
      for (let channel = 0; channel < 3; channel += 1) {
        const colour = stripes[channel]![stateIds[channel]![cellIndex]!]!;
        for (let stripeRow = 0; stripeRow < 3; stripeRow += 1) {
          const index = ((row * 3 + stripeRow) * width + subpixelColumn + channel) * 3;
          data[index] = colour[0];
          data[index + 1] = colour[1];
          data[index + 2] = colour[2];
        }
      }
    }
  }

  return { width, height, data };
}

/** Per-pass second moment of a continuous-coverage box of real width `width`. */
function boxVariance(width: number): number {
  let sum = 0;
  for (let distance = 1; ; distance += 1) {
    const coverage = Math.min(1, Math.max(0, width / 2 - (distance - 0.5)));
    if (coverage === 0) break;
    sum += distance * distance * coverage;
  }
  return (2 / width) * sum;
}

const boxWidthCache = new Map<number, BoxWidthSolution>();

/**
 * Solve the real box width whose continuous-coverage variance equals
 * `(blurCells * 3)² / 3`. Results are memoized per clamped radius so the
 * slider reuses one solution object for repeated values.
 */
export function solveBoxWidth(blurCells: number): BoxWidthSolution {
  const radius = clampBlurCells(blurCells);
  const cached = boxWidthCache.get(radius);
  if (cached) return cached;

  const sigmaSubpx = radius * 3;
  const target = (sigmaSubpx * sigmaSubpx) / BOX_PASSES;
  let width = 1;

  if (target > 0) {
    let low = 1;
    let high = 2;
    while (boxVariance(high) < target) high *= 2;
    for (
      let iteration = 0;
      iteration < BISECTION_LIMIT && high - low > BISECTION_TOLERANCE;
      iteration += 1
    ) {
      const middle = (low + high) / 2;
      if (boxVariance(middle) < target) low = middle;
      else high = middle;
    }
    width = (low + high) / 2;
  }

  const solution: BoxWidthSolution = { blurCells: radius, sigmaSubpx, width };
  boxWidthCache.set(radius, solution);
  return solution;
}

/** `Q(x)`: integral of `line - paper` from `0` to `x`, interpolated linearly. */
function interpolatedIntegral(
  prefix: Float64Array,
  differences: Float64Array,
  x: number,
  length: number,
): number {
  if (x <= 0) return 0;
  if (x >= length) return prefix[length]!;
  const index = Math.floor(x);
  return prefix[index]! + (x - index) * differences[index]!;
}

/** One continuous-coverage box pass over `count` samples of one channel. */
function boxPassLine(
  source: Float32Array,
  target: Float32Array,
  count: number,
  stride: number,
  offset: number,
  paper: number,
  width: number,
  differences: Float64Array,
  prefix: Float64Array,
  output: Float64Array,
): void {
  for (let index = 0; index < count; index += 1) {
    differences[index] = source[offset + index * stride]! - paper;
  }
  prefix[0] = 0;
  for (let index = 0; index < count; index += 1) {
    prefix[index + 1] = prefix[index]! + differences[index]!;
  }

  const half = width / 2;
  for (let index = 0; index < count; index += 1) {
    const centre = index + 0.5;
    const start = Math.max(0, centre - half);
    const end = Math.min(count, centre + half);
    const integral =
      interpolatedIntegral(prefix, differences, end, count) -
      interpolatedIntegral(prefix, differences, start, count);
    output[index] = paper + integral / width;
  }

  for (let index = 0; index < count; index += 1) {
    target[offset + index * stride] = output[index]!;
  }
}

/**
 * 3-pass separable continuous-coverage box blur in linear light. Each pass has
 * variance `sigmaSubpx² / 3`, so the three passes total `sigmaSubpx²` exactly.
 * Out-of-bounds samples are the linearized paper colour, and the output keeps
 * the raster's exact footprint.
 */
export function blurLinearRaster(
  raster: LinearRaster,
  blurCells: number,
  paperRgb: Rgb,
): LinearRaster {
  const radius = clampBlurCells(blurCells);
  if (radius === 0 || raster.width === 0 || raster.height === 0) {
    return { width: raster.width, height: raster.height, data: raster.data.slice() };
  }

  const paper = linearTriple(paperRgb);
  const width = raster.width;
  const height = raster.height;
  const lineWidth = solveBoxWidth(radius).width;
  const first = new Float32Array(raster.data.length);
  const second = new Float32Array(raster.data.length);
  const maxLine = Math.max(width, height);
  const differences = new Float64Array(maxLine + 1);
  const prefix = new Float64Array(maxLine + 1);
  const output = new Float64Array(maxLine);

  let source = raster.data;
  let target = first;

  for (let pass = 0; pass < BOX_PASSES; pass += 1) {
    for (let row = 0; row < height; row += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        boxPassLine(
          source,
          target,
          width,
          3,
          (row * width) * 3 + channel,
          paper[channel]!,
          lineWidth,
          differences,
          prefix,
          output,
        );
      }
    }
    const next = target === first ? second : first;
    source = target;
    target = next;
  }

  for (let pass = 0; pass < BOX_PASSES; pass += 1) {
    for (let column = 0; column < width; column += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        boxPassLine(
          source,
          target,
          height,
          width * 3,
          column * 3 + channel,
          paper[channel]!,
          lineWidth,
          differences,
          prefix,
          output,
        );
      }
    }
    const next = target === first ? second : first;
    source = target;
    target = next;
  }

  return { width, height, data: source };
}

/** Encode the blurred linear raster to sRGB RGBA through the 4096-entry table. */
export function blurLinearRasterToSrgb(
  raster: LinearRaster,
  blurCells: number,
  paperRgb: Rgb,
): SrgbRaster {
  const blurred = blurLinearRaster(raster, blurCells, paperRgb);
  const pixelCount = blurred.width * blurred.height;
  const data = new Uint8ClampedArray(pixelCount * 4);

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const linearIndex = pixel * 3;
    const outputIndex = pixel * 4;
    for (let channel = 0; channel < 3; channel += 1) {
      const linear = Math.min(1, Math.max(0, blurred.data[linearIndex + channel]!));
      const tableIndex = Math.round(linear * ENCODE_TABLE_MAX_INDEX);
      data[outputIndex + channel] = LINEAR_TO_SRGB_TABLE[tableIndex]!;
    }
    data[outputIndex + 3] = 255;
  }

  return { width: blurred.width, height: blurred.height, data };
}
