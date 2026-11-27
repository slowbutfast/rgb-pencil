import { readFileSync } from 'node:fs';

import { decode } from 'jpeg-js';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  buildComboLUT,
  deltaE2000,
  deltaE76Squared,
  linearRgbToLab,
  srgbToLinear,
} from '../colorMath';
import { matchGrid } from '../matcher';
import { PIPELINE_VERSION, runPipeline } from '../pipeline';
import {
  StalePipelineResultError,
  createWorkerEngineClient,
} from '../pipelineClient';
import { handlePipelineJob } from '../../workers/pipeline.worker';
import { getPalette } from '../palettes';
import {
  DEFAULT_FILTERS,
  DEFAULT_SETTINGS,
  type ColorFilters,
  type MatchedGrid,
  type PipelineRequest,
  type PipelineSettings,
  type SourceImage,
} from '../../types/pipeline';

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
      const index = (y * width + x) * 4;
      data[index] = Math.round((x / (width - 1)) * 255);
      data[index + 1] = Math.round((y / (height - 1)) * 255);
      data[index + 2] = Math.round(((x + y) / (width + height - 2)) * 255);
      data[index + 3] = 255;
    }
  }
  return { width, height, data };
}

function settings(overrides: Partial<PipelineSettings> = {}): PipelineSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

function filters(overrides: Partial<ColorFilters> = {}): ColorFilters {
  return { ...DEFAULT_FILTERS, ...overrides };
}

const fixtureCache = new Map<string, SourceImage>();

function fixture(name: 'white_cat' | 'cat_face'): SourceImage {
  const cached = fixtureCache.get(name);
  if (cached) return cached;
  const bytes = readFileSync(`src/engine/__tests__/fixtures/${name}.jpg`);
  const decoded = decode(bytes, { useTArray: true, formatAsRGBA: true });
  const image: SourceImage = {
    width: decoded.width,
    height: decoded.height,
    data: new Uint8ClampedArray(decoded.data),
  };
  fixtureCache.set(name, image);
  return image;
}

function combosOf(grid: MatchedGrid): string[] {
  const result: string[] = [];
  for (let i = 0; i < grid.cols * grid.rows; i += 1) {
    result.push(`${grid.ri[i]},${grid.gi[i]},${grid.bi[i]}`);
  }
  return result;
}

function expectGridsEqual(actual: MatchedGrid, expected: MatchedGrid): void {
  expect(actual.cols).toBe(expected.cols);
  expect(actual.rows).toBe(expected.rows);
  expect(Array.from(actual.ri)).toEqual(Array.from(expected.ri));
  expect(Array.from(actual.gi)).toEqual(Array.from(expected.gi));
  expect(Array.from(actual.bi)).toEqual(Array.from(expected.bi));
  expect(Array.from(actual.deltaE)).toEqual(Array.from(expected.deltaE));
  expect(Array.from(actual.target)).toEqual(Array.from(expected.target));
  expect(actual.sourceHash).toBe(expected.sourceHash);
}

function targetLabAt(grid: MatchedGrid, cell: number): readonly [number, number, number] {
  return linearRgbToLab(
    srgbToLinear(grid.target[cell * 3]!),
    srgbToLinear(grid.target[cell * 3 + 1]!),
    srgbToLinear(grid.target[cell * 3 + 2]!),
  );
}

describe('default filters', () => {
  it('returns byte-identical grids when filters are omitted or DEFAULT_FILTERS', () => {
    const images = [fixture('white_cat'), fixture('cat_face'), gradientImage(96, 72)];
    for (const image of images) {
      for (const dither of [false, true]) {
        const current = settings({ cols: 24, dither });
        const without = matchGrid(image, current);
        const withDefaults = matchGrid(image, current, DEFAULT_FILTERS);
        expectGridsEqual(withDefaults, without);
      }
    }
  });

  it('keeps the source fingerprint independent of filters', () => {
    const image = uniformImage(48, 48, [120, 80, 40]);
    const plain = matchGrid(image, settings({ cols: 16, dither: false }));
    const filtered = matchGrid(
      image,
      settings({ cols: 16, dither: false }),
      filters({ blackPoint: 25, gains: [1.15, 0.8, 0.85], chromaScale: 1.2 }),
    );
    expect(filtered.sourceHash).toBe(plain.sourceHash);
  });
});

