import { deltaE2000Raw, linearRgbToLab, srgbToLinear } from '../colorMath';
import { matchGrid } from '../matcher';
import { blurLinearRaster, buildLinearStripeRaster } from '../opticalBlur';
import {
  DEFAULT_FILTERS,
  FILTER_PRESETS,
  cloneFilters,
  type ColorFilters,
  type Lab,
  type PipelineSettings,
  type Rgb,
  type SourceImage,
} from '../../types/pipeline';

/** The same paper colour the Squint view uses when padding the raster edge. */
const PAPER_RGB: Rgb = [250, 250, 250];
const BLUR_CELLS = 1;
const BORDER_CELLS = 2;

export interface EvalMetrics {
  /** Mean CIEDE2000 over included cells. */
  meanDE00: number;
  /** Mean rendered chroma over near-neutral truth cells. */
  neutralCast: number;
  /** Mean signed a* error over near-neutral truth cells. */
  neutralDa: number;
  /** Mean signed b* error over near-neutral truth cells. */
  neutralDb: number;
  /** Mean CIEDE2000 over warm (20°-100°) truth cells. */
  warmDE00: number;
  /** Fraction of dark truth cells not rendered as solid black. */
  darkSpeckle: number;
  /** Fraction of included cells above CIEDE2000 15. */
  highDE: number;
}

export interface SweepFixture {
  name: string;
  image: SourceImage;
}

export interface SweepConfig {
  name: string;
  filters: ColorFilters;
}

export interface SweepRow {
  name: string;
  filters?: ColorFilters;
  metrics: Record<string, EvalMetrics>;
  /** Percent change in meanDE00 versus the baseline, per fixture. */
  deltaPercent: Record<string, number>;
}

function labFromRgb(rgb: readonly [number, number, number]): Lab {
  return linearRgbToLab(
    srgbToLinear(rgb[0]),
    srgbToLinear(rgb[1]),
    srgbToLinear(rgb[2]),
  );
}

function emptyMetrics(): EvalMetrics {
  return {
    meanDE00: 0,
    neutralCast: 0,
    neutralDa: 0,
    neutralDb: 0,
    warmDE00: 0,
    darkSpeckle: 0,
    highDE: 0,
  };
}

/**
 * Score aligned truth/rendered CIELAB cells. Border cells (within two cells of
 * any edge) are excluded because the Squint blur pads them with paper.
 */
export function scoreCells(
  truth: readonly Lab[],
  rendered: readonly Lab[],
  combos: ReadonlyArray<readonly [number, number, number]>,
  cols: number,
  rows: number,
): EvalMetrics {
  let included = 0;
  let totalDE = 0;
  let neutralCount = 0;
  let neutralChroma = 0;
  let neutralDa = 0;
  let neutralDb = 0;
  let warmCount = 0;
  let warmDE = 0;
  let darkCount = 0;
  let darkSpeckle = 0;
  let highDE = 0;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (
        col < BORDER_CELLS ||
        col >= cols - BORDER_CELLS ||
        row < BORDER_CELLS ||
        row >= rows - BORDER_CELLS
      ) {
        continue;
      }
      const index = row * cols + col;
      const truthLab = truth[index];
      const renderedLab = rendered[index];
      if (!truthLab || !renderedLab) continue;

      included += 1;
      const de = deltaE2000Raw(
        truthLab[0],
        truthLab[1],
        truthLab[2],
        renderedLab[0],
        renderedLab[1],
        renderedLab[2],
      );
      totalDE += de;
      if (de > 15) highDE += 1;

      const truthChroma = Math.hypot(truthLab[1], truthLab[2]);
      const renderedChroma = Math.hypot(renderedLab[1], renderedLab[2]);

      if (truthChroma < 8 && truthLab[0] >= 20 && truthLab[0] <= 95) {
        neutralCount += 1;
        neutralChroma += renderedChroma;
        neutralDa += renderedLab[1] - truthLab[1];
        neutralDb += renderedLab[2] - truthLab[2];
      }

      if (truthChroma > 20) {
        const hue = ((Math.atan2(truthLab[2], truthLab[1]) * 180) / Math.PI + 360) % 360;
        if (hue >= 20 && hue <= 100) {
          warmCount += 1;
          warmDE += de;
        }
      }

      if (truthLab[0] < 15) {
        darkCount += 1;
        const combo = combos[index];
        if (!combo || combo[0] !== 4 || combo[1] !== 4 || combo[2] !== 4) {
          darkSpeckle += 1;
        }
      }
    }
  }

  if (included === 0) return emptyMetrics();
  return {
    meanDE00: totalDE / included,
    neutralCast: neutralCount > 0 ? neutralChroma / neutralCount : 0,
    neutralDa: neutralCount > 0 ? neutralDa / neutralCount : 0,
    neutralDb: neutralCount > 0 ? neutralDb / neutralCount : 0,
    warmDE00: warmCount > 0 ? warmDE / warmCount : 0,
    darkSpeckle: darkCount > 0 ? darkSpeckle / darkCount : 0,
    highDE: highDE / included,
  };
}

