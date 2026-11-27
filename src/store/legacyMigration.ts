import { parseCellKey } from '../types/pipeline';

/** Read-only surface of the first change's progress storage. */
export interface StorageLike {
  getItem(key: string): string | null;
  removeItem(key: string): void;
}

/** Legacy key written by `design-language-and-ui-ux`; never written again. */
export const LEGACY_STORAGE_PREFIX = 'rgb-pencil:v1:';

export function legacyKey(sourceHash: string): string {
  return LEGACY_STORAGE_PREFIX + sourceHash;
}

/**
 * Adopt the legacy `"col,row"` progress for one image exactly once, dropping
 * out-of-range cells, then remove the key. Any storage error degrades to an
 * empty set; legacy keys are never written.
 */
export function adoptLegacyCompleted(
  storage: StorageLike | null,
  sourceHash: string,
  cols: number,
  rows: number,
): Set<string> {
  const cells = new Set<string>();
  if (!storage) return cells;
  const key = legacyKey(sourceHash);

  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
  } catch {
    return cells;
  }
  if (raw === null) return cells;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (typeof entry !== 'string') continue;
        const coord = parseCellKey(entry);
        if (!coord) continue;
        if (coord.col < 0 || coord.col >= cols || coord.row < 0 || coord.row >= rows) continue;
        cells.add(`${coord.col},${coord.row}`);
      }
    }
  } catch {
    /* corrupt legacy payload: drop it below */
  }

  try {
    storage.removeItem(key);
  } catch {
    /* best-effort cleanup */
  }
  return cells;
}
