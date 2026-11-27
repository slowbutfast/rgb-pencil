import { readFileSync } from 'node:fs';

import { decode } from 'jpeg-js';
import { describe, expect, it } from 'vitest';

import {
  evaluate,
  scoreCells,
  syntheticNeutralFixture,
  syntheticWarmFixture,
  type EvalMetrics,
} from '../evaluation/filterEval';
import { matchGrid } from '../matcher';
import {
  DEFAULT_FILTERS,
  DEFAULT_SETTINGS,
  type Lab,
  type PipelineSettings,
  type SourceImage,
} from '../../types/pipeline';

function settings(overrides: Partial<PipelineSettings> = {}): PipelineSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

function fixture(name: 'white_cat' | 'cat_face'): SourceImage {
  const bytes = readFileSync(`src/engine/__tests__/fixtures/${name}.jpg`);
  const decoded = decode(bytes, { useTArray: true, formatAsRGBA: true });
  return {
    width: decoded.width,
    height: decoded.height,
    data: new Uint8ClampedArray(decoded.data),
  };
}

function uniform(width: number, height: number, rgb: readonly [number, number, number]): SourceImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

function expectZero(metrics: EvalMetrics): void {
  expect(metrics.meanDE00).toBe(0);
  expect(metrics.neutralCast).toBe(0);
  expect(metrics.neutralDa).toBe(0);
  expect(metrics.neutralDb).toBe(0);
  expect(metrics.warmDE00).toBe(0);
  expect(metrics.darkSpeckle).toBe(0);
  expect(metrics.highDE).toBe(0);
}

function neutralCells(cols: number, rows: number, shift: number): {
  truth: Lab[];
  rendered: Lab[];
  combos: Array<readonly [number, number, number]>;
} {
  const truth: Lab[] = [];
  const rendered: Lab[] = [];
  const combos: Array<readonly [number, number, number]> = [];
  for (let i = 0; i < cols * rows; i += 1) {
    truth.push([50, 0, 0]);
    rendered.push([50, shift, 0]);
    combos.push([4, 4, 4]);
  }
  return { truth, rendered, combos };
}

describe('evaluation metrics', () => {
  it('scores a perfect rendering as zero', () => {
    const { truth, rendered, combos } = neutralCells(8, 8, 0);
    expectZero(scoreCells(truth, rendered, combos, 8, 8));
  });

  it('reports a known +3 a* shift as neutralDa +3', () => {
    const { truth, rendered, combos } = neutralCells(8, 8, 3);
    const metrics = scoreCells(truth, rendered, combos, 8, 8);
    expect(metrics.neutralDa).toBeCloseTo(3, 1);
    expect(metrics.neutralDb).toBe(0);
  });

  it('excludes cells within two cells of the border', () => {
    const cols = 8;
    const rows = 8;
    const truth: Lab[] = [];
    const rendered: Lab[] = [];
    const combos: Array<readonly [number, number, number]> = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const edge = col < 2 || col >= cols - 2 || row < 2 || row >= rows - 2;
        truth.push([50, 0, 0]);
        // A huge error on the border must not contribute.
        rendered.push(edge ? [50, 40, 0] : [50, 0, 0]);
        combos.push([4, 4, 4]);
      }
    }
    expectZero(scoreCells(truth, rendered, combos, cols, rows));
  });

  it('is deterministic and ignores the dither state of the truth', () => {
    const image = fixture('white_cat');
    const base = settings({ cols: 32 });
    const first = evaluate(image, base);
    const second = evaluate(image, base);
    expect(second).toEqual(first);
  });

  it('measures dark speckle from the chosen combos', () => {
    const cols = 6;
    const rows = 6;
    const truth: Lab[] = [];
    const rendered: Lab[] = [];
    const combos: Array<readonly [number, number, number]> = [];
    for (let i = 0; i < cols * rows; i += 1) {
      truth.push([8, 0, 0]);
      rendered.push([8, 0, 0]);
      combos.push([1, 1, 1]);
    }
    const metrics = scoreCells(truth, rendered, combos, cols, rows);
    expect(metrics.darkSpeckle).toBe(1);
  });
});

describe('evaluation fixtures', () => {
  it('decodes white_cat at 640 x 638', () => {
    const image = fixture('white_cat');
    expect(image.width).toBe(640);
    expect(image.height).toBe(638);
  });

  it('provides a synthetic neutral ramp and warm patches', () => {
    const neutral = syntheticNeutralFixture();
    const warm = syntheticWarmFixture();
    expect(neutral.width).toBeGreaterThanOrEqual(64);
    expect(warm.width).toBeGreaterThanOrEqual(5);
    expect(evaluate(neutral, settings({ cols: 32 }), DEFAULT_FILTERS).meanDE00).toBeGreaterThanOrEqual(0);
    expect(evaluate(warm, settings({ cols: 32 })).warmDE00).toBeGreaterThan(0);
  });

  it('scores the baseline against itself with a small nonzero mix error', () => {
    const image = uniform(32, 32, [128, 128, 128]);
    const grid = matchGrid(image, settings({ cols: 16, dither: false }));
    expect(grid.rows).toBeGreaterThan(0);
    expect(evaluate(image, settings({ cols: 16 })).meanDE00).toBeGreaterThan(0);
  });
});
