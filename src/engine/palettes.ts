import {
  PALETTE_LABELS,
  type PaletteKey,
  type PencilPalette,
  type Rgb,
  type ShadingSeries,
} from '../types/pipeline';

function series(entries: readonly [Rgb, Rgb, Rgb, Rgb, Rgb]): ShadingSeries {
  return entries;
}

/**
 * Measured coloured-pencil values for the 5 shading states.
 * Index 0 = white paper, 1 = full colour, 2 = light black, 3 = heavy black,
 * 4 = solid black. Values match the approved prototype swatches.
 */
export const PENCIL_PALETTES: Record<PaletteKey, PencilPalette> = {
  reflective: {
    key: 'reflective',
    label: PALETTE_LABELS.reflective,
    border: [24, 24, 26],
    R: series([
      [244, 241, 234],
      [198, 46, 42],
      [136, 36, 34],
      [74, 26, 26],
      [28, 27, 29],
    ]),
    G: series([
      [244, 241, 234],
      [48, 152, 68],
      [36, 104, 48],
      [26, 58, 34],
      [28, 27, 29],
    ]),
    B: series([
      [244, 241, 234],
      [42, 86, 186],
      [32, 60, 128],
      [24, 38, 72],
      [28, 27, 29],
    ]),
  },
  vibrant: {
    key: 'vibrant',
    label: PALETTE_LABELS.vibrant,
    border: [18, 18, 20],
    R: series([
      [250, 248, 242],
      [232, 38, 36],
      [162, 30, 30],
      [88, 22, 24],
      [20, 20, 22],
    ]),
    G: series([
      [250, 248, 242],
      [44, 192, 68],
      [32, 130, 48],
      [22, 70, 32],
      [20, 20, 22],
    ]),
    B: series([
      [250, 248, 242],
      [40, 102, 232],
      [30, 72, 160],
      [22, 42, 88],
      [20, 20, 22],
    ]),
  },
  emissive: {
    key: 'emissive',
    label: PALETTE_LABELS.emissive,
    border: [8, 8, 10],
    R: series([
      [255, 255, 255],
      [255, 24, 24],
      [175, 16, 16],
      [92, 10, 10],
      [10, 10, 12],
    ]),
    G: series([
      [255, 255, 255],
      [24, 255, 42],
      [16, 175, 28],
      [10, 92, 18],
      [10, 10, 12],
    ]),
    B: series([
      [255, 255, 255],
      [30, 90, 255],
      [20, 62, 175],
      [12, 34, 92],
      [10, 10, 12],
    ]),
  },
};

export function getPalette(key: PaletteKey): PencilPalette {
  const palette = PENCIL_PALETTES[key];
  if (!palette) throw new RangeError(`Unknown pencil palette: ${String(key)}`);
  return palette;
}
