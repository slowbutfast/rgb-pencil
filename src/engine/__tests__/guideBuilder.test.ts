import { describe, expect, it } from 'vitest';

import guideSource from '../guideBuilder.ts?raw';
import {
  buildColumnInstructions,
  paginateChart,
  summariseStates,
} from '../guideBuilder';
import { getPalette } from '../palettes';
import type {
  ColumnInstruction,
  MatchedGrid,
  ShadingStateId,
} from '../../types/pipeline';

type StateFn = (col: number, row: number) => ShadingStateId;

function makeGrid(cols: number, rows: number, state: StateFn): MatchedGrid {
  const count = cols * rows;
  const ri = new Uint8Array(count);
  const gi = new Uint8Array(count);
  const bi = new Uint8Array(count);
  const target = new Uint8ClampedArray(count * 3);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col;
      ri[index] = state(col, row);
      gi[index] = 0;
      bi[index] = 0;
      target[index * 3] = 10;
      target[index * 3 + 1] = 20;
      target[index * 3 + 2] = 30;
    }
  }
  return {
    cols,
    rows,
    ri,
    gi,
    bi,
    deltaE: new Float32Array(count),
    target,
    palette: getPalette('reflective'),
    sourceHash: 'cafebabe',
  };
}

function instructionFor(
  instructions: readonly ColumnInstruction[],
  stripeColumn: number,
): ColumnInstruction {
  const found = instructions.find((entry) => entry.stripeColumn === stripeColumn);
  if (!found) throw new Error(`missing stripe column ${stripeColumn}`);
  return found;
}

/** Expand runs back into per-row states. */
function expand(instruction: ColumnInstruction, rows: number): ShadingStateId[] {
  const states: ShadingStateId[] = [];
  for (const run of instruction.runs) {
    for (let i = 0; i < run.length; i += 1) states[run.startRow + i] = run.state;
  }
  expect(states).toHaveLength(rows);
  return states;
}

describe('buildColumnInstructions', () => {
  it('returns exactly 3 x cols instructions ordered by k = 3c + ch', () => {
    const grid = makeGrid(56, 42, (col) => ((col + 1) % 5) as ShadingStateId);
    const instructions = buildColumnInstructions(grid);

    expect(instructions).toHaveLength(168);
    instructions.forEach((instruction, k) => {
      expect(instruction.stripeColumn).toBe(k);
      expect(instruction.logicalColumn).toBe(Math.floor(k / 3));
      expect(instruction.channel).toBe((['R', 'G', 'B'] as const)[k % 3]);
    });

    const g11 = instructionFor(instructions, 3 * 10 + 1);
    expect(g11.logicalColumn).toBe(10);
    expect(g11.channel).toBe('G');
  });

  it('reads each channel from the matching flat array', () => {
    const grid = makeGrid(16, 12, () => 0);
    grid.gi[5 * 16 + 2] = 3;
    const instructions = buildColumnInstructions(grid);

    const g = instructionFor(instructions, 3 * 2 + 1);
    expect(g.runs).toContainEqual({ state: 3, startRow: 5, length: 1 });

    const r = instructionFor(instructions, 3 * 2);
    const b = instructionFor(instructions, 3 * 2 + 2);
    expect(r.runs.some((run) => run.state === 3)).toBe(false);
    expect(b.runs.some((run) => run.state === 3)).toBe(false);
  });

  it('reconstructs every original column from complete, ordered, maximal runs', () => {
    const grid = makeGrid(23, 37, (col, row) => ((col * 3 + row * 5 + (row % 7)) % 5) as ShadingStateId);
    const instructions = buildColumnInstructions(grid);

    for (const instruction of instructions) {
      const states = expand(instruction, grid.rows);
      const source = [grid.ri, grid.gi, grid.bi][['R', 'G', 'B'].indexOf(instruction.channel)]!;
      for (let row = 0; row < grid.rows; row += 1) {
        expect(states[row]).toBe(source[row * grid.cols + instruction.logicalColumn]);
      }

      let expectedStart = 0;
      instruction.runs.forEach((run, index) => {
        expect(run.startRow).toBe(expectedStart);
        expect(run.length).toBeGreaterThan(0);
        expectedStart += run.length;
        if (index > 0) expect(run.state).not.toBe(instruction.runs[index - 1]!.state);
      });
      expect(expectedStart).toBe(grid.rows);
    }
  });

  it('emits one run for a uniform stripe column', () => {
    const grid = makeGrid(16, 42, () => 1);
    const instructions = buildColumnInstructions(grid);
    for (const instruction of instructions) {
      expect(instruction.runs).toEqual([
        { state: instruction.channel === 'R' ? 1 : 0, startRow: 0, length: 42 },
      ]);
    }
  });

  it('includes white-paper runs', () => {
    const grid = makeGrid(16, 12, () => 0);
    grid.ri[0] = 2;
    const instructions = buildColumnInstructions(grid);
    const r0 = instructionFor(instructions, 0);
    expect(r0.runs[0]).toEqual({ state: 2, startRow: 0, length: 1 });
    expect(r0.runs[1]).toEqual({ state: 0, startRow: 1, length: 11 });
  });

  it('is deterministic for identical input', () => {
    const grid = makeGrid(20, 14, (col, row) => ((col + row) % 5) as ShadingStateId);
    expect(buildColumnInstructions(grid)).toEqual(buildColumnInstructions(grid));
  });
});

