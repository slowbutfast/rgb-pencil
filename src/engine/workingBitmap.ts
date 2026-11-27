import type { SourceImage, WorkingBitmap } from '../types/pipeline';

/** Longest edge kept for the bitmap sent to the worker. */
export const MAX_WORKING_EDGE = 512;

function assertSource(image: SourceImage): void {
  if (
    !Number.isInteger(image.width) ||
    !Number.isInteger(image.height) ||
    image.width <= 0 ||
    image.height <= 0
  ) {
    throw new RangeError(`Invalid source dimensions ${image.width}x${image.height}`);
  }
  if (image.data.length < image.width * image.height * 4) {
    throw new RangeError('Source pixel buffer is shorter than its dimensions');
  }
}

/**
 * Bound an RGBA source to `maxEdge` on its longest side with an area-average
 * (box) filter. Called once when an image is loaded; every pipeline run reuses
 * the result, so a full-resolution photo is never re-sent per slider tick.
 */
export function prepareWorkingBitmap(
  image: SourceImage,
  maxEdge: number = MAX_WORKING_EDGE,
): WorkingBitmap {
  assertSource(image);
  if (!Number.isFinite(maxEdge) || maxEdge < 1) {
    throw new RangeError(`maxEdge must be a positive number (received ${maxEdge})`);
  }

  const longest = Math.max(image.width, image.height);
  if (longest <= maxEdge) {
    return {
      width: image.width,
      height: image.height,
      data: image.data.slice(0, image.width * image.height * 4),
    };
  }

  const scale = maxEdge / longest;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const out = new Uint8ClampedArray(width * height * 4);
  const scaleX = image.width / width;
  const scaleY = image.height / height;
  const source = image.data;

  for (let row = 0; row < height; row += 1) {
    const y0 = row * scaleY;
    const y1 = y0 + scaleY;
    const iy0 = Math.floor(y0);
    const iy1 = Math.min(image.height, Math.ceil(y1));

    for (let col = 0; col < width; col += 1) {
      const x0 = col * scaleX;
      const x1 = x0 + scaleX;
      const ix0 = Math.floor(x0);
      const ix1 = Math.min(image.width, Math.ceil(x1));

      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      let total = 0;

      for (let sy = iy0; sy < iy1; sy += 1) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        if (wy <= 0) continue;
        for (let sx = ix0; sx < ix1; sx += 1) {
          const wx = Math.min(x1, sx + 1) - Math.max(x0, sx);
          if (wx <= 0) continue;
          const weight = wx * wy;
          const p = (sy * image.width + sx) * 4;
          red += source[p]! * weight;
          green += source[p + 1]! * weight;
          blue += source[p + 2]! * weight;
          alpha += source[p + 3]! * weight;
          total += weight;
        }
      }

      const index = (row * width + col) * 4;
      out[index] = total > 0 ? red / total : 0;
      out[index + 1] = total > 0 ? green / total : 0;
      out[index + 2] = total > 0 ? blue / total : 0;
      out[index + 3] = total > 0 ? alpha / total : 255;
    }
  }

  return { width, height, data: out };
}
