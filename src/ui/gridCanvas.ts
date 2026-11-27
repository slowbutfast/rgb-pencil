import { cellKey, type CellCoord, type PointerType, type Rgb } from '../types/pipeline';
import type { GridStore, GridStoreState } from '../store/gridStore';

const AXIS_PAD_LEFT = 34;
const AXIS_PAD_TOP = 28;

interface CanvasTheme {
  axisLabel: string;
  axisLabelActive: string;
  tick: string;
  tickMajor: string;
  tickActive: string;
  gridLine: string;
  gridLineMajor: string;
  border: string;
  hoverInner: string;
  hoverOuter: string;
  hatch: string;
}

function readToken(element: Element, name: string, fallback: string): string {
  try {
    const value = getComputedStyle(element).getPropertyValue(name).trim();
    return value || fallback;
  } catch {
    return fallback;
  }
}

function readTheme(element: Element): CanvasTheme {
  return {
    axisLabel: readToken(element, '--canvas-axis-label', '#a3a3a3'),
    axisLabelActive: readToken(element, '--canvas-axis-label-active', '#171717'),
    tick: readToken(element, '--canvas-tick', '#e5e5e5'),
    tickMajor: readToken(element, '--canvas-tick-major', '#c4c4c4'),
    tickActive: readToken(element, '--canvas-tick-active', '#171717'),
    gridLine: readToken(element, '--canvas-grid-line', 'rgba(255, 255, 255, 0.2)'),
    gridLineMajor: readToken(element, '--canvas-grid-line-major', 'rgba(255, 255, 255, 0.45)'),
    border: readToken(element, '--canvas-border', '#171717'),
    hoverInner: readToken(element, '--canvas-hover-inner', '#ffffff'),
    hoverOuter: readToken(element, '--canvas-hover-outer', '#171717'),
    hatch: readToken(element, '--canvas-hatch', 'rgba(255, 255, 255, 0.42)'),
  };
}

function cssRgb([r, g, b]: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}

function desaturate(rgb: Rgb): string {
  const lum = Math.round(0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]);
  const gray = Math.round(lum * 0.42 + 132);
  return `rgb(${gray}, ${gray}, ${gray})`;
}

/**
 * HiDPI pixel-grid canvas: crisp lines, adaptive axis ticks, crosshair cursor,
 * double-stroke hover ring, desaturated + hatched completed cells, and
 * click/drag-to-paint. Redraws are coalesced into a single rAF per frame.
 */
