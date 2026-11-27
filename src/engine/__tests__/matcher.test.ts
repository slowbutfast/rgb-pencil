import { describe, expect, it } from 'vitest';

import { srgbToLinear } from '../colorMath';
import {
  computeRows,
  downsampleAreaAverage,
  fingerprint,
  matchGrid,
} from '../matcher';
import {
  DEFAULT_SETTINGS,
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

function meanLinearLuminance(values: readonly (readonly [number, number, number])[]): number {
  let total = 0;
  for (const value of values) {
    total +=
      0.2126 * srgbToLinear(value[0]) +
      0.7152 * srgbToLinear(value[1]) +
      0.0722 * srgbToLinear(value[2]);
  }
  return total / values.length;
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
    expect(result.cells).toHaveLength(56 * 42);
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

    const first = result.cells[2 * 16 + 2]!;
    const second = result.cells[10 * 16 + 10]!;
    expect([first.ri, first.gi, first.bi]).toEqual([second.ri, second.gi, second.bi]);
    expect(first.deltaE).toBe(second.deltaE);
  });

  it('reduces mean luminance error on a flat mid-gray patch with dithering', () => {
    const image = uniformImage(180, 180, [128, 128, 128]);
    const target = [128, 128, 128] as const;

    const withoutDither = matchGrid(
      image,
      settings({ cols: 45, contrast: 1, dither: false }),
    );
    const withDither = matchGrid(image, settings({ cols: 45, contrast: 1, dither: true }));

    const targetLuminance = meanLinearLuminance([target]);
    const error = (cells: typeof withoutDither.cells): number =>
      Math.abs(meanLinearLuminance(cells.map((cell) => cell.srgb)) - targetLuminance);

    expect(error(withDither.cells)).toBeLessThan(error(withoutDither.cells));
  });

  it('keeps the contrast-boosted source colour on every cell', () => {
    const result = matchGrid(
      uniformImage(160, 120, [200, 100, 50]),
      settings({ cols: 20, contrast: 1.45 }),
    );
    for (const cell of result.cells) {
      expect(cell.rgb[0]).toBeGreaterThan(200);
      expect(cell.rgb[1]).toBeLessThan(100);
    }
  });
});