describe('filter validation', () => {
  const image = uniformImage(32, 32, [128, 128, 128]);
  const invalid: Array<[string, ColorFilters]> = [
    ['blackPoint below range', filters({ blackPoint: -1 })],
    ['blackPoint above range', filters({ blackPoint: 41 })],
    ['blackPoint fractional', filters({ blackPoint: 1.5 })],
    ['blackPoint non-finite', filters({ blackPoint: Number.NaN })],
    ['gain below range', filters({ gains: [0.5, 1, 1] })],
    ['gain above range', filters({ gains: [1.5, 1, 1] })],
    ['gain non-finite', filters({ gains: [1, Number.POSITIVE_INFINITY, 1] })],
    ['chromaScale below range', filters({ chromaScale: 0.4 })],
    ['chromaScale above range', filters({ chromaScale: 1.6 })],
    ['chromaScale non-finite', filters({ chromaScale: Number.NaN })],
    ['errorLimit below range', filters({ errorLimit: 0.01 })],
    ['errorLimit between range and one', filters({ errorLimit: 0.6 })],
    ['errorLimit non-finite', filters({ errorLimit: Number.NaN })],
    ['metric unknown', filters({ metric: 'de94' as never })],
  ];

  it.each(invalid)('rejects %s with RangeError', (_label, value) => {
    expect(() => matchGrid(image, settings({ cols: 16 }), value)).toThrow(RangeError);
  });

  it('accepts an errorLimit of one as the unlimited setting', () => {
    const image = uniformImage(32, 32, [237, 145, 33]);
    const base = settings({ cols: 16, dither: true, ditherStrength: 1 });
    const unlimited = matchGrid(image, base);
    const atOne = matchGrid(image, base, filters({ errorLimit: 1 }));
    expectGridsEqual(atOne, unlimited);
  });
});

describe('filter stages', () => {
  const base = settings({ cols: 16, dither: false, contrast: 1 });

  it('gates channels strictly below the black point', () => {
    const grid = matchGrid(
      uniformImage(32, 32, [24, 25, 30]),
      base,
      filters({ blackPoint: 25 }),
    );
    for (let i = 0; i < grid.cols * grid.rows; i += 1) {
      expect([grid.target[i * 3], grid.target[i * 3 + 1], grid.target[i * 3 + 2]]).toEqual([
        0, 25, 30,
      ]);
    }
  });

  it('applies channel gains with rounding and clamping', () => {
    const gains = filters({ gains: [1.15, 0.8, 0.85] });
    const grid = matchGrid(uniformImage(32, 32, [100, 200, 200]), base, gains);
    for (let i = 0; i < grid.cols * grid.rows; i += 1) {
      expect([grid.target[i * 3], grid.target[i * 3 + 1], grid.target[i * 3 + 2]]).toEqual([
        115, 160, 170,
      ]);
    }

    const clamped = matchGrid(
      uniformImage(32, 32, [240, 240, 240]),
      base,
      filters({ gains: [1.15, 1, 1] }),
    );
    expect([
      clamped.target[0],
      clamped.target[1],
      clamped.target[2],
    ]).toEqual([255, 240, 240]);
  });

  it('halves chroma without moving lightness', () => {
    const input = [170, 110, 90] as const;
    const inputLab = linearRgbToLab(
      srgbToLinear(input[0]),
      srgbToLinear(input[1]),
      srgbToLinear(input[2]),
    );
    const grid = matchGrid(
      uniformImage(32, 32, input),
      base,
      filters({ chromaScale: 0.5 }),
    );
    const [l, a, b] = targetLabAt(grid, 0);
    const chroma = Math.hypot(a, b);
    const inputChroma = Math.hypot(inputLab[1], inputLab[2]);
    expect(Math.abs(l - inputLab[0])).toBeLessThanOrEqual(0.5);
    expect(Math.abs(chroma - inputChroma * 0.5)).toBeLessThanOrEqual(1.0);
  });

  it('handles all stages together and returns the filtered target', () => {
    const grid = matchGrid(
      uniformImage(32, 32, [100, 200, 200]),
      base,
      filters({ blackPoint: 25, gains: [1.15, 0.8, 0.85], chromaScale: 1.2 }),
    );
    expect(grid.target[1]).not.toBe(200);
    expect(grid.target).toHaveLength(grid.cols * grid.rows * 3);
  });
});

