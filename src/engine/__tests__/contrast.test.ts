import { describe, expect, it } from 'vitest';

import { buildContrastLUT, CONTRAST_CENTER } from '../contrast';

function assertClamped(lut: Uint8ClampedArray): void {
  expect(lut).toHaveLength(256);
  for (let value = 0; value < 256; value += 1) {
    const out = lut[value] as number;
    expect(Number.isInteger(out)).toBe(true);
    expect(out).toBeGreaterThanOrEqual(0);
    expect(out).toBeLessThanOrEqual(255);
  }
}

describe('buildContrastLUT', () => {
  it('is an exact identity transform at 1.0x', () => {
    const lut = buildContrastLUT(1);
    for (let value = 0; value < 256; value += 1) {
      expect(lut[value]).toBe(value);
    }
  });

  it('crushes shadows below the 0.46 centre and lifts highlights above it', () => {
    const lut = buildContrastLUT(1.45);
    const centre = Math.round(CONTRAST_CENTER * 255);

    expect(centre).toBe(117);
    expect(lut[64]).toBeLessThan(64);
    expect(lut[100]).toBeLessThan(100);
    expect(lut[192]).toBeGreaterThan(192);
    expect(lut[230]).toBeGreaterThan(230);
  });

  it('clamps every output into [0, 255] across the supported boost range', () => {
    for (const boost of [1, 1.2, 1.45, 1.9, 2.3]) {
      assertClamped(buildContrastLUT(boost));
    }
  });

  it('stays monotonic non-decreasing', () => {
    const lut = buildContrastLUT(1.45);
    for (let value = 1; value < 256; value += 1) {
      expect(lut[value] as number).toBeGreaterThanOrEqual(lut[value - 1] as number);
    }
  });

  it('anchors pure black and pure white', () => {
    const lut = buildContrastLUT(2.3);
    expect(lut[0]).toBe(0);
    expect(lut[255]).toBe(255);
  });
});
