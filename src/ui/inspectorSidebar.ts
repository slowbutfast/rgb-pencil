import {
  cellKey,
  SHADING_STATES,
  type Rgb,
  type ShadingSeries,
  type ShadingStateId,
} from '../types/pipeline';
import type { GridStore, GridStoreState } from '../store/gridStore';

function cssRgb([r, g, b]: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}

function element<T extends HTMLElement>(root: HTMLElement, name: string): T {
  const found = root.querySelector<T>(`[data-ui="${name}"]`);
  if (!found) throw new Error(`Missing [data-ui="${name}"] element`);
  return found;
}

function stripeColor(series: ShadingSeries, state: ShadingStateId): Rgb {
  return series[state];
}
/**
 * Unobstructed 256px right-hand inspector. All text is written with
 * `textContent`; the three stripe bars and comparison swatches are painted
 * through `style.background`.
 */
export function mountInspectorSidebar(root: HTMLElement, store: GridStore): () => void {
  const emptyState = element(root, 'empty-state');
  const active = element(root, 'inspector-active');
  const coord = element(root, 'coord');
  const status = element(root, 'status');
  const barR = element(root, 'bar-r');
  const barG = element(root, 'bar-g');
  const barB = element(root, 'bar-b');
  const swatchTarget = element(root, 'swatch-target');
  const swatchMix = element(root, 'swatch-mix');
  const labelR = element(root, 'label-r');
  const labelG = element(root, 'label-g');
  const labelB = element(root, 'label-b');
  const subR = element(root, 'sub-r');
  const subG = element(root, 'sub-g');
  const subB = element(root, 'sub-b');
  const hint = element(root, 'hint');
  const delta = element(root, 'delta');

  function render(state: GridStoreState): void {
    const { grid, hoveredCell } = state;
    if (!grid || !hoveredCell) {
      emptyState.style.display = '';
      active.classList.remove('visible');
      return;
    }

    const { col, row } = hoveredCell;
    const cell = grid.cells[row * grid.cols + col];
    if (!cell) {
      emptyState.style.display = '';
      active.classList.remove('visible');
      return;
    }

    emptyState.style.display = 'none';
    active.classList.add('visible');

    coord.textContent = `X${col + 1}, Y${row + 1}`;

    const done = state.completedCells.has(cellKey(col, row));
    status.textContent = done ? 'Completed' : 'To Do';
    status.className = done ? 'status-pill done' : 'status-pill';

    barR.style.background = cssRgb(stripeColor(grid.palette.R, cell.ri));
    barG.style.background = cssRgb(stripeColor(grid.palette.G, cell.gi));
    barB.style.background = cssRgb(stripeColor(grid.palette.B, cell.bi));

    swatchTarget.style.background = cssRgb(cell.rgb);
    swatchMix.style.background = cssRgb(cell.srgb);

    const stateR = SHADING_STATES[cell.ri];
    const stateG = SHADING_STATES[cell.gi];
    const stateB = SHADING_STATES[cell.bi];

    labelR.textContent = stateR.name;
    labelG.textContent = stateG.name;
    labelB.textContent = stateB.name;
    subR.textContent = `${stateR.symbol} Red Stripe`;
    subG.textContent = `${stateG.symbol} Green Stripe`;
    subB.textContent = `${stateB.symbol} Blue Stripe`;

    hint.textContent = done ? 'Click cell to undo' : 'Click cell to mark done';
    delta.textContent = `ΔE ${cell.deltaE.toFixed(1)}`;
  }

  const unsubscribe = store.subscribe(render);
  render(store.getState());

  return unsubscribe;
}
