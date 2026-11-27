import { parseCellKey } from '../types/pipeline';

/**
 * Byte length of the completed-cell bitset: `ceil(cols * rows / 8)`.
 * Bit index is `row * cols + col`.
 */
export function completedByteLength(cols: number, rows: number): number {
  const total = Math.max(0, Math.trunc(cols)) * Math.max(0, Math.trunc(rows));
  return Math.ceil(total / 8);
}

/** Pack the runtime `Set<"col,row">` into the storage bitset. */
export function encodeCompleted(
  cells: Iterable<string>,
  cols: number,
  rows: number,
): Uint8Array {
  const bits = new Uint8Array(completedByteLength(cols, rows));
  const total = cols * rows;
  for (const key of cells) {
    const coord = parseCellKey(key);
    if (!coord) continue;
    if (coord.col < 0 || coord.col >= cols || coord.row < 0 || coord.row >= rows) continue;
    const index = coord.row * cols + coord.col;
    if (index < 0 || index >= total) continue;
    bits[index >> 3]! |= 1 << (index & 7);
  }
  return bits;
}

/** Unpack the storage bitset, ignoring any out-of-range bits. */
export function decodeCompleted(
  bits: Uint8Array | ArrayLike<number>,
  cols: number,
  rows: number,
): Set<string> {
  const cells = new Set<string>();
  const total = cols * rows;
  const length = Math.min((bits as Uint8Array).length ?? 0, completedByteLength(cols, rows));
  for (let index = 0; index < total; index += 1) {
    const byte = index >> 3;
    if (byte >= length) break;
    if ((bits[byte]! & (1 << (index & 7))) === 0) continue;
    cells.add(`${index % cols},${Math.floor(index / cols)}`);
  }
  return cells;
}

/** Number of set bits that fall inside the grid. */
export function countCompletedBits(
  bits: Uint8Array | ArrayLike<number>,
  cols: number,
  rows: number,
): number {
  return decodeCompleted(bits, cols, rows).size;
}
