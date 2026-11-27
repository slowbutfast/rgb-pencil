import { converter } from 'culori';

import {
  DARK_BORDER_RATIO,
  type ComboLUTEntry,
  type Lab,
  type PencilPalette,
  type Rgb,
  type ShadingStateId,
} from '../types/pipeline';

export type { Lab } from '../types/pipeline';

const toLab65 = converter('lab65');

/**
 * `culori`-backed linear-RGB → CIELAB conversion (D65 white point). Used only
 * while building the 125-entry LUT, never in the per-pixel loop.
 */
export function linearRgbToLabCulori(r: number, g: number, b: number): Lab {
  const converted = toLab65({ mode: 'lrgb', r, g, b });
  if (!converted) throw new RangeError('culori could not convert the colour');
  return [converted.l, converted.a, converted.b];
}

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

const TWENTY_FIVE_TO_SEVEN = Math.pow(25, 7);
const RADIANS = Math.PI / 180;

function hueAngle(a: number, b: number): number {
  if (a === 0 && b === 0) return 0;
  const degrees = Math.atan2(b, a) / RADIANS;
  return degrees >= 0 ? degrees : degrees + 360;
}

/**
 * CIEDE2000 ΔE00 on raw L*a*b* numbers. Exported separately from
 * `deltaE2000` so the matcher's 125-combo search can scan its flat Lab table
 * without allocating a tuple per candidate.
 */
export function deltaE2000Raw(
  l1: number,
  a1: number,
  b1: number,
  l2: number,
  a2: number,
  b2: number,
): number {
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const cBar = (c1 + c2) / 2;
  const cBar7 = Math.pow(cBar, 7);
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + TWENTY_FIVE_TO_SEVEN)));

  const a1p = (1 + g) * a1;
  const a2p = (1 + g) * a2;
  const c1p = Math.hypot(a1p, b1);
  const c2p = Math.hypot(a2p, b2);
  const h1p = hueAngle(a1p, b1);
  const h2p = hueAngle(a2p, b2);

  const dLp = l2 - l1;
  const dCp = c2p - c1p;
  let dhp = 0;
  if (c1p * c2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin((dhp * RADIANS) / 2);

  const lBar = (l1 + l2) / 2;
  const cBarP = (c1p + c2p) / 2;
  let hBarP: number;
  if (c1p * c2p === 0) {
    hBarP = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    hBarP = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    hBarP = (h1p + h2p + 360) / 2;
  } else {
    hBarP = (h1p + h2p - 360) / 2;
  }

  const t =
    1 -
    0.17 * Math.cos((hBarP - 30) * RADIANS) +
    0.24 * Math.cos(2 * hBarP * RADIANS) +
    0.32 * Math.cos((3 * hBarP + 6) * RADIANS) -
    0.2 * Math.cos((4 * hBarP - 63) * RADIANS);

  const dTheta = 30 * Math.exp(-Math.pow((hBarP - 275) / 25, 2));
  const cBarP7 = Math.pow(cBarP, 7);
  const rC = 2 * Math.sqrt(cBarP7 / (cBarP7 + TWENTY_FIVE_TO_SEVEN));
  const lBarDelta = lBar - 50;
  const sL = 1 + (0.015 * lBarDelta * lBarDelta) / Math.sqrt(20 + lBarDelta * lBarDelta);
  const sC = 1 + 0.045 * cBarP;
  const sH = 1 + 0.015 * cBarP * t;
  const rT = -Math.sin(2 * dTheta * RADIANS) * rC;

  const lTerm = dLp / sL;
  const cTerm = dCp / sC;
  const hTerm = dHp / sH;
  return Math.sqrt(lTerm * lTerm + cTerm * cTerm + hTerm * hTerm + rT * cTerm * hTerm);
}

/** CIEDE2000 colour difference between two CIELAB colours. */
export function deltaE2000(a: Lab, b: Lab): number {
  return deltaE2000Raw(a[0], a[1], a[2], b[0], b[1], b[2]);
}

/**
 * Inverse of `linearRgbToLab` (CIE 1976, D65, same primaries). Values outside
 * the sRGB gamut come back outside `[0, 1]`; callers clamp.
 */
export function labToLinearRgb(l: number, a: number, b: number): Rgb {
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inverse = (t: number): number => {
    const cube = t * t * t;
    return cube > 0.008856 ? cube : (t - 16 / 116) / 7.787;
  };
  const x = inverse(fx) * 0.95047;
  const y = inverse(fy);
  const z = inverse(fz) * 1.08883;
  return [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ];
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
        const srgb: Rgb = [linearToSrgb(lr), linearToSrgb(lg), linearToSrgb(lb)];
        combos.push({
          ri: ri as ShadingStateId,
          gi: gi as ShadingStateId,
          bi: bi as ShadingStateId,
          lin: [lr, lg, lb],
          srgb,
          lab: linearRgbToLabCulori(lr, lg, lb),
        });
      }
    }
  }
  return combos;
}

/**
 * Flatten a combo LUT into the `Float32Array` of `L* a* b*` triples the
 * matcher's hot loop scans. Index matches `ri * 25 + gi * 5 + bi`.
 */
export function buildLabTable(lut: readonly ComboLUTEntry[]): Float32Array {
  const table = new Float32Array(lut.length * 3);
  for (let i = 0; i < lut.length; i += 1) {
    const lab = lut[i]!.lab;
    table[i * 3] = lab[0];
    table[i * 3 + 1] = lab[1];
    table[i * 3 + 2] = lab[2];
  }
  return table;
}
