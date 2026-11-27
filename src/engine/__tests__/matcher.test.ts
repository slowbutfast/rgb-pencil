import { describe, expect, it } from 'vitest';

import { srgbToLinear, buildComboLUT } from '../colorMath';
import {
  computeRows,
  downsampleAreaAverage,
  fingerprint,
  matchGrid,
} from '../matcher';
import {
  DEFAULT_SETTINGS,
  type MatchedGrid,
  type PipelineSettings,
  type SourceImage,
} from '../../types/pipeline';

function uniformImage(width: number, height: number, rgb: readonly [number, number, number]): SourceImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

function settings(overrides: Partial<PipelineSettings> = {}): PipelineSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

function meanMixLuminance(grid: MatchedGrid): number {
  const lut = buildComboLUT(grid.palette);
  let total = 0;
  const count = grid.cols * grid.rows;
  for (let i = 0; i < count; i += 1) {
    const combo = lut[grid.ri[i]! * 25 + grid.gi[i]! * 5 + grid.bi[i]!]!;
    total +=
      0.2126 * srgbToLinear(combo.srgb[0]) +
      0.7152 * srgbToLinear(combo.srgb[1]) +
      0.0722 * srgbToLinear(combo.srgb[2]);
  }
  return total / count;
}

describe('computeRows', () => {
  it('preserves a 4:3 aspect ratio at the default 56 column width', () => {
    expect(computeRows(56, 320, 240)).toBe(42);
  });

  it('preserves aspect ratio across the whole 16-96 width range', () => {
    expect(computeRows(16, 320, 240)).toBe(12);
    expect(computeRows(96, 320, 240)).toBe(72);
    expect(computeRows(48, 600, 600)).toBe(48);
  });

  it('never returns fewer than 8 rows', () => {
    expect(computeRows(16, 4000, 100)).toBe(8);
  });
});

describe('downsampleAreaAverage', () => {
  it('averages each cell area rather than point-sampling', () => {
    const image = uniformImage(4, 2, [10, 20, 30]);
    const down = downsampleAreaAverage(image, 2, 1);
    expect(Array.from(down)).toEqual([10, 20, 30, 10, 20, 30]);
  });
});

describe('fingerprint', () => {
  it('is deterministic for identical pixels and dimensions', () => {
    const down = new Uint8ClampedArray([1, 2, 3, 4, 5, 6]);
    expect(fingerprint(down, 2, 1)).toBe(fingerprint(down, 2, 1));
  });

  it('changes with the grid width or row count', () => {
    const down = new Uint8ClampedArray([1, 2, 3, 4, 5, 6]);
    expect(fingerprint(down, 2, 1)).not.toBe(fingerprint(down, 3, 1));
    expect(fingerprint(down, 2, 1)).not.toBe(fingerprint(down, 2, 2));
  });

  it('changes when the downsampled pixels change', () => {
    expect(fingerprint(new Uint8ClampedArray([1, 2, 3]), 1, 1)).not.toBe(
      fingerprint(new Uint8ClampedArray([1, 2, 4]), 1, 1),
    );
  });
});

describe('matchGrid', () => {
  it('builds the default 56 x 42 grid for a 4:3 source', () => {
    const result = matchGrid(uniformImage(320, 240, [120, 90, 60]), settings());
    expect(result.cols).toBe(56);
    expect(result.rows).toBe(42);
    expect(result.ri).toHaveLength(56 * 42);
    expect(result.target).toHaveLength(56 * 42 * 3);
    expect(result.sourceHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it.each([15, 97, 0, 1.5])('rejects invalid column width %s', (cols) => {
    expect(() => matchGrid(uniformImage(320, 240, [120, 90, 60]), settings({ cols }))).toThrow(
      RangeError,
    );
  });

  it('matches identical pixels identically when dithering is disabled', () => {
    const image = uniformImage(16, 16, [128, 128, 128]);
    const result = matchGrid(image, settings({ cols: 16, dither: false }));

    const first = 2 * 16 + 2;
    const second = 10 * 16 + 10;
    expect([result.ri[first], result.gi[first], result.bi[first]]).toEqual([
      result.ri[second],
      result.gi[second],
      result.bi[second],
    ]);
    expect(result.deltaE[first]).toBe(result.deltaE[second]);
  });

  it('reduces mean luminance error on a flat mid-gray patch with dithering', () => {
    const image = uniformImage(180, 180, [128, 128, 128]);
    const targetLuminance =
      0.2126 * srgbToLinear(128) + 0.7152 * srgbToLinear(128) + 0.0722 * srgbToLinear(128);

    const withoutDither = matchGrid(
      image,
      settings({ cols: 45, contrast: 1, dither: false }),
    );
    const withDither = matchGrid(image, settings({ cols: 45, contrast: 1, dither: true }));

    const error = (grid: MatchedGrid): number =>
      Math.abs(meanMixLuminance(grid) - targetLuminance);

    expect(error(withDither)).toBeLessThan(error(withoutDither));
  });

  it('keeps the contrast-boosted source colour on every cell', () => {
    const result = matchGrid(
      uniformImage(160, 120, [200, 100, 50]),
      settings({ cols: 20, contrast: 1.45 }),
    );
    for (let i = 0; i < result.cols * result.rows; i += 1) {
      expect(result.target[i * 3]).toBeGreaterThan(200);
      expect(result.target[i * 3 + 1]).toBeLessThan(100);
    }
  });
});
