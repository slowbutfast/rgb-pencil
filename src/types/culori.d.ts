/**
 * Minimal ambient types for `culori` 4.x, which ships JavaScript without
 * declarations. Only the converter API used to build/cross-check the LUT is
 * declared here.
 */
declare module 'culori' {
  export interface CuloriColor {
    mode: string;
  }

  export interface CuloriRgb extends CuloriColor {
    mode: 'rgb' | 'lrgb';
    r: number;
    g: number;
    b: number;
  }

  export interface CuloriLab extends CuloriColor {
    l: number;
    a: number;
    b: number;
  }

  export function converter(mode: string): (color: CuloriColor | CuloriRgb) => CuloriLab | undefined;
}
