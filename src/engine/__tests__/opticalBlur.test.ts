import { describe, expect, it } from 'vitest';

import {
  DARK_BORDER_RATIO,
  PALETTE_KEYS,
  type MatchedGrid,
  type PaletteKey,
  type PencilPalette,
  type Rgb,
  type ShadingStateId,
} from '../../types/pipeline';
import { buildComboLUT, linearToSrgb, srgbToLinear } from '../colorMath';
import { getPalette } from '../palettes';
import {
  LINEAR_TO_SRGB_TABLE,
  blurLinearRaster,
  blurLinearRasterToSrgb,
  buildLinearStripeRaster,
  solveBoxWidth,
} from '../opticalBlur';

/**
 * Engine contract exercised here (kept DOM-free):
 *
 * `buildLinearStripeRaster(grid)` -> `{ width: cols * 3, height: rows * 3,
 *   data: Float32Array }` holding three interleaved linear RGB channels per
 *   subpixel (index `(y * width + x) * 3 + channel`).
 *
 * `blurLinearRaster(raster, blurCells, paperRgb)` -> the same `LinearRaster`
 *   shape after the 3-pass continuous-coverage blur, so the Gaussian moments
 *   can be measured in linear light rather than through the sRGB transfer.
 *
 * `blurLinearRasterToSrgb(raster, blurCells, paperRgb)` -> `{ width, height,
 *   data: Uint8ClampedArray }` with four RGBA bytes per subpixel (directly
 *   consumable by `ImageData`).
 *
 * `solveBoxWidth(blurCells)` -> `{ blurCells, sigmaSubpx, width }`, memoized so
 *   repeated calls for one radius return the same solution object.
 *
 * `LINEAR_TO_SRGB_TABLE` -> 4096 precomputed 8-bit sRGB values indexed by
 *   linear light.
 */

interface LinearRaster {
  width: number;
  height: number;
  data: Float32Array;
}

interface SrgbRaster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const PAPER: Rgb = [250, 250, 250];
const BLACK_PAPER: Rgb = [0, 0, 0];

function linearRaster(width: number, height: number): LinearRaster {
  return { width, height, data: new Float32Array(width * height * 3) };
}

function setSubpixel(
  raster: LinearRaster,
  x: number,
  y: number,
  rgb: readonly [number, number, number],
): void {
  const index = (y * raster.width + x) * 3;
  raster.data[index] = rgb[0];
  raster.data[index + 1] = rgb[1];
  raster.data[index + 2] = rgb[2];
}

function subpixel(raster: LinearRaster, x: number, y: number): [number, number, number] {
  const index = (y * raster.width + x) * 3;
  return [raster.data[index]!, raster.data[index + 1]!, raster.data[index + 2]!];
}

function srgbSubpixel(raster: SrgbRaster, x: number, y: number): [number, number, number, number] {
  const index = (y * raster.width + x) * 4;
  return [
    raster.data[index]!,
    raster.data[index + 1]!,
    raster.data[index + 2]!,
    raster.data[index + 3]!,
  ];
}

function uniformGrid(
  palette: PencilPalette,
  ri: ShadingStateId,
  gi: ShadingStateId,
  bi: ShadingStateId,
  cols = 1,
  rows = 1,
): MatchedGrid {
  const count = cols * rows;
  return {
    cols,
    rows,
    ri: new Uint8Array(count).fill(ri),
    gi: new Uint8Array(count).fill(gi),
    bi: new Uint8Array(count).fill(bi),
    deltaE: new Float32Array(count),
    target: new Uint8ClampedArray(count * 3),
    palette,
    sourceHash: `uniform-${palette.key}-${ri}-${gi}-${bi}-${cols}x${rows}`,
  };
}

function linearOf(rgb: Rgb): [number, number, number] {
  return [srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2])];
}

/** Second moment of one output line through the impulse centre. */
function lineVariance(
  raster: LinearRaster,
  channel: number,
  centre: { x: number; y: number },
  axis: 'x' | 'y',
): number {
  const length = axis === 'x' ? raster.width : raster.height;
  const origin = axis === 'x' ? centre.x : centre.y;
  let total = 0;
  let moment = 0;
  for (let i = 0; i < length; i += 1) {
    const value =
      axis === 'x'
        ? subpixel(raster, i, centre.y)[channel]!
        : subpixel(raster, centre.x, i)[channel]!;
    total += value;
    moment += value * (i - origin) ** 2;
  }
  return moment / total;
}

function impulseRaster(size = 64): { raster: LinearRaster; centre: { x: number; y: number } } {
  const raster = linearRaster(size, size);
  const centre = { x: Math.floor(size / 2), y: Math.floor(size / 2) };
  setSubpixel(raster, centre.x, centre.y, [1, 1, 1]);
  return { raster, centre };
}

function peakOf(raster: LinearRaster, channel = 0): number {
  let peak = 0;
  for (let i = channel; i < raster.data.length; i += 3) {
    if (raster.data[i]! > peak) peak = raster.data[i]!;
  }
  return peak;
}