/**
 * Run the filter candidate through the same Squint renderer the UI uses, then
 * compare each cell with the unfiltered contrast-boosted target.
 */
export function evaluate(
  image: SourceImage,
  settings: PipelineSettings,
  filters: ColorFilters = DEFAULT_FILTERS,
): EvalMetrics {
  const truthGrid = matchGrid(image, settings);
  const runGrid = matchGrid(image, settings, filters);
  const raster = buildLinearStripeRaster(runGrid);
  const blurred = blurLinearRaster(raster, BLUR_CELLS, PAPER_RGB);

  const truth: Lab[] = [];
  const rendered: Lab[] = [];
  const combos: Array<readonly [number, number, number]> = [];

  for (let row = 0; row < runGrid.rows; row += 1) {
    for (let col = 0; col < runGrid.cols; col += 1) {
      const cell = row * runGrid.cols + col;
      truth.push(
        labFromRgb([
          truthGrid.target[cell * 3]!,
          truthGrid.target[cell * 3 + 1]!,
          truthGrid.target[cell * 3 + 2]!,
        ]),
      );

      // Average the cell's 3 x 3 subpixels in linear light.
      let r = 0;
      let g = 0;
      let b = 0;
      for (let subRow = 0; subRow < 3; subRow += 1) {
        for (let subCol = 0; subCol < 3; subCol += 1) {
          const x = col * 3 + subCol;
          const y = row * 3 + subRow;
          const offset = (y * blurred.width + x) * 3;
          r += blurred.data[offset]!;
          g += blurred.data[offset + 1]!;
          b += blurred.data[offset + 2]!;
        }
      }
      rendered.push(linearRgbToLab(r / 9, g / 9, b / 9));
      combos.push([runGrid.ri[cell]!, runGrid.gi[cell]!, runGrid.bi[cell]!]);
    }
  }

  return scoreCells(truth, rendered, combos, runGrid.cols, runGrid.rows);
}

/** A 64-step neutral grey ramp, ten pixels per step. */
export function syntheticNeutralFixture(): SourceImage {
  const steps = 64;
  const bandWidth = 10;
  const width = steps * bandWidth;
  const height = 64;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const step = Math.floor(x / bandWidth);
      const value = Math.round((step / (steps - 1)) * 255);
      const index = (y * width + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  return { width, height, data };
}

const WARM_PATCHES: ReadonlyArray<readonly [number, number, number]> = [
  [222, 150, 90], // ginger
  [237, 145, 33], // bright orange
  [240, 222, 190], // cream
  [200, 120, 110], // pink
  [160, 95, 50], // dark ginger
];

/** Five flat warm patches from the assessment. */
export function syntheticWarmFixture(): SourceImage {
  const patchWidth = 64;
  const width = WARM_PATCHES.length * patchWidth;
  const height = 64;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const patch = WARM_PATCHES[Math.min(WARM_PATCHES.length - 1, Math.floor(x / patchWidth))]!;
      const index = (y * width + x) * 4;
      data[index] = patch[0];
      data[index + 1] = patch[1];
      data[index + 2] = patch[2];
      data[index + 3] = 255;
    }
  }
  return { width, height, data };
}

function bif(name: string, filters: Partial<ColorFilters>): SweepConfig {
  return { name, filters: { ...DEFAULT_FILTERS, ...filters } };
}

