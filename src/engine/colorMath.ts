import {
  DARK_BORDER_RATIO,
  type ComboLUTEntry,
  type Lab,
  type PencilPalette,
  type Rgb,
  type ShadingStateId,
} from '../types/pipeline';

export type { Lab } from '../types/pipeline';

/**
 * IEC 61966-2-1 sRGB transfer function (8-bit input to linear light 0-1).
 */
export function srgbToLinear(value: number): number {
  const c = Math.max(0, Math.min(255, value)) / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Inverse sRGB transfer function (linear light 0-1 to rounded 8-bit sRGB).
 */
export function linearToSrgb(linear: number): number {
  const c = Math.max(0, Math.min(1, linear));
  const s = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(s * 255);
}

/**
 * Linear-light RGB to CIE L*a*b* (D65 white point, CIE 1976).
 */
export function linearRgbToLab(r: number, g: number, b: number): Lab {
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Squared CIELAB ΔE76 distance. */
export function deltaE76Squared(a: Lab, b: Lab): number {
  const dL = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return dL * dL + da * da + db * db;
}

/**
 * Precompute all 125 optical averages (5 x 5 x 5 stripe combinations) for a
 * palette. Each stripe contributes equally to the optical mix; the dark border
 * separating stripe triplets contributes `borderRatio` of the reflected light.
 * Averaging happens in linear RGB before conversion to CIELAB.
 */
export function buildComboLUT(
  palette: PencilPalette,
  borderRatio: number = DARK_BORDER_RATIO,
): ComboLUTEntry[] {
  const borderLin = palette.border.map(srgbToLinear) as unknown as Rgb;
  const rLin = palette.R.map((rgb) => rgb.map(srgbToLinear) as unknown as Rgb);
  const gLin = palette.G.map((rgb) => rgb.map(srgbToLinear) as unknown as Rgb);
  const bLin = palette.B.map((rgb) => rgb.map(srgbToLinear) as unknown as Rgb);
  const stripeShare = (1 - borderRatio) / 3;

  const combos: ComboLUTEntry[] = [];
  for (let ri = 0; ri < 5; ri += 1) {
    for (let gi = 0; gi < 5; gi += 1) {
      for (let bi = 0; bi < 5; bi += 1) {
        const lr =
          stripeShare * (rLin[ri]![0] + gLin[gi]![0] + bLin[bi]![0]) +
          borderRatio * borderLin[0];
        const lg =
          stripeShare * (rLin[ri]![1] + gLin[gi]![1] + bLin[bi]![1]) +
          borderRatio * borderLin[1];
        const lb =
          stripeShare * (rLin[ri]![2] + gLin[gi]![2] + bLin[bi]![2]) +
          borderRatio * borderLin[2];
        combos.push({
          ri: ri as ShadingStateId,
          gi: gi as ShadingStateId,
          bi: bi as ShadingStateId,
          lin: [lr, lg, lb],
          srgb: [linearToSrgb(lr), linearToSrgb(lg), linearToSrgb(lb)],
          lab: linearRgbToLab(lr, lg, lb),
        });
      }
    }
  }
  return combos;
}
