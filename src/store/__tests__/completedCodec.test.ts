// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  completedByteLength,
  countCompletedBits,
  decodeCompleted,
  encodeCompleted,
} from '../completedCodec';

describe('completedCodec', () => {
  it('uses ceil(cols * rows / 8) bytes', () => {
    expect(completedByteLength(56, 42)).toBe(294);
    expect(completedByteLength(96, 72)).toBe(864);
    expect(completedByteLength(16, 1)).toBe(2);
  });

  it('round-trips an arbitrary set', () => {
    const cells = new Set(['0,0', '3,7', '55,41', '12,30', '31,20']);
    const bits = encodeCompleted(cells, 56, 42);
    expect(bits).toBeInstanceOf(Uint8Array);
    expect(bits.length).toBe(294);
    expect(decodeCompleted(bits, 56, 42)).toEqual(cells);
    expect(countCompletedBits(bits, 56, 42)).toBe(cells.size);
  });

  it('encodes the empty set as all zeros', () => {
    const bits = encodeCompleted(new Set<string>(), 56, 42);
    expect(bits.every((byte) => byte === 0)).toBe(true);
    expect(decodeCompleted(bits, 56, 42).size).toBe(0);
  });

  it('keeps the corner cells', () => {
    const cells = new Set(['0,0', '55,41', '0,41', '55,0']);
    expect(decodeCompleted(encodeCompleted(cells, 56, 42), 56, 42)).toEqual(cells);
  });

  it('ignores out-of-range bits on decode', () => {
    const bits = encodeCompleted(new Set(['1,1']), 16, 16);
    // Bit index 300 is outside 16 * 16 = 256 cells.
    bits[37]! |= 1 << 4; // 37 * 8 + 4 = 300
    const decoded = decodeCompleted(bits, 16, 16);
    expect([...decoded]).toEqual(['1,1']);
    expect(countCompletedBits(bits, 16, 16)).toBe(1);
  });

  it('ignores malformed and out-of-range coordinates while encoding', () => {
    const bits = encodeCompleted(['abc', '16,0', '-1,2', '3,3', '3.5,2'], 16, 16);
    expect([...decodeCompleted(bits, 16, 16)]).toEqual(['3,3']);
  });

  it('sets bit row * cols + col', () => {
    const bits = encodeCompleted(new Set(['2,1']), 16, 16);
    const index = 1 * 16 + 2;
    expect(bits[Math.floor(index / 8)]! & (1 << index % 8)).toBeTruthy();
  });
});
