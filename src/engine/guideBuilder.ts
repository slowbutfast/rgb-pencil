import type {
  ColumnInstruction,
  ChannelId,
  ChartTile,
  MatchedGrid,
  RleRun,
  ShadingStateId,
  StateCounts,
} from '../types/pipeline';

const CHANNELS: readonly ChannelId[] = ['R', 'G', 'B'];

function channelValues(grid: MatchedGrid, channel: ChannelId): Uint8Array {
  if (channel === 'R') return grid.ri;
  if (channel === 'G') return grid.gi;
  return grid.bi;
}

function runsForColumn(
  values: Uint8Array,
  logicalColumn: number,
  cols: number,
  rows: number,
): RleRun[] {
  const runs: RleRun[] = [];
  if (rows === 0) return runs;

  let state = values[logicalColumn] as ShadingStateId;
  let startRow = 0;
  for (let row = 1; row <= rows; row += 1) {
    const next = row < rows ? (values[row * cols + logicalColumn] as ShadingStateId) : -1;
    if (next !== state) {
      runs.push({ state, startRow, length: row - startRow });
      if (row < rows) {
        state = next as ShadingStateId;
        startRow = row;
      }
    }
  }
  return runs;
}

/**
 * Convert the flat grid into `3 * cols` per-stripe-column run lists ordered by
 * `k = 3c + ch`. Runs are maximal, gap-free, ordered, and include white paper
 * so the printed checklist is complete.
 */
export function buildColumnInstructions(grid: MatchedGrid): ColumnInstruction[] {
  const instructions: ColumnInstruction[] = [];
  for (let stripeColumn = 0; stripeColumn < grid.cols * 3; stripeColumn += 1) {
    const logicalColumn = Math.floor(stripeColumn / 3);
    const channel = CHANNELS[stripeColumn % 3]!;
    const values = channelValues(grid, channel);
    instructions.push({
      stripeColumn,
      logicalColumn,
      channel,
      runs: runsForColumn(values, logicalColumn, grid.cols, grid.rows),
    });
  }
  return instructions;
}

/** Count stripe segments per shading state across R, G, and B. */
export function summariseStates(grid: MatchedGrid): StateCounts {
  const counts: StateCounts = [0, 0, 0, 0, 0];
  for (const values of [grid.ri, grid.gi, grid.bi]) {
    for (let i = 0; i < values.length; i += 1) {
      const state = values[i]!;
      if (state >= 0 && state <= 4) counts[state] += 1;
    }
  }
  return counts;
}

function axisStarts(length: number, tileSize: number): number[] {
  if (tileSize >= length) return [0];
  const starts: number[] = [];
  const step = tileSize - 1;
  for (let start = 0; start < length; start += step) {
    starts.push(start);
    if (start + tileSize >= length) break;
  }
  return starts;
}

/**
 * Paginate the symbol grid into inclusive tiles in row-major order. Adjacent
 * tiles repeat exactly one boundary row/column so printed pages can be aligned.
 * Throws `RangeError` when either tile dimension is below 2.
 */
export function paginateChart(
  cols: number,
  rows: number,
  tileCols: number,
  tileRows: number,
): ChartTile[] {
  if (!Number.isInteger(tileCols) || !Number.isInteger(tileRows) || tileCols < 2 || tileRows < 2) {
    throw new RangeError(
      `Chart tile size must be integers >= 2 (received ${tileCols}x${tileRows})`,
    );
  }
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) {
    throw new RangeError(`Grid size must be positive integers (received ${cols}x${rows})`);
  }

  const tiles: ChartTile[] = [];
  for (const rowStart of axisStarts(rows, tileRows)) {
    const rowEnd = Math.min(rowStart + tileRows - 1, rows - 1);
    for (const colStart of axisStarts(cols, tileCols)) {
      tiles.push({
        colStart,
        colEnd: Math.min(colStart + tileCols - 1, cols - 1),
        rowStart,
        rowEnd,
      });
    }
  }
  return tiles;
}