describe('summariseStates', () => {
  it('counts every stripe segment and sums to 3 x cols x rows', () => {
    const grid = makeGrid(56, 42, (col, row) => ((col + row) % 5) as ShadingStateId);
    const counts = summariseStates(grid);

    expect(counts).toHaveLength(5);
    expect(counts.reduce((total, value) => total + value, 0)).toBe(56 * 42 * 3);
    expect(counts.reduce((total, value) => total + value, 0)).toBe(7056);

    for (let state = 0; state < 5; state += 1) {
      let expected = 0;
      for (const channel of [grid.ri, grid.gi, grid.bi]) {
        for (const value of channel) if (value === state) expected += 1;
      }
      expect(counts[state]).toBe(expected);
    }
  });
});

describe('paginateChart', () => {
  it('covers every cell with tiles no larger than the tile size', () => {
    const tiles = paginateChart(56, 42, 20, 29);
    const covered = new Set<string>();

    for (const tile of tiles) {
      expect(tile.colEnd - tile.colStart + 1).toBeLessThanOrEqual(20);
      expect(tile.rowEnd - tile.rowStart + 1).toBeLessThanOrEqual(29);
      for (let row = tile.rowStart; row <= tile.rowEnd; row += 1) {
        for (let col = tile.colStart; col <= tile.colEnd; col += 1) {
          covered.add(`${col},${row}`);
        }
      }
    }

    for (let row = 0; row < 42; row += 1) {
      for (let col = 0; col < 56; col += 1) {
        expect(covered.has(`${col},${row}`)).toBe(true);
      }
    }
  });

  it('overlaps horizontally and vertically adjacent tiles by exactly one line', () => {
    const tiles = paginateChart(56, 42, 20, 29);
    const byTopLeft = (a: { rowStart: number; colStart: number }, b: { rowStart: number; colStart: number }): number =>
      a.rowStart - b.rowStart || a.colStart - b.colStart;
    const sorted = [...tiles].sort(byTopLeft);

    for (const tile of sorted) {
      const right = sorted.find(
        (candidate) =>
          candidate.rowStart === tile.rowStart && candidate.colStart === tile.colEnd,
      );
      if (right) expect(right.colStart).toBe(tile.colEnd);

      const below = sorted.find(
        (candidate) =>
          candidate.colStart === tile.colStart && candidate.rowStart === tile.rowEnd,
      );
      if (below) expect(below.rowStart).toBe(tile.rowEnd);
    }
  });

  it('returns a single tile when the grid fits', () => {
    expect(paginateChart(16, 12, 20, 29)).toEqual([
      { colStart: 0, colEnd: 15, rowStart: 0, rowEnd: 11 },
    ]);
  });

  it.each([
    [56, 42, 1, 29],
    [56, 42, 20, 1],
    [56, 42, 0, 29],
    [56, 42, 20, -3],
  ])('rejects a degenerate tile size %i x %i with %i x %i', (cols, rows, tileCols, tileRows) => {
    expect(() => paginateChart(cols, rows, tileCols, tileRows)).toThrow(RangeError);
  });

  it('is deterministic', () => {
    expect(paginateChart(96, 72, 21, 29)).toEqual(paginateChart(96, 72, 21, 29));
  });
});

describe('guideBuilder purity', () => {
  it('imports no DOM, React, worker, or pdf-lib APIs', () => {
    expect(guideSource).not.toMatch(/from ['"](?:pdf-lib|react)['"]/);
    expect(guideSource).not.toMatch(/\bdocument\.|\bwindow\.|\bself\.|new Worker/);
  });
});