describe('buildLinearStripeRaster', () => {
  it('rasterizes a 56 x 42 grid as an isotropic 168 x 126 x 3 buffer', () => {
    const palette = getPalette('reflective');
    const raster = buildLinearStripeRaster(uniformGrid(palette, 1, 2, 4, 56, 42));

    expect(raster.width).toBe(168);
    expect(raster.height).toBe(126);
    expect(raster.data).toBeInstanceOf(Float32Array);
    expect(raster.data.length).toBe(168 * 126 * 3);
  });

  it('folds the dark border into each stripe subpixel with three identical rows', () => {
    const palette = getPalette('reflective');
    const raster = buildLinearStripeRaster(uniformGrid(palette, 1, 2, 4));
    const border = linearOf(palette.border);
    const expected = [
      linearOf(palette.R[1]!),
      linearOf(palette.G[2]!),
      linearOf(palette.B[4]!),
    ].map((stripe) =>
      stripe.map(
        (channel, index) =>
          (1 - DARK_BORDER_RATIO) * channel + DARK_BORDER_RATIO * border[index]!,
      ),
    );

    for (let sx = 0; sx < 3; sx += 1) {
      for (let sy = 0; sy < 3; sy += 1) {
        const actual = subpixel(raster, sx, sy);
        for (let channel = 0; channel < 3; channel += 1) {
          expect(Math.abs(actual[channel]! - expected[sx]![channel]!)).toBeLessThanOrEqual(1e-6);
        }
      }
    }
  });

  it('matches buildComboLUT linear means for all 125 combos across all 3 palettes', () => {
    let maxError = 0;
    for (const key of PALETTE_KEYS) {
      const palette = getPalette(key as PaletteKey);
      const lut = buildComboLUT(palette, DARK_BORDER_RATIO);
      for (let ri = 0; ri < 5; ri += 1) {
        for (let gi = 0; gi < 5; gi += 1) {
          for (let bi = 0; bi < 5; bi += 1) {
            const raster = buildLinearStripeRaster(
              uniformGrid(palette, ri as ShadingStateId, gi as ShadingStateId, bi as ShadingStateId),
            );
            const mean = [0, 0, 0];
            for (let sy = 0; sy < 3; sy += 1) {
              for (let sx = 0; sx < 3; sx += 1) {
                const value = subpixel(raster, sx, sy);
                mean[0] += value[0] / 9;
                mean[1] += value[1] / 9;
                mean[2] += value[2] / 9;
              }
            }
            const expected = lut[ri * 25 + gi * 5 + bi]!.lin;
            for (let channel = 0; channel < 3; channel += 1) {
              maxError = Math.max(maxError, Math.abs(mean[channel]! - expected[channel]!));
            }
          }
        }
      }
    }

    expect(maxError).toBeLessThanOrEqual(1e-5);
  });
});

describe('blurLinearRaster', () => {
  it('matches the requested Gaussian variance and stays isotropic', () => {
    for (const blurCells of [0.5, 0.75, 1.0, 1.25, 1.5]) {
      const { raster, centre } = impulseRaster();
      const blurred = blurLinearRaster(raster, blurCells, BLACK_PAPER);
      const expected = (blurCells * 3) ** 2;
      const horizontal = lineVariance(blurred, 0, centre, 'x');
      const vertical = lineVariance(blurred, 0, centre, 'y');

      expect(Math.abs(horizontal - expected) / expected).toBeLessThanOrEqual(0.01);
      expect(Math.abs(vertical - expected) / expected).toBeLessThanOrEqual(0.01);
      expect(Math.abs(horizontal - vertical) / horizontal).toBeLessThanOrEqual(1e-4);
    }
  });

  it('strictly decreases the impulse peak at every 0.05 slider step', () => {
    const peaks: number[] = [];
    for (let step = 1; step <= 30; step += 1) {
      const { raster } = impulseRaster();
      peaks.push(peakOf(blurLinearRaster(raster, step * 0.05, BLACK_PAPER)));
    }

    for (let index = 1; index < peaks.length; index += 1) {
      expect(peaks[index]!).toBeLessThan(peaks[index - 1]!);
    }
  });

  it('is an exact identity at blurCells = 0', () => {
    const raster = linearRaster(9, 7);
    for (let y = 0; y < raster.height; y += 1) {
      for (let x = 0; x < raster.width; x += 1) {
        const value = (x + y * raster.width) / (raster.width * raster.height);
        setSubpixel(raster, x, y, [value, 1 - value, value * 0.5]);
      }
    }

    const blurred = blurLinearRaster(raster, 0, PAPER);
    expect(blurred.width).toBe(raster.width);
    expect(blurred.height).toBe(raster.height);
    expect([...blurred.data]).toEqual([...raster.data]);
  });

  it('brightens dark edges toward paper without leaving the grid footprint', () => {
    const palette = getPalette('emissive');
    const raster = buildLinearStripeRaster(uniformGrid(palette, 4, 4, 4, 16, 12));
    const blurred = blurLinearRaster(raster, 1.0, PAPER);

    expect(blurred.width).toBe(raster.width);
    expect(blurred.height).toBe(raster.height);

    const middleRow = Math.floor(blurred.height / 2);
    const boundary = subpixel(blurred, 0, middleRow)[0]!;
    const interior = subpixel(
      blurred,
      Math.floor(blurred.width / 2),
      middleRow,
    )[0]!;

    expect(boundary).toBeGreaterThan(interior);
    expect(boundary).toBeLessThanOrEqual(srgbToLinear(250) + 1e-6);
  });
});