export function mountGridCanvas(root: HTMLElement, store: GridStore): () => void {
  const canvas = root.querySelector<HTMLCanvasElement>('[data-ui="grid-canvas"]');
  if (!canvas) throw new Error('Missing [data-ui="grid-canvas"] element');

  const stage =
    root.querySelector<HTMLElement>('[data-ui="stage"]') ??
    canvas.closest<HTMLElement>('.stage') ??
    root;

  const ctx = canvas.getContext('2d');
  const theme = readTheme(canvas);
  const surface: HTMLCanvasElement = canvas;
  surface.style.touchAction = 'none';

  let state: GridStoreState = store.getState();
  let frame: number | null = null;
  let pointerDown = false;
  let dragPaintDone = true;
  let lastPointerType: PointerType = 'mouse';
  let cellSize = 14;
  let cssWidth = 0;
  let cssHeight = 0;

  const requestFrame = (callback: FrameRequestCallback): number =>
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(callback)
      : (setTimeout(() => callback(Date.now()), 0) as unknown as number);

  const cancelFrame = (handle: number): void => {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
    else clearTimeout(handle);
  };

  function scheduleDraw(): void {
    if (frame !== null) return;
    frame = requestFrame(() => {
      frame = null;
      draw();
    });
  }

  function fit(): void {
    const grid = state.grid;
    if (!grid) return;

    const stageRect = stage.getBoundingClientRect();
    const maxWidth = Math.max(280, stageRect.width - 72);
    // Banners sit in the stage flow above the grid; reserve their measured
    // height (plus a small gap) so the canvas shrinks instead of colliding.
    const bannerStack = stage.querySelector<HTMLElement>('[data-ui="banner-stack"]');
    const bannerHeight = bannerStack ? bannerStack.getBoundingClientRect().height : 0;
    const bannerReserve = bannerHeight > 0 ? bannerHeight + 12 : 0;
    const maxHeight = Math.max(240, stageRect.height - 124 - bannerReserve);
    const cellByWidth = Math.floor((maxWidth - AXIS_PAD_LEFT) / grid.cols);
    const cellByHeight = Math.floor((maxHeight - AXIS_PAD_TOP) / grid.rows);
    cellSize = Math.max(4, Math.min(28, cellByWidth, cellByHeight));

    cssWidth = AXIS_PAD_LEFT + grid.cols * cellSize + 2;
    cssHeight = AXIS_PAD_TOP + grid.rows * cellSize + 2;

    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;

    surface.style.width = `${cssWidth}px`;
    surface.style.height = `${cssHeight}px`;
    surface.width = Math.round(cssWidth * dpr);
    surface.height = Math.round(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawAxes(grid: { cols: number; rows: number }, hovered: CellCoord | null): void {
    if (!ctx) return;
    const labelStep = cellSize < 12 ? 5 : cellSize < 18 ? 2 : 1;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let x = 0; x < grid.cols; x += 1) {
      const isHovered = hovered !== null && hovered.col === x;
      const cx = AXIS_PAD_LEFT + x * cellSize + cellSize / 2;
      const isMajor = (x + 1) % labelStep === 0 || x === 0;
      if (isHovered || isMajor) {
        if (!isHovered && hovered && Math.abs(hovered.col - x) <= 1 && cellSize < 14) {
          // suppress a colliding neighbour label
        } else {
          ctx.fillStyle = isHovered ? theme.axisLabelActive : theme.axisLabel;
          ctx.font = isHovered
            ? '700 10px "JetBrains Mono", monospace'
            : '500 9px "JetBrains Mono", monospace';
          ctx.fillText(String(x + 1), cx, AXIS_PAD_TOP - 12);
        }
      }
      ctx.strokeStyle = isHovered
        ? theme.tickActive
        : isMajor
          ? theme.tickMajor
          : theme.tick;
      ctx.lineWidth = isHovered ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(cx, AXIS_PAD_TOP - (isMajor || isHovered ? 5 : 3));
      ctx.lineTo(cx, AXIS_PAD_TOP);
      ctx.stroke();
    }

    ctx.textAlign = 'right';
    for (let y = 0; y < grid.rows; y += 1) {
      const isHovered = hovered !== null && hovered.row === y;
      const cy = AXIS_PAD_TOP + y * cellSize + cellSize / 2;
      const isMajor = (y + 1) % labelStep === 0 || y === 0;
      if (isHovered || isMajor) {
        if (!isHovered && hovered && Math.abs(hovered.row - y) <= 1 && cellSize < 14) {
          // suppress a colliding neighbour label
        } else {
          ctx.fillStyle = isHovered ? theme.axisLabelActive : theme.axisLabel;
          ctx.font = isHovered
            ? '700 10px "JetBrains Mono", monospace'
            : '500 9px "JetBrains Mono", monospace';
          ctx.fillText(String(y + 1), AXIS_PAD_LEFT - 9, cy);
        }
      }
      ctx.strokeStyle = isHovered
        ? theme.tickActive
        : isMajor
          ? theme.tickMajor
          : theme.tick;
      ctx.lineWidth = isHovered ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(AXIS_PAD_LEFT - (isMajor || isHovered ? 5 : 3), cy);
      ctx.lineTo(AXIS_PAD_LEFT, cy);
      ctx.stroke();
    }
  }

  function drawCell(cellIndex: number, rgb: Rgb, x: number, y: number, isDone: boolean): void {
    if (!ctx) return;
    const px = AXIS_PAD_LEFT + x * cellSize;
    const py = AXIS_PAD_TOP + y * cellSize;
    const grid = state.grid!;

    if (state.viewMode === 'grid') {
      ctx.fillStyle = isDone ? desaturate(rgb) : cssRgb(rgb);
      ctx.fillRect(px, py, cellSize, cellSize);
    } else {
      const stripeWidth = cellSize / 3;
      const palette = grid.palette;
      const stripes: ReadonlyArray<readonly [Rgb, number]> = [
        [palette.R[grid.ri[cellIndex]!]!, 0],
        [palette.G[grid.gi[cellIndex]!]!, 1],
        [palette.B[grid.bi[cellIndex]!]!, 2],
      ];
      for (const [stripRgb, index] of stripes) {
        ctx.fillStyle = isDone ? desaturate(stripRgb) : cssRgb(stripRgb);
        ctx.fillRect(px + stripeWidth * index, py, stripeWidth, cellSize);
      }
    }

    if (isDone) {
      ctx.strokeStyle = theme.hatch;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + 1.5, py + cellSize - 1.5);
      ctx.lineTo(px + cellSize - 1.5, py + 1.5);
      ctx.stroke();
    }
  }

  function draw(): void {
    const grid = state.grid;
    if (!ctx || !grid) return;

    ctx.clearRect(0, 0, cssWidth, cssHeight);
    drawAxes(grid, state.hoveredCell);

    for (let y = 0; y < grid.rows; y += 1) {
      for (let x = 0; x < grid.cols; x += 1) {
        const index = y * grid.cols + x;
        const rgb: Rgb = [grid.target[index * 3]!, grid.target[index * 3 + 1]!, grid.target[index * 3 + 2]!];
        drawCell(index, rgb, x, y, state.completedCells.has(cellKey(x, y)));
      }
    }

    // Crisp 1px grid lines
    ctx.strokeStyle = theme.gridLine;
    ctx.lineWidth = 1;
    for (let x = 0; x <= grid.cols; x += 1) {
      const gx = AXIS_PAD_LEFT + x * cellSize + 0.5;
      ctx.beginPath();
      ctx.moveTo(gx, AXIS_PAD_TOP);
      ctx.lineTo(gx, AXIS_PAD_TOP + grid.rows * cellSize);
      ctx.stroke();
    }
    for (let y = 0; y <= grid.rows; y += 1) {
      const gy = AXIS_PAD_TOP + y * cellSize + 0.5;
      ctx.beginPath();
      ctx.moveTo(AXIS_PAD_LEFT, gy);
      ctx.lineTo(AXIS_PAD_LEFT + grid.cols * cellSize, gy);
      ctx.stroke();
    }

    // Major 5-cell reference lines
    ctx.strokeStyle = theme.gridLineMajor;
    ctx.lineWidth = 1;
    for (let x = 5; x < grid.cols; x += 5) {
      const gx = AXIS_PAD_LEFT + x * cellSize + 0.5;
      ctx.beginPath();
      ctx.moveTo(gx, AXIS_PAD_TOP);
      ctx.lineTo(gx, AXIS_PAD_TOP + grid.rows * cellSize);
      ctx.stroke();
    }
    for (let y = 5; y < grid.rows; y += 5) {
      const gy = AXIS_PAD_TOP + y * cellSize + 0.5;
      ctx.beginPath();
      ctx.moveTo(AXIS_PAD_LEFT, gy);
      ctx.lineTo(AXIS_PAD_LEFT + grid.cols * cellSize, gy);
      ctx.stroke();
    }

    // Outer border
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1.25;
    ctx.strokeRect(AXIS_PAD_LEFT + 0.5, AXIS_PAD_TOP + 0.5, grid.cols * cellSize, grid.rows * cellSize);

    // Active hover ring (double stroke)
    const hovered = state.hoveredCell;
    if (hovered) {
      const hx = AXIS_PAD_LEFT + hovered.col * cellSize;
      const hy = AXIS_PAD_TOP + hovered.row * cellSize;
      ctx.strokeStyle = theme.hoverInner;
      ctx.lineWidth = 2;
      ctx.strokeRect(hx + 0.5, hy + 0.5, cellSize - 1, cellSize - 1);
      ctx.strokeStyle = theme.hoverOuter;
      ctx.lineWidth = 1;
      ctx.strokeRect(hx - 0.5, hy - 0.5, cellSize + 1, cellSize + 1);
    }
  }

  function cellFromPointer(event: PointerEvent): CellCoord | null {
    const grid = state.grid;
    if (!grid) return null;
    const rect = surface.getBoundingClientRect();
    const x = event.clientX - rect.left - AXIS_PAD_LEFT;
    const y = event.clientY - rect.top - AXIS_PAD_TOP;
    const col = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);
    if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return null;
    return { col, row };
  }

  function pointerTypeOf(event: PointerEvent): PointerType {
    if (event.pointerType === 'touch') return 'touch';
    if (event.pointerType === 'pen') return 'pen';
    return 'mouse';
  }

  function onPointerMove(event: PointerEvent): void {
    const type = pointerTypeOf(event);
    lastPointerType = type;
    store.setLastPointerType(type);
    const hit = cellFromPointer(event);
    surface.style.cursor = hit ? 'crosshair' : 'default';
    if (!hit) {
      store.setHovered(null);
      return;
    }
    if (pointerDown && type !== 'touch' && !state.readOnly) {
      const key = cellKey(hit.col, hit.row);
      if (state.completedCells.has(key) !== dragPaintDone) {
        store.paintCell(hit.col, hit.row, dragPaintDone);
      }
    }
    store.setHovered(hit);
  }

  function onPointerDown(event: PointerEvent): void {
    const type = pointerTypeOf(event);
    lastPointerType = type;
    store.setLastPointerType(type);
    const hit = cellFromPointer(event);
    if (!hit) return;

    if (type === 'touch' || state.readOnly) {
      // Touch inspects only; read-only tabs ignore completion entirely.
      pointerDown = false;
      store.setHovered(hit);
      return;
    }

    pointerDown = true;
    dragPaintDone = !state.completedCells.has(cellKey(hit.col, hit.row));
    store.paintCell(hit.col, hit.row, dragPaintDone);
    store.setHovered(hit);
  }

  function onPointerLeave(event: PointerEvent): void {
    pointerDown = false;
    const type = pointerTypeOf(event);
    if (event.pointerType) {
      lastPointerType = type;
      store.setLastPointerType(type);
    }

    // A touch tap emits pointerout/pointerleave immediately after pointerup.
    // Keep the inspected cell so the sidebar readout and hover ring stay
    // visible; the next mouse/pen interaction resumes normal clearing.
    if (lastPointerType === 'touch') return;

    store.setHovered(null);
    surface.style.cursor = 'default';
  }

  function onPointerUp(event: PointerEvent): void {
    const type = pointerTypeOf(event);
    if (event.pointerType) {
      lastPointerType = type;
      store.setLastPointerType(type);
    }
    pointerDown = false;
  }

  function onResize(): void {
    fit();
    scheduleDraw();
  }

  const unsubscribe = store.subscribe((next) => {
    const previousGrid = state.grid;
    state = next;
    if (next.grid && (previousGrid !== next.grid || cssWidth === 0)) fit();
    scheduleDraw();
  });

  surface.addEventListener('pointermove', onPointerMove);
  surface.addEventListener('pointerdown', onPointerDown);
  surface.addEventListener('pointerleave', onPointerLeave);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('resize', onResize);

  let observer: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(onResize);
    observer.observe(stage);
  }

  fit();
  draw();

  return () => {
    unsubscribe();
    surface.removeEventListener('pointermove', onPointerMove);
    surface.removeEventListener('pointerdown', onPointerDown);
    surface.removeEventListener('pointerleave', onPointerLeave);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('resize', onResize);
    observer?.disconnect();
    if (frame !== null) cancelFrame(frame);
    frame = null;
  };
}
