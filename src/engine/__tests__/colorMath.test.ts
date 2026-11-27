import { describe, expect, it } from 'vitest';

import {
  buildComboLUT,
  deltaE2000,
  labToLinearRgb,
  linearRgbToLab,
  linearToSrgb,
  srgbToLinear,
} from '../colorMath';
import { getPalette, PENCIL_PALETTES } from '../palettes';
import { PALETTE_KEYS, type ComboLUTEntry } from '../../types/pipeline';

function entryFor(
  lut: readonly ComboLUTEntry[],
  ri: number,
  gi: number,
  bi: number,
): ComboLUTEntry {
  const entry = lut.find((e) => e.ri === ri && e.gi === gi && e.bi === bi);
  if (!entry) throw new Error(`missing combo ${ri}${gi}${bi}`);
  return entry;
}

describe('sRGB <-> linear RGB', () => {
  it('round-trips every 8-bit channel value', () => {
    for (let value = 0; value <= 255; value += 1) {
      expect(linearToSrgb(srgbToLinear(value))).toBe(value);
    }
  });

  it('uses the IEC 61966-2-1 piecewise curve', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(255)).toBeCloseTo(1, 10);
    expect(srgbToLinear(10)).toBeCloseTo(10 / 255 / 12.92, 10);
    expect(srgbToLinear(128)).toBeCloseTo(0.2158605, 5);
  });

  it('clamps out-of-range inputs', () => {
    expect(srgbToLinear(-10)).toBe(0);
    expect(srgbToLinear(300)).toBeCloseTo(1, 10);
    expect(linearToSrgb(-1)).toBe(0);
    expect(linearToSrgb(2)).toBe(255);
  });
});

describe('linear RGB -> CIELAB', () => {
  it('maps white to L* = 100 and neutral a*/b*', () => {
    const [l, a, b] = linearRgbToLab(1, 1, 1);
    expect(l).toBeCloseTo(100, 3);
    expect(a).toBeCloseTo(0, 3);
    expect(b).toBeCloseTo(0, 3);
  });

  it('maps black to L* = 0', () => {
    const [l, a, b] = linearRgbToLab(0, 0, 0);
    expect(l).toBeCloseTo(0, 6);
    expect(a).toBeCloseTo(0, 6);
    expect(b).toBeCloseTo(0, 6);
  });
});

describe('buildComboLUT', () => {
  it.each(PALETTE_KEYS)('builds exactly 125 unique combos for %s', (key) => {
    const lut = buildComboLUT(getPalette(key));
    expect(lut).toHaveLength(125);

    const seen = new Set<string>();
    for (const entry of lut) {
      expect([0, 1, 2, 3, 4]).toContain(entry.ri);
      expect([0, 1, 2, 3, 4]).toContain(entry.gi);
      expect([0, 1, 2, 3, 4]).toContain(entry.bi);
      seen.add(`${entry.ri},${entry.gi},${entry.bi}`);

      expect(Number.isFinite(entry.lab[0])).toBe(true);
      expect(Number.isFinite(entry.lab[1])).toBe(true);
      expect(Number.isFinite(entry.lab[2])).toBe(true);
      for (const channel of entry.srgb) {
        expect(Number.isInteger(channel)).toBe(true);
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(255);
      }
      for (const linear of entry.lin) {
        expect(linear).toBeGreaterThanOrEqual(0);
        expect(linear).toBeLessThanOrEqual(1);
      }
    }

    expect(seen.size).toBe(125);
  });

  it('weights the dark border at 0.15 in linear RGB', () => {
    const palette = PENCIL_PALETTES.reflective;
    const withoutBorder = entryFor(buildComboLUT(palette, 0), 0, 0, 0);
    const withBorder = entryFor(buildComboLUT(palette, 0.15), 0, 0, 0);

    for (let channel = 0; channel < 3; channel += 1) {
      expect(withBorder.lin[channel]).toBeLessThan(withoutBorder.lin[channel]);
    }

    // The 0.15 border share is folded into every stripe equally: all three
    // channels receive exactly borderRatio * borderLin.
    const borderLin = palette.border.map(srgbToLinear);
    for (let channel = 0; channel < 3; channel += 1) {
      expect(withBorder.lin[channel]).toBeCloseTo(
        withoutBorder.lin[channel] * 0.85 + borderLin[channel] * 0.15,
        10,
      );
    }
  });

  it('optically averages full red + full green + solid black into yellow', () => {
    const lut = buildComboLUT(getPalette('reflective'));
    const yellow = entryFor(lut, 1, 1, 4);

    expect(yellow.lab[2]).toBeGreaterThan(0);

    const redOnly = entryFor(lut, 1, 4, 4);
    const greenOnly = entryFor(lut, 4, 1, 4);
    const blueOnly = entryFor(lut, 4, 4, 1);

    expect(yellow.lab[0]).toBeGreaterThan(redOnly.lab[0]);
    expect(yellow.lab[0]).toBeGreaterThan(greenOnly.lab[0]);
    expect(yellow.lab[0]).toBeGreaterThan(blueOnly.lab[0]);
  });
});

/** Small deterministic PRNG so the round-trip sample is reproducible. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

describe('CIEDE2000', () => {
  // Sharma, Wu, Dalal (2005) supplementary reference pairs.
  const pairs: Array<[readonly [number, number, number], readonly [number, number, number], number]> = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
    [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0],
    [[50, 2.5, 0], [50, 0, -2.5], 4.3065],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  ];

  it.each(pairs)('matches the published pair %j -> %j', (a, b, expected) => {
    expect(deltaE2000(a, b)).toBeCloseTo(expected, 4);
    expect(deltaE2000(b, a)).toBeCloseTo(expected, 4);
  });

  it('is symmetric to 1e-9 on random pairs', () => {
    const random = seeded(0x5eed);
    for (let i = 0; i < 200; i += 1) {
      const a = [random() * 100, random() * 200 - 100, random() * 200 - 100] as const;
      const b = [random() * 100, random() * 200 - 100, random() * 200 - 100] as const;
      expect(Math.abs(deltaE2000(a, b) - deltaE2000(b, a))).toBeLessThan(1e-9);
    }
  });

  it('is zero for identical colours', () => {
    expect(deltaE2000([55, 12, -7], [55, 12, -7])).toBe(0);
  });
});

describe('labToLinearRgb', () => {
  it('inverts linearRgbToLab within 1e-4 per channel on random in-gamut colours', () => {
    const random = seeded(0xc0ffee);
    for (let i = 0; i < 1_000; i += 1) {
      const r = random();
      const g = random();
      const b = random();
      const lab = linearRgbToLab(r, g, b);
      const [rr, gg, bb] = labToLinearRgb(lab[0], lab[1], lab[2]);
      expect(Math.abs(rr - r)).toBeLessThan(1e-4);
      expect(Math.abs(gg - g)).toBeLessThan(1e-4);
      expect(Math.abs(bb - b)).toBeLessThan(1e-4);
    }
  });

  it('maps white and black back to their linear endpoints', () => {
    const white = linearRgbToLab(1, 1, 1);
    const [wr, wg, wb] = labToLinearRgb(white[0], white[1], white[2]);
    expect(wr).toBeCloseTo(1, 6);
    expect(wg).toBeCloseTo(1, 6);
    expect(wb).toBeCloseTo(1, 6);

    const black = linearRgbToLab(0, 0, 0);
    const [br, bg, bb] = labToLinearRgb(black[0], black[1], black[2]);
    expect(br).toBeCloseTo(0, 9);
    expect(bg).toBeCloseTo(0, 9);
    expect(bb).toBeCloseTo(0, 9);
  });
});
