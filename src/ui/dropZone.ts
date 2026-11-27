import type { SourceImage } from '../types/pipeline';
import type { GridStore } from '../store/gridStore';

/** Longest edge kept when extracting pixels; keeps the local pipeline snappy. */
const MAX_SOURCE_EDGE = 512;

function intrinsicSize(element: HTMLImageElement | HTMLCanvasElement): { width: number; height: number } {
  if ('naturalWidth' in element) {
    return { width: element.naturalWidth, height: element.naturalHeight };
  }
  return { width: element.width, height: element.height };
}

/**
 * Draw an image or canvas onto an offscreen canvas at a bounded resolution and
 * extract its RGBA pixels for the engine.
 */
export function readImageElement(
  element: HTMLImageElement | HTMLCanvasElement,
): SourceImage | null {
  const { width, height } = intrinsicSize(element);
  if (!width || !height) return null;

  const scale = Math.min(1, MAX_SOURCE_EDGE / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Composite transparency over white paper.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(element, 0, 0, targetWidth, targetHeight);

  const data = ctx.getImageData(0, 0, targetWidth, targetHeight).data;
  return { width: targetWidth, height: targetHeight, data };
}

/** Read a dropped/selected file. Non-image files resolve to `null`. */
export async function readImageFile(file: File): Promise<SourceImage | null> {
  if (!file.type.startsWith('image/')) return null;

  const dataUrl = await new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
  if (!dataUrl) return null;

  const image = await new Promise<HTMLImageElement | null>((resolve) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => resolve(null);
    element.src = dataUrl;
  });
  if (!image) return null;

  return readImageElement(image);
}

/**
 * Full-canvas drag and drop. Dropping a non-image file is ignored without
 * touching the current grid.
 */
export function mountDropZone(root: HTMLElement, store: GridStore): () => void {
  const stage = root.querySelector<HTMLElement>('[data-ui="stage"]');
  if (!stage) throw new Error('Missing [data-ui="stage"] element');

  const onDragOver = (event: DragEvent): void => {
    event.preventDefault();
    stage.classList.add('dragover');
  };

  const onDragLeave = (): void => {
    stage.classList.remove('dragover');
  };

  const onDrop = (event: DragEvent): void => {
    event.preventDefault();
    stage.classList.remove('dragover');
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    void readImageFile(file).then((image) => {
      if (!image) return;
      root.querySelectorAll<HTMLElement>('[data-ui="sample"]').forEach((chip) => {
        chip.classList.remove('active');
      });
      void store.loadImage(image);
    });
  };

  stage.addEventListener('dragover', onDragOver);
  stage.addEventListener('dragleave', onDragLeave);
  stage.addEventListener('drop', onDrop);

  return () => {
    stage.removeEventListener('dragover', onDragOver);
    stage.removeEventListener('dragleave', onDragLeave);
    stage.removeEventListener('drop', onDrop);
  };
}
