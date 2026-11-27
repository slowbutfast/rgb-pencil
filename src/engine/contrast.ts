import { CONTRAST_CENTER } from '../types/pipeline';

export { CONTRAST_CENTER };

/**
 * Build a 256-entry sigmoidal S-curve lookup table centred on 0.46 luminance.
 * `boost <= 1.01` is an exact identity pass-through (the slider's 1.00x stop).
 */
export function buildContrastLUT(boost: number): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  if (!Number.isFinite(boost) || boost <= 1.01) {
    for (let value = 0; value < 256; value += 1) lut[value] = value;
    return lut;
  }

  const k = (boost - 1) * 5 + 1;
  const steepness = k * 2.4;
  const minS = 1 / (1 + Math.exp(CONTRAST_CENTER * steepness));
  const maxS = 1 / (1 + Math.exp(-(1 - CONTRAST_CENTER) * steepness));

  for (let value = 0; value < 256; value += 1) {
    const x = value / 255;
    const sig = 1 / (1 + Math.exp(-(x - CONTRAST_CENTER) * steepness));
    lut[value] = Math.round(((sig - minS) / (maxS - minS)) * 255);
  }
  return lut;
}