/** One-factor candidates plus the UI presets, excluding the baseline row. */
export const SWEEP_CONFIGS: readonly SweepConfig[] = [
  bif('errorLimit 0.20', { errorLimit: 0.2 }),
  bif('errorLimit 0.10', { errorLimit: 0.1 }),
  bif('errorLimit 0.05', { errorLimit: 0.05 }),
  bif('errorLimit 0.02', { errorLimit: 0.02 }),
  bif('metric de2000', { metric: 'de2000' }),
  bif('chromaScale 0.7', { chromaScale: 0.7 }),
  bif('chromaScale 0.85', { chromaScale: 0.85 }),
  bif('chromaScale 1.15', { chromaScale: 1.15 }),
  bif('chromaScale 1.3', { chromaScale: 1.3 }),
  bif('blackPoint 15', { blackPoint: 15 }),
  bif('blackPoint 25', { blackPoint: 25 }),
  bif('gains 1.15/0.80/0.85', { gains: [1.15, 0.8, 0.85] }),
  ...FILTER_PRESETS.filter((preset) => preset.key !== 'none').map((preset) => ({
    name: `preset: ${preset.label}`,
    filters: cloneFilters(preset.filters),
  })),
];

function deltaPercent(value: number, baseline: number): number {
  return baseline === 0 ? 0 : ((value - baseline) / baseline) * 100;
}

/** Evaluate the baseline and every candidate on every fixture. */
export function sweep(
  fixtures: readonly SweepFixture[],
  settings: PipelineSettings,
  configs: readonly SweepConfig[] = SWEEP_CONFIGS,
): SweepRow[] {
  const baseline: SweepRow = { name: 'Baseline', metrics: {}, deltaPercent: {} };
  for (const fixture of fixtures) {
    baseline.metrics[fixture.name] = evaluate(fixture.image, settings);
    baseline.deltaPercent[fixture.name] = 0;
  }

  const rows: SweepRow[] = [baseline];
  for (const config of configs) {
    const row: SweepRow = {
      name: config.name,
      filters: cloneFilters(config.filters),
      metrics: {},
      deltaPercent: {},
    };
    for (const fixture of fixtures) {
      const metrics = evaluate(fixture.image, settings, config.filters);
      row.metrics[fixture.name] = metrics;
      row.deltaPercent[fixture.name] = deltaPercent(
        metrics.meanDE00,
        baseline.metrics[fixture.name]!.meanDE00,
      );
    }
    rows.push(row);
  }
  return rows;
}

function formatNumber(value: number, digits: number): string {
  return value.toFixed(digits);
}

/** One markdown table: a metric group per fixture, plus Δ meanDE00. */
export function formatSweepTable(
  rows: readonly SweepRow[],
  fixtures: readonly SweepFixture[],
): string {
  const header = ['Configuration'];
  const alignment = [':---'];
  for (const fixture of fixtures) {
    for (const metric of [
      'meanDE00',
      'Δ%',
      'neutralCast',
      'neutralDa',
      'neutralDb',
      'warmDE00',
      'darkSpeckle',
      'highDE',
    ]) {
      header.push(`${fixture.name} ${metric}`);
      alignment.push(metric === 'Δ%' ? '---:' : '---:');
    }
  }

  const lines = [`| ${header.join(' | ')} |`, `| ${alignment.join(' | ')} |`];
  for (const row of rows) {
    const cells = [row.name];
    for (const fixture of fixtures) {
      const metrics = row.metrics[fixture.name];
      if (!metrics) {
        cells.push('', '', '', '', '', '', '', '');
        continue;
      }
      cells.push(
        formatNumber(metrics.meanDE00, 2),
        `${row.deltaPercent[fixture.name]! >= 0 ? '+' : ''}${formatNumber(
          row.deltaPercent[fixture.name]!,
          1,
        )}`,
        formatNumber(metrics.neutralCast, 2),
        `${metrics.neutralDa >= 0 ? '+' : ''}${formatNumber(metrics.neutralDa, 2)}`,
        `${metrics.neutralDb >= 0 ? '+' : ''}${formatNumber(metrics.neutralDb, 2)}`,
        formatNumber(metrics.warmDE00, 2),
        formatNumber(metrics.darkSpeckle, 3),
        formatNumber(metrics.highDE, 3),
      );
    }
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}