describe('bounded diffusion error', () => {
  const orange = () => uniformImage(48, 48, [237, 145, 33]);
  const base = settings({ cols: 32, dither: true, ditherStrength: 1, contrast: 1 });

  function deviations(image: SourceImage, value: ColorFilters): number[] {
    const result: number[] = [];
    matchGrid(image, base, value, {
      onCell: (_index, used, original) => {
        for (let channel = 0; channel < 3; channel += 1) {
          result.push(Math.abs(used[channel]! - original[channel]!));
        }
      },
    });
    return result;
  }

  it('never lets a cell deviate further than the limit', () => {
    const limited = deviations(orange(), filters({ errorLimit: 0.05 }));
    expect(limited.length).toBeGreaterThan(0);
    for (const deviation of limited) expect(deviation).toBeLessThanOrEqual(0.05 + 1e-6);
  });

  it('shows unbounded deviation without the limit', () => {
    const unlimited = deviations(orange(), DEFAULT_FILTERS);
    expect(unlimited.some((deviation) => deviation > 0.05)).toBe(true);
  });

  it('does not let the hook change results', () => {
    const image = orange();
    const without = matchGrid(image, base, filters({ errorLimit: 0.05 }));
    const withHook = matchGrid(image, base, filters({ errorLimit: 0.05 }), { onCell: () => {} });
    expectGridsEqual(withHook, without);
  });

  it('moves a tiny-limit gradient closer to the no-dither result', () => {
    const image = gradientImage(64, 64);
    const noDither = matchGrid(image, settings({ ...base, dither: false }));
    const unlimited = matchGrid(image, base);
    const tiny = matchGrid(image, base, filters({ errorLimit: 0.02 }));

    const fraction = (a: MatchedGrid, b: MatchedGrid): number => {
      const left = combosOf(a);
      const right = combosOf(b);
      let different = 0;
      for (let i = 0; i < left.length; i += 1) if (left[i] !== right[i]) different += 1;
      return different / left.length;
    };

    expect(fraction(tiny, noDither)).toBeLessThan(fraction(unlimited, noDither));
  });
});

describe('CIEDE2000 metric', () => {
  const base = settings({ cols: 16, dither: false, contrast: 1 });
  const orange = () => uniformImage(32, 32, [237, 145, 33]);

  it('changes the pick on bright orange', () => {
    const de76 = matchGrid(orange(), base);
    const de2000 = matchGrid(orange(), base, filters({ metric: 'de2000' }));
    expect([de76.ri[0], de76.gi[0], de76.bi[0]]).toEqual([1, 1, 4]);
    expect([de2000.ri[0], de2000.gi[0], de2000.bi[0]]).toEqual([1, 1, 0]);
  });

  it('equals a brute-force CIEDE2000 minimum over all 125 combos', () => {
    const width = 96;
    const height = 10;
    const data = new Uint8ClampedArray(width * height * 4);
    let state = 0x12345678;
    const random = (): number => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state;
    };
    for (let i = 0; i < width * height; i += 1) {
      data[i * 4] = random() & 0xff;
      data[i * 4 + 1] = random() & 0xff;
      data[i * 4 + 2] = random() & 0xff;
      data[i * 4 + 3] = 255;
    }

    const grid = matchGrid(
      { width, height, data },
      settings({ cols: 96, dither: false, contrast: 1 }),
      filters({ metric: 'de2000' }),
    );
    const lut = buildComboLUT(grid.palette);

    for (let cell = 0; cell < grid.cols * grid.rows; cell += 1) {
      const target = targetLabAt(grid, cell);
      let best = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < lut.length; index += 1) {
        const distance = deltaE2000(target, lut[index]!.lab);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      }
      expect([grid.ri[cell], grid.gi[cell], grid.bi[cell]]).toEqual([
        lut[best]!.ri,
        lut[best]!.gi,
        lut[best]!.bi,
      ]);
    }
  });

  it('keeps deltaE reported as CIELAB ΔE76', () => {
    const grid = matchGrid(orange(), base, filters({ metric: 'de2000' }));
    const lut = buildComboLUT(grid.palette);
    const combo = lut[grid.ri[0]! * 25 + grid.gi[0]! * 5 + grid.bi[0]!]!;
    const expected = Math.sqrt(deltaE76Squared(targetLabAt(grid, 0), combo.lab));
    expect(grid.deltaE[0]).toBeCloseTo(expected, 4);
  });
});