describe('blurLinearRasterToSrgb', () => {
  it('encodes a linear 0.5 optical mean as sRGB 188, not 127/128', () => {
    // The radius used to fuse the columns (1.5 cells = 4.5 subpixels of sigma)
    // is wider than a 3-row raster, so paper padding would dominate vertically.
    // A tall raster keeps the sampled row isolated from that (correct) padding.
    const raster = linearRaster(96, 32);
    for (let y = 0; y < raster.height; y += 1) {
      for (let x = 0; x < raster.width; x += 1) {
        const value = x % 2 === 0 ? 1 : 0;
        setSubpixel(raster, x, y, [value, value, value]);
      }
    }

    const linear = blurLinearRaster(raster, 1.5, PAPER);
    const mean = subpixel(linear, 48, 16)[0]!;
    const encoded = blurLinearRasterToSrgb(raster, 1.5, PAPER);
    const channel = srgbSubpixel(encoded, 48, 16)[0]!;

    expect(Math.abs(mean - 0.5)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(channel - linearToSrgb(mean))).toBeLessThanOrEqual(1);
    expect(channel).not.toBe(127);
    expect(channel).not.toBe(128);
    expect(linearToSrgb(0.5)).toBe(188);
    expect(channel).toBeGreaterThanOrEqual(186);
    expect(channel).toBeLessThanOrEqual(190);
  });

  it('encodes every subpixel directly at blurCells = 0', () => {
    const raster = linearRaster(7, 5);
    for (let y = 0; y < raster.height; y += 1) {
      for (let x = 0; x < raster.width; x += 1) {
        const value = ((x * 7 + y * 13) % 101) / 100;
        setSubpixel(raster, x, y, [value, value, value]);
      }
    }

    const encoded = blurLinearRasterToSrgb(raster, 0, PAPER);

    expect(encoded.width).toBe(raster.width);
    expect(encoded.height).toBe(raster.height);
    expect(encoded.data).toBeInstanceOf(Uint8ClampedArray);
    expect(encoded.data.length).toBe(raster.width * raster.height * 4);

    for (let y = 0; y < raster.height; y += 1) {
      for (let x = 0; x < raster.width; x += 1) {
        const expected = linearToSrgb(subpixel(raster, x, y)[0]!);
        const [red, green, blue, alpha] = srgbSubpixel(encoded, x, y);
        expect(red).toBe(expected);
        expect(green).toBe(expected);
        expect(blue).toBe(expected);
        expect(alpha).toBe(255);
      }
    }
  });

  it('keeps the output exactly the size of the grid footprint at blurCells = 1.0', () => {
    const palette = getPalette('reflective');
    const raster = buildLinearStripeRaster(uniformGrid(palette, 4, 4, 4, 16, 12));
    const encoded = blurLinearRasterToSrgb(raster, 1.0, PAPER);

    expect(encoded.width).toBe(raster.width);
    expect(encoded.height).toBe(raster.height);
    expect(encoded.data.length).toBe(raster.width * raster.height * 4);
  });
});

describe('solveBoxWidth', () => {
  it('returns a strictly increasing real width across the slider range', () => {
    let previous = -Infinity;
    for (let step = 1; step <= 30; step += 1) {
      const solution = solveBoxWidth(step * 0.05);
      expect(solution.width).toBeGreaterThan(previous);
      previous = solution.width;
    }
  });

  it('memoizes the solution per blurCells', () => {
    const first = solveBoxWidth(0.75);
    const second = solveBoxWidth(0.75);

    expect(second).toBe(first);
    expect(first.blurCells).toBe(0.75);
    expect(first.sigmaSubpx).toBeCloseTo(2.25, 10);
  });
});

describe('LINEAR_TO_SRGB_TABLE', () => {
  it('agrees with linearToSrgb for all 4096 entries within one level', () => {
    expect(LINEAR_TO_SRGB_TABLE).toHaveLength(4096);

    let maxDelta = 0;
    for (let index = 0; index < 4096; index += 1) {
      const expected = linearToSrgb(index / 4095);
      maxDelta = Math.max(maxDelta, Math.abs(LINEAR_TO_SRGB_TABLE[index]! - expected));
    }

    expect(maxDelta).toBeLessThanOrEqual(1);
  });
});
