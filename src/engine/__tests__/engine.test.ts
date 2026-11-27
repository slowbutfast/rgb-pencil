import { converter } from 'culori';
import { describe, expect, it } from 'vitest';

import { buildComboLUT, linearRgbToLab, srgbToLinear } from '../colorMath';
import { PIPELINE_VERSION, gridTransferables, runPipeline } from '../pipeline';
import { getPalette, PENCIL_PALETTES } from '../palettes';
import { MAX_WORKING_EDGE, prepareWorkingBitmap } from '../workingBitmap';
import {
  DEFAULT_SETTINGS,
  PALETTE_KEYS,
  type ComboLUTEntry,
  type MatchedGrid,
  type PipelineSettings,
  type SourceImage,
} from '../../types/pipeline';

const toLab65 = converter('lab65');

function uniformImage(
  width: number,
  height: number,
  rgb: readonly [number, number, number],
): SourceImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

function gradientImage(width: number, height: number): SourceImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = Math.round((x / Math.max(1, width - 1)) * 255);
      data[i + 1] = Math.round((y / Math.max(1, height - 1)) * 255);
      data[i + 2] = Math.round(((x + y) / Math.max(1, width + height - 2)) * 255);
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

function settings(overrides: Partial<PipelineSettings> = {}): PipelineSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

function comboLutEntry(lut: readonly ComboLUTEntry[], ri: number, gi: number, bi: number): ComboLUTEntry {
  const entry = lut[ri * 25 + gi * 5 + bi];
  if (!entry) throw new Error(`missing combo ${ri}${gi}${bi}`);
  return entry;
}

function culoriLab(entry: ComboLUTEntry): { l: number; a: number; b: number } {
  const converted = toLab65({
    mode: 'lrgb',
    r: entry.lin[0],
    g: entry.lin[1],
    b: entry.lin[2],
  });
  if (!converted) throw new Error('culori returned no colour');
  return converted as { l: number; a: number; b: number };
}

function meanMixLuminance(grid: MatchedGrid): number {
  const lut = buildComboLUT(grid.palette);
  let total = 0;
  const count = grid.cols * grid.rows;
  for (let i = 0; i < count; i += 1) {
    const combo = comboLutEntry(lut, grid.ri[i]!, grid.gi[i]!, grid.bi[i]!);
    total +=
      0.2126 * srgbToLinear(combo.srgb[0]) +
      0.7152 * srgbToLinear(combo.srgb[1]) +
      0.0722 * srgbToLinear(combo.srgb[2]);
  }
  return total / count;
}