describe('pipeline plumbing', () => {
  const image = uniformImage(48, 48, [210, 120, 60]);
  const active = filters({ blackPoint: 20, gains: [1.1, 0.9, 0.95], chromaScale: 0.9 });

  it('keeps PIPELINE_VERSION unchanged', () => {
    expect(PIPELINE_VERSION).toBe(1);
  });

  it('worker handler equals direct matchGrid and forwards filters', () => {
    const request: PipelineRequest = {
      image,
      settings: settings({ cols: 24 }),
      filters: active,
    };
    const response = handlePipelineJob({ jobId: 7, request });
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    const direct = runPipeline(request);
    expectGridsEqual(response.grid, direct.grid);
    expectGridsEqual(response.grid, matchGrid(image, request.settings, active));
  });

  it('worker client forwards filters and discards a stale filter result', async () => {
    interface Posted {
      jobId: number;
      request: PipelineRequest;
    }
    class FakeWorker {
      readonly posted: Posted[] = [];
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      postMessage(message: unknown): void {
        this.posted.push(message as Posted);
      }
      terminate(): void {}
      respond(jobId: number, grid: MatchedGrid): void {
        this.onmessage?.({ data: { ok: true, jobId, grid } } as MessageEvent);
      }
    }

    const worker = new FakeWorker();
    const client = createWorkerEngineClient({
      workerFactory: () => worker as unknown as Worker,
    });
    const stale = client
      .process({ image, settings: settings({ cols: 16 }), filters: active })
      .then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      );
    const latest = client.process({
      image,
      settings: settings({ cols: 24 }),
      filters: filters({ metric: 'de2000' }),
    });

    expect(worker.posted).toHaveLength(1);
    expect(worker.posted[0]!.request.filters).toEqual(active);

    const firstGrid = matchGrid(image, settings({ cols: 16 }), active);
    worker.respond(1, firstGrid);
    expect(worker.posted).toHaveLength(2);
    expect(worker.posted[1]!.request.filters).toEqual(filters({ metric: 'de2000' }));

    worker.respond(2, matchGrid(image, settings({ cols: 24 }), filters({ metric: 'de2000' })));
    const staleResult = await stale;
    const latestResult = await latest;
    expect(staleResult.ok).toBe(false);
    if (!staleResult.ok) expect(staleResult.error).toBeInstanceOf(StalePipelineResultError);
    expect(latestResult.grid.cols).toBe(24);
  });
});

describe('fixture plumbing', () => {
  it('decodes the cat photos at their documented sizes', () => {
    expect(fixture('white_cat').width).toBe(640);
    expect(fixture('white_cat').height).toBe(638);
    expect(fixture('cat_face').width).toBe(735);
    expect(fixture('cat_face').height).toBe(736);
  });

  it('keeps the palette used by the orange metric test', () => {
    expect(getPalette('reflective').key).toBe('reflective');
  });
});

beforeEach(() => {
  // Kept as a hook so failures in the shared decode cache are isolated per test
  // file run without re-reading the JPEGs for every assertion.
});
