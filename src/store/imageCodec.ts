import type { WorkingBitmap } from '../types/pipeline';

/** Supported thumbnail edge, in pixels. */
export const THUMB_MAX_EDGE = 64;

/**
 * The PNG boundary used by project storage. Browser builds use
 * `createBrowserPngCodec`; tests inject a deterministic lossless implementation
 * so the bit-exactness contract can be verified without a real canvas.
 */
export interface PngCodec {
  encode(image: WorkingBitmap): Promise<Blob>;
  decode(png: Blob): Promise<WorkingBitmap>;
  thumbnail(image: WorkingBitmap, maxEdge?: number): Promise<Blob>;
}

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type AnyContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function makeCanvas(width: number, height: number): AnyCanvas | null {
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(width, height);
    }
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      return canvas;
    }
  } catch {
    return null;
  }
  return null;
}

function context2d(canvas: AnyCanvas): AnyContext | null {
  try {
    return canvas.getContext('2d') as AnyContext | null;
  } catch {
    return null;
  }
}

function imageDataFor(data: Uint8ClampedArray, width: number, height: number): ImageData | null {
  try {
    if (typeof ImageData === 'function') {
      return new ImageData(new Uint8ClampedArray(data), width, height);
    }
  } catch {
    return null;
  }
  return null;
}

async function canvasToPng(canvas: AnyCanvas): Promise<Blob> {
  if ('convertToBlob' in canvas && typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type: 'image/png' });
  }
  const html = canvas as HTMLCanvasElement;
  return new Promise<Blob>((resolve, reject) => {
    try {
      html.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding produced no blob'))),
        'image/png',
      );
    } catch (error) {
      reject(error);
    }
  });
}

/** Area-average downscale used for project thumbnails. */
export function downscaleBitmap(image: WorkingBitmap, maxEdge: number): WorkingBitmap {
  const longest = Math.max(image.width, image.height);
  if (!(maxEdge > 0) || longest <= maxEdge) {
    return { width: image.width, height: image.height, data: image.data.slice() };
  }
  const scale = maxEdge / longest;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const out = new Uint8ClampedArray(width * height * 4);
  const scaleX = image.width / width;
  const scaleY = image.height / height;

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
          red += image.data[p]! * weight;
          green += image.data[p + 1]! * weight;
          blue += image.data[p + 2]! * weight;
          alpha += image.data[p + 3]! * weight;
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

async function decodeToCanvas(
  png: Blob,
): Promise<{ canvas: AnyCanvas; width: number; height: number }> {
  let width = 0;
  let height = 0;
  let drawable: CanvasImageSource | null = null;

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(png);
      width = bitmap.width;
      height = bitmap.height;
      drawable = bitmap;
    } catch {
      drawable = null;
    }
  }

  if (!drawable) {
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      throw new Error('Image decoding is unavailable in this environment');
    }
    let objectUrl: string | null = null;
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('Stored PNG could not be decoded'));
        if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
          objectUrl = URL.createObjectURL(png);
          element.src = objectUrl;
        } else {
          reject(new Error('Blob URLs are unavailable'));
        }
      });
      width = image.naturalWidth || image.width;
      height = image.naturalHeight || image.height;
      drawable = image;
    } finally {
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          /* already revoked */
        }
      }
    }
  }

  if (!(width > 0) || !(height > 0)) throw new Error('Stored PNG has no dimensions');
  const canvas = makeCanvas(width, height);
  const ctx = canvas ? context2d(canvas) : null;
  if (!canvas || !ctx) throw new Error('Canvas 2D is unavailable; cannot decode PNG');
  ctx.drawImage(drawable, 0, 0, width, height);
  return { canvas, width, height };
}

/** Canvas/`createImageBitmap` implementation used by the running app. */
export function createBrowserPngCodec(): PngCodec {
  const codec: PngCodec = {
    async encode(image) {
      const canvas = makeCanvas(image.width, image.height);
      const ctx = canvas ? context2d(canvas) : null;
      if (!canvas || !ctx) throw new Error('Canvas 2D is unavailable; cannot encode PNG');
      const imageData = imageDataFor(image.data, image.width, image.height);
      if (imageData) {
        ctx.putImageData(imageData, 0, 0);
      } else {
        const created = ctx.createImageData(image.width, image.height);
        created.data.set(image.data);
        ctx.putImageData(created, 0, 0);
      }
      return canvasToPng(canvas);
    },

    async decode(png) {
      const { canvas, width, height } = await decodeToCanvas(png);
      const ctx = context2d(canvas);
      if (!ctx) throw new Error('Canvas 2D is unavailable; cannot decode PNG');
      const data = ctx.getImageData(0, 0, width, height).data;
      return { width, height, data };
    },

    async thumbnail(image, maxEdge = THUMB_MAX_EDGE) {
      return codec.encode(downscaleBitmap(image, maxEdge));
    },
  };
  return codec;
}