describe('pipeline data contracts', () => {
  it('exposes an integer pipeline version', () => {
    expect(Number.isInteger(PIPELINE_VERSION)).toBe(true);
    expect(PIPELINE_VERSION).toBe(1);
  });

  it('returns flat row-major typed arrays of the documented lengths', () => {
    const { grid } = runPipeline({
      image: uniformImage(320, 240, [90, 120, 150]),
      settings: settings(),
    });
    const count = grid.cols * grid.rows;

    expect(grid.ri).toBeInstanceOf(Uint8Array);
    expect(grid.gi).toBeInstanceOf(Uint8Array);
    expect(grid.bi).toBeInstanceOf(Uint8Array);
    expect(grid.deltaE).toBeInstanceOf(Float32Array);
    expect(grid.target).toBeInstanceOf(Uint8ClampedArray);

    expect(grid.ri).toHaveLength(count);
    expect(grid.gi).toHaveLength(count);
    expect(grid.bi).toHaveLength(count);
    expect(grid.deltaE).toHaveLength(count);
    expect(grid.target).toHaveLength(count * 3);
    expect(grid.sourceHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('survives a structured clone with every typed array intact', () => {
    const { grid } = runPipeline({
      image: gradientImage(160, 120),
      settings: settings({ cols: 24, dither: false }),
    });
    const clone = structuredClone(grid);

    expect(clone.cols).toBe(grid.cols);
    expect(clone.rows).toBe(grid.rows);
    expect(clone.palette).toEqual(grid.palette);
    expect(clone.sourceHash).toBe(grid.sourceHash);
    expect(Array.from(clone.ri)).toEqual(Array.from(grid.ri));
    expect(Array.from(clone.gi)).toEqual(Array.from(grid.gi));
    expect(Array.from(clone.bi)).toEqual(Array.from(grid.bi));
    expect(Array.from(clone.deltaE)).toEqual(Array.from(grid.deltaE));
    expect(Array.from(clone.target)).toEqual(Array.from(grid.target));
    expect(Object.prototype.toString.call(clone.ri)).toBe('[object Uint8Array]');
    expect(Object.prototype.toString.call(clone.gi)).toBe('[object Uint8Array]');
    expect(Object.prototype.toString.call(clone.bi)).toBe('[object Uint8Array]');
    expect(Object.prototype.toString.call(clone.deltaE)).toBe('[object Float32Array]');
    expect(Object.prototype.toString.call(clone.target)).toBe('[object Uint8ClampedArray]');
  });

  it('lists every result buffer for zero-copy transfer', () => {
    const { grid } = runPipeline({
      image: uniformImage(64, 48, [30, 60, 90]),
      settings: settings({ cols: 16 }),
    });
    const transfer = gridTransferables(grid);

    expect(transfer).toHaveLength(5);
    expect(transfer).toContain(grid.ri.buffer);
    expect(transfer).toContain(grid.gi.buffer);
    expect(transfer).toContain(grid.bi.buffer);
    expect(transfer).toContain(grid.deltaE.buffer);
    expect(transfer).toContain(grid.target.buffer);
  });
});

describe('prepareWorkingBitmap', () => {
  it('caps the longest edge at 512 px and preserves aspect ratio', () => {
    const image: SourceImage = {
      width: 4032,
      height: 3024,
      data: new Uint8ClampedArray(4032 * 3024 * 4),
    };
    const bitmap = prepareWorkingBitmap(image);

    expect(MAX_WORKING_EDGE).toBe(512);
    expect(Math.max(bitmap.width, bitmap.height)).toBeLessThanOrEqual(512);
    expect(bitmap.width).toBe(512);
    expect(bitmap.height).toBe(384);
    expect(bitmap.width / bitmap.height).toBeCloseTo(4032 / 3024, 5);
    expect(bitmap.data).toBeInstanceOf(Uint8ClampedArray);
    expect(bitmap.data).toHaveLength(bitmap.width * bitmap.height * 4);
  });

  it('keeps a source already inside the bound unchanged', () => {
    const image = uniformImage(320, 240, [10, 20, 30]);
    const bitmap = prepareWorkingBitmap(image);
    expect(bitmap.width).toBe(320);
    expect(bitmap.height).toBe(240);
  });
});

describe('125-combo LUT', () => {
  it.each(PALETTE_KEYS)('builds 125 unique entries for %s', (key) => {
    const lut = buildComboLUT(getPalette(key));
    expect(lut).toHaveLength(125);
    expect(new Set(lut.map((entry) => `${entry.ri}${entry.gi}${entry.bi}`)).size).toBe(125);
  });

  it('optically averages full R + full G + solid black into yellow', () => {
    const lut = buildComboLUT(PENCIL_PALETTES.reflective);
    const yellow = comboLutEntry(lut, 1, 1, 4);
    const redOnly = comboLutEntry(lut, 1, 4, 4);
    const greenOnly = comboLutEntry(lut, 4, 1, 4);

    expect(yellow.lab[2]).toBeGreaterThan(0);
    expect(yellow.lab[0]).toBeGreaterThan(redOnly.lab[0]);
    expect(yellow.lab[0]).toBeGreaterThan(greenOnly.lab[0]);
  });

  it.each(PALETTE_KEYS)('hand-rolled Lab agrees with culori within 0.5 for %s', (key) => {
    const lut = buildComboLUT(getPalette(key));
    for (const entry of lut) {
      const fromLinear = culoriLab(entry);
      const ours = linearRgbToLab(entry.lin[0], entry.lin[1], entry.lin[2]);

      expect(Math.abs(ours[0] - fromLinear.l)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(ours[1] - fromLinear.a)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(ours[2] - fromLinear.b)).toBeLessThanOrEqual(0.5);

      expect(Math.abs(entry.lab[0] - ours[0])).toBeLessThanOrEqual(0.5);
      expect(Math.abs(entry.lab[1] - ours[1])).toBeLessThanOrEqual(0.5);
      expect(Math.abs(entry.lab[2] - ours[2])).toBeLessThanOrEqual(0.5);
    }
  });
});

describe('runPipeline', () => {
  it('is deterministic with dithering disabled', () => {
    const image = gradientImage(200, 150);
    const request = { image, settings: settings({ cols: 32, dither: false }) };
    const first = runPipeline(request).grid;
    const second = runPipeline(request).grid;

    expect(first.ri).toEqual(second.ri);
    expect(first.gi).toEqual(second.gi);
    expect(first.bi).toEqual(second.bi);
    expect(first.deltaE).toEqual(second.deltaE);
    expect(first.target).toEqual(second.target);
  });

  it('maps identical pixels to identical states with dithering disabled', () => {
    const { grid } = runPipeline({
      image: uniformImage(16, 16, [128, 128, 128]),
      settings: settings({ cols: 16, dither: false }),
    });
    const first = 2 * 16 + 2;
    const second = 10 * 16 + 10;

    expect([grid.ri[first], grid.gi[first], grid.bi[first]]).toEqual([
      grid.ri[second],
      grid.gi[second],
      grid.bi[second],
    ]);
  });

  it('reduces mean luminance error on a flat mid-gray patch with dithering', () => {
    const image = uniformImage(180, 180, [128, 128, 128]);
    const target = srgbToLinear(128);

    const withoutDither = runPipeline({
      image,
      settings: settings({ cols: 45, contrast: 1, dither: false }),
    }).grid;
    const withDither = runPipeline({
      image,
      settings: settings({ cols: 45, contrast: 1, dither: true }),
    }).grid;

    const error = (grid: MatchedGrid): number => Math.abs(meanMixLuminance(grid) - target);
    expect(error(withDither)).toBeLessThan(error(withoutDither));
  });

  it.each([8, 15, 97, 0])('rejects width %s outside 16-96', (cols) => {
    expect(() =>
      runPipeline({ image: uniformImage(64, 64, [1, 2, 3]), settings: settings({ cols }) }),
    ).toThrow(RangeError);
  });

  it('accepts the boundary widths 16 and 96', () => {
    const image = uniformImage(320, 240, [120, 90, 60]);
    expect(runPipeline({ image, settings: settings({ cols: 16 }) }).grid.cols).toBe(16);
    expect(runPipeline({ image, settings: settings({ cols: 96 }) }).grid.cols).toBe(96);
  });

  it('keeps sourceHash stable across contrast, dither, and palette changes', () => {
    const image = gradientImage(240, 180);
    const base = runPipeline({ image, settings: settings({ cols: 56 }) }).grid.sourceHash;

    const contrast = runPipeline({
      image,
      settings: settings({ cols: 56, contrast: 2 }),
    }).grid.sourceHash;
    const dither = runPipeline({
      image,
      settings: settings({ cols: 56, dither: false }),
    }).grid.sourceHash;
    const palette = runPipeline({
      image,
      settings: settings({ cols: 56, palette: 'vibrant' }),
    }).grid.sourceHash;

    expect(contrast).toBe(base);
    expect(dither).toBe(base);
    expect(palette).toBe(base);
  });

  it('changes sourceHash when the grid width changes', () => {
    const image = gradientImage(240, 180);
    const at56 = runPipeline({ image, settings: settings({ cols: 56 }) }).grid.sourceHash;
    const at64 = runPipeline({ image, settings: settings({ cols: 64 }) }).grid.sourceHash;
    expect(at56).not.toBe(at64);
  });

  it('completes a 96-wide run inside a generous soft budget', () => {
    const started = Date.now();
    const { grid } = runPipeline({
      image: gradientImage(400, 300),
      settings: settings({ cols: 96 }),
    });
    const elapsed = Date.now() - started;

    expect(grid.cols).toBe(96);
    expect(grid.rows).toBe(72);
    // Soft budget only: report the number in verification.md, never a hard gate.
    expect(elapsed).toBeLessThan(10_000);
  });
});
