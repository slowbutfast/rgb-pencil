import { readFileSync } from 'node:fs';
import process from 'node:process';

import { decode } from 'jpeg-js';
import { describe, expect, it } from 'vitest';

import {
  SWEEP_CONFIGS,
  evaluate,
  formatSweepTable,
  sweep,
  syntheticNeutralFixture,
  syntheticWarmFixture,
  type SweepFixture,
} from '../evaluation/filterEval';
import {
  DEFAULT_SETTINGS,
  type PipelineSettings,
  type SourceImage,
} from '../../types/pipeline';

function settings(overrides: Partial<PipelineSettings> = {}): PipelineSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

function photo(name: 'white_cat' | 'cat_face'): SourceImage {
  const bytes = readFileSync(`src/engine/__tests__/fixtures/${name}.jpg`);
  const decoded = decode(bytes, { useTArray: true, formatAsRGBA: true });
  return {
    width: decoded.width,
    height: decoded.height,
    data: new Uint8ClampedArray(decoded.data),
  };
}

const fixtures: SweepFixture[] = [
  { name: 'white cat', image: photo('white_cat') },
  { name: 'orange cat', image: photo('cat_face') },
  { name: 'neutral ramp', image: syntheticNeutralFixture() },
  { name: 'warm patches', image: syntheticWarmFixture() },
];

describe('filter sweep', () => {
  it('prints a complete, deterministic table without asserting improvement', () => {
    const base = settings({ cols: 32 });
    const rows = sweep(fixtures, base);
    const table = formatSweepTable(rows, fixtures);
    process.stdout.write(`\n${table}\n\n`);

    expect(rows).toHaveLength(SWEEP_CONFIGS.length + 1);
    expect(rows[0]!.name).toBe('Baseline');
    expect(table).toContain('Baseline');
    for (const fixture of fixtures) {
      expect(table).toContain(fixture.name);
      expect(rows[0]!.metrics[fixture.name]).toBeDefined();
      for (const config of SWEEP_CONFIGS) {
        const row = rows.find((candidate) => candidate.name === config.name);
        expect(row?.metrics[fixture.name]).toBeDefined();
      }
    }

    // The baseline row must be the independent unfiltered evaluation.
    for (const fixture of fixtures) {
      const independent = evaluate(fixture.image, base);
      expect(rows[0]!.metrics[fixture.name]).toEqual(independent);
    }

    // Determinism: a second sweep produces identical metrics.
    expect(sweep(fixtures, base)).toEqual(rows);
  }, 120_000);
});
