import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

import { PIPELINE_VERSION } from './pipeline';
import { buildColumnInstructions, paginateChart, summariseStates } from './guideBuilder';
import {
  SHADING_STATES,
  type ColumnInstruction,
  type ExportOptions,
  type MatchedGrid,
  type PageSize,
  type PencilPalette,
  type RleRun,
  type ShadingStateId,
} from '../types/pipeline';

export const PAGE_DIMENSIONS: Record<PageSize, { width: number; height: number }> = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
};

export const PDF_MARGIN = 36;
export const CHART_CELL_SIZE = 24;
export const CHART_INDEX_GUTTER = 18;
export const CHART_HEADER_HEIGHT = 36;
const CHECKLIST_RUN_HEIGHT = 10;
const CHECKLIST_TITLE_HEIGHT = 14;
const CHECKLIST_ENTRY_GAP = 6;
const CHECKLIST_HEADER_HEIGHT = 22;

const INK = rgb(0.09, 0.09, 0.09);
const MUTED = rgb(0.35, 0.35, 0.35);
const LIGHT_LINE = rgb(0.86, 0.86, 0.86);
const MID_LINE = rgb(0.63, 0.63, 0.63);
const DARK = rgb(0.05, 0.05, 0.05);
const WHITE = rgb(1, 1, 1);

export function mmToPt(mm: number): number {
  return (mm * 72) / 25.4;
}

export function guideFilename(cols: number, rows: number): string {
  return `rgb-pencil-guide-${cols}x${rows}.pdf`;
}

export interface ChartLayout {
  pageWidth: number;
  pageHeight: number;
  margin: number;
  tileCols: number;
  tileRows: number;
  originX: number;
  originY: number;
}

/** Printable chart geometry for one page size. */
export function chartLayout(pageSize: PageSize): ChartLayout {
  const { width, height } = PAGE_DIMENSIONS[pageSize];
  const printWidth = width - PDF_MARGIN * 2;
  const printHeight = height - PDF_MARGIN * 2;
  const tileCols = Math.max(
    2,
    Math.floor((printWidth - CHART_INDEX_GUTTER) / CHART_CELL_SIZE),
  );
  const tileRows = Math.max(
    2,
    Math.floor((printHeight - CHART_HEADER_HEIGHT - CHART_INDEX_GUTTER) / CHART_CELL_SIZE),
  );
  return {
    pageWidth: width,
    pageHeight: height,
    margin: PDF_MARGIN,
    tileCols,
    tileRows,
    originX: PDF_MARGIN + CHART_INDEX_GUTTER,
    originY: height - PDF_MARGIN - CHART_HEADER_HEIGHT - CHART_INDEX_GUTTER,
  };
}

function assertGrid(grid: MatchedGrid): void {
  const count = grid.cols * grid.rows;
  if (
    !Number.isInteger(grid.cols) ||
    !Number.isInteger(grid.rows) ||
    grid.cols < 1 ||
    grid.rows < 1
  ) {
    throw new RangeError(`Invalid grid size ${grid.cols}x${grid.rows}`);
  }
  if (
    grid.ri.length !== count ||
    grid.gi.length !== count ||
    grid.bi.length !== count ||
    grid.deltaE.length !== count ||
    grid.target.length !== count * 3
  ) {
    throw new RangeError('Matched grid arrays do not match cols x rows');
  }
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Draw the five shading symbols as vector paths: empty square, filled circle,
 * half-filled circle, three-quarter-filled circle, filled square. No font
 * glyph coverage is required.
 */
function drawSymbol(page: PDFPage, state: ShadingStateId, cx: number, cy: number, size: number): void {
  const radius = size / 2;
  const left = cx - radius;
  const bottom = cy - radius;

  switch (state) {
    case 0:
      page.drawRectangle({
        x: left,
        y: bottom,
        width: size,
        height: size,
        color: WHITE,
        borderColor: INK,
        borderWidth: 0.8,
      });
      return;
    case 1:
      page.drawCircle({ x: cx, y: cy, size: radius, color: INK });
      return;
    case 2:
      page.drawCircle({ x: cx, y: cy, size: radius, color: INK });
      page.drawRectangle({
        x: cx,
        y: bottom,
        width: radius,
        height: size,
        color: WHITE,
      });
      page.drawCircle({ x: cx, y: cy, size: radius, borderColor: INK, borderWidth: 0.8 });
      return;
    case 3:
      page.drawCircle({ x: cx, y: cy, size: radius, color: INK });
      page.drawRectangle({
        x: left,
        y: cy,
        width: radius,
        height: radius,
        color: WHITE,
      });
      page.drawCircle({ x: cx, y: cy, size: radius, borderColor: INK, borderWidth: 0.8 });
      return;
    case 4:
      page.drawRectangle({
        x: left,
        y: bottom,
        width: size,
        height: size,
        color: INK,
      });
      return;
    default:
      return;
  }
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size = 9,
  color = MUTED,
): void {
  page.drawText(text, { x, y, size, font, color });
}

function centredText(
  page: PDFPage,
  text: string,
  centerX: number,
  y: number,
  font: PDFFont,
  size: number,
  color = MUTED,
): void {
  const width = font.widthOfTextAtSize(text, size);
  drawText(page, text, centerX - width / 2, y, font, size, color);
}

function drawLegendPage(
  page: PDFPage,
  grid: MatchedGrid,
  palette: PencilPalette,
  font: PDFFont,
  bold: PDFFont,
  pageHeight: number,
): void {
  const left = PDF_MARGIN;
  let y = pageHeight - PDF_MARGIN - 22;

  drawText(page, 'RGB Pencil Guide', left, y, bold, 20, INK);
  y -= 22;
  drawText(
    page,
    `${grid.cols} \u00d7 ${grid.rows} cells \u00b7 ${grid.cols * 3} stripe columns \u00b7 ${palette.label}`,
    left,
    y,
    font,
    10,
    MUTED,
  );
  y -= 16;
  drawText(page, `Pipeline v${PIPELINE_VERSION}`, left, y, font, 8, MUTED);

  y -= 34;
  drawText(page, 'Legend \u00b7 stripe segments by shading state', left, y, bold, 12, INK);
  y -= 20;

  const counts = summariseStates(grid);
  for (const state of SHADING_STATES) {
    drawSymbol(page, state.id, left + 10, y + 3, 12);
    drawText(page, state.name, left + 28, y, bold, 10, INK);
    drawText(page, state.legend, left + 150, y, font, 9, MUTED);
    const count = counts[state.id];
    drawText(page, `${count} stripes`, left + 360, y, font, 9, MUTED);
    y -= 22;
  }

  y -= 8;
  const total = counts.reduce((sum, count) => sum + count, 0);
  drawText(page, `Total: ${total} stripe segments`, left, y, bold, 10, INK);
  y -= 24;

  drawText(
    page,
    'Each grid cell is three adjacent stripe columns (R, G, B). Mark one checkbox',
    left,
    y,
    font,
    9,
    MUTED,
  );
  y -= 13;
  drawText(
    page,
    'per run on the checklist, then draw top to bottom in the printed symbol chart.',
    left,
    y,
    font,
    9,
    MUTED,
  );
}

function drawChartPage(
  page: PDFPage,
  grid: MatchedGrid,
  tile: { colStart: number; colEnd: number; rowStart: number; rowEnd: number },
  index: number,
  total: number,
  layout: ChartLayout,
  font: PDFFont,
  bold: PDFFont,
): void {
  const { pageHeight } = layout;
  drawText(
    page,
    `Symbol Chart \u00b7 Tile ${index + 1} of ${total}`,
    PDF_MARGIN,
    pageHeight - PDF_MARGIN - 14,
    bold,
    11,
    INK,
  );
  drawText(
    page,
    `Columns ${tile.colStart + 1}\u2013${tile.colEnd + 1} \u00b7 Rows ${tile.rowStart + 1}\u2013${tile.rowEnd + 1} \u00b7 R G B`,
    PDF_MARGIN,
    pageHeight - PDF_MARGIN - 28,
    font,
    8,
    MUTED,
  );

  const { originX, originY } = layout;

  for (let col = tile.colStart; col <= tile.colEnd; col += 1) {
    const cellX = originX + (col - tile.colStart) * CHART_CELL_SIZE;
    centredText(page, String(col + 1), cellX + CHART_CELL_SIZE / 2, originY + 4, font, 6, MUTED);
  }

  for (let row = tile.rowStart; row <= tile.rowEnd; row += 1) {
    const cellY = originY - (row - tile.rowStart + 1) * CHART_CELL_SIZE;
    const label = String(row + 1);
    const labelWidth = font.widthOfTextAtSize(label, 6);
    drawText(page, label, PDF_MARGIN + CHART_INDEX_GUTTER - labelWidth - 3, cellY + 9, font, 6, MUTED);

    for (let col = tile.colStart; col <= tile.colEnd; col += 1) {
      const index2 = row * grid.cols + col;
      const cellX = originX + (col - tile.colStart) * CHART_CELL_SIZE;
      const emphasis = (col + 1) % 5 === 0 || (row + 1) % 5 === 0;
      page.drawRectangle({
        x: cellX,
        y: cellY,
        width: CHART_CELL_SIZE,
        height: CHART_CELL_SIZE,
        borderColor: emphasis ? MID_LINE : LIGHT_LINE,
        borderWidth: emphasis ? 0.6 : 0.25,
      });

      const symbolY = cellY + CHART_CELL_SIZE / 2;
      drawSymbol(page, grid.ri[index2] as ShadingStateId, cellX + 4, symbolY, 5);
      drawSymbol(page, grid.gi[index2] as ShadingStateId, cellX + 12, symbolY, 5);
      drawSymbol(page, grid.bi[index2] as ShadingStateId, cellX + 20, symbolY, 5);
    }
  }
}

interface ChecklistPlanEntry {
  instructionIndex: number;
  runs: RleRun[];
  continued: boolean;
  column: 0 | 1;
  yTop: number;
}

function planChecklist(
  instructions: readonly ColumnInstruction[],
  contentTop: number,
  contentBottom: number,
): ChecklistPlanEntry[][] {
  const pages: ChecklistPlanEntry[][] = [[]];
  let column: 0 | 1 = 0;
  let y = contentTop;

  const newPage = (): void => {
    pages.push([]);
    column = 0;
    y = contentTop;
  };

  const ensure = (height: number): void => {
    if (y - height >= contentBottom) return;
    if (column === 0) {
      column = 1;
      y = contentTop;
      return;
    }
    newPage();
  };

  const capacity = contentTop - contentBottom;

  for (let instructionIndex = 0; instructionIndex < instructions.length; instructionIndex += 1) {
    const runs = instructions[instructionIndex]!.runs;
    const entryHeight = CHECKLIST_TITLE_HEIGHT + runs.length * CHECKLIST_RUN_HEIGHT + CHECKLIST_ENTRY_GAP;

    if (entryHeight <= capacity) {
      ensure(entryHeight);
      pages[pages.length - 1]!.push({ instructionIndex, runs, continued: false, column, yTop: y });
      y -= entryHeight;
      continue;
    }

    const perChunk = Math.max(
      1,
      Math.floor((capacity - CHECKLIST_TITLE_HEIGHT - CHECKLIST_ENTRY_GAP) / CHECKLIST_RUN_HEIGHT),
    );
    for (let start = 0; start < runs.length; start += perChunk) {
      const chunk = runs.slice(start, start + perChunk);
      const height = CHECKLIST_TITLE_HEIGHT + chunk.length * CHECKLIST_RUN_HEIGHT + CHECKLIST_ENTRY_GAP;
      ensure(height);
      pages[pages.length - 1]!.push({
        instructionIndex,
        runs: chunk,
        continued: start > 0,
        column,
        yTop: y,
      });
      y -= height;
    }
  }

  return pages.filter((page) => page.length > 0);
}

function drawChecklistPage(
  page: PDFPage,
  plan: ChecklistPlanEntry[],
  instructions: readonly ColumnInstruction[],
  index: number,
  total: number,
  font: PDFFont,
  bold: PDFFont,
  pageWidth: number,
  pageHeight: number,
): void {
  drawText(
    page,
    `Column Checklist \u00b7 Page ${index + 1} of ${total}`,
    PDF_MARGIN,
    pageHeight - PDF_MARGIN - 14,
    bold,
    11,
    INK,
  );

  const columnWidth = (pageWidth - PDF_MARGIN * 2) / 2;

  for (const entry of plan) {
    const instruction = instructions[entry.instructionIndex]!;
    const x = PDF_MARGIN + entry.column * columnWidth;
    let y = entry.yTop;

    drawText(
      page,
      `X${instruction.logicalColumn + 1} \u00b7 ${instruction.channel}${entry.continued ? ' (cont.)' : ''}`,
      x,
      y,
      bold,
      9,
      INK,
    );
    y -= CHECKLIST_TITLE_HEIGHT;

    for (const run of entry.runs) {
      page.drawRectangle({
        x: x + 1,
        y: y + 1,
        width: 6,
        height: 6,
        color: WHITE,
        borderColor: MID_LINE,
        borderWidth: 0.6,
      });
      drawSymbol(page, run.state, x + 15, y + 4, 5);
      drawText(
        page,
        `rows ${run.startRow + 1}\u2013${run.startRow + run.length}: ${SHADING_STATES[run.state].name}`,
        x + 24,
        y,
        font,
        8,
        MUTED,
      );
      y -= CHECKLIST_RUN_HEIGHT;
    }
  }
}

function drawRegistrationMarks(page: PDFPage, x: number, y: number, width: number, height: number): void {
  const marks: Array<[number, number]> = [
    [x, y],
    [x + width, y],
    [x, y + height],
    [x + width, y + height],
  ];
  for (const [cx, cy] of marks) {
    page.drawLine({
      start: { x: cx - 7, y: cy },
      end: { x: cx + 7, y: cy },
      thickness: 0.5,
      color: DARK,
    });
    page.drawLine({
      start: { x: cx, y: cy - 7 },
      end: { x: cx, y: cy + 7 },
      thickness: 0.5,
      color: DARK,
    });
  }
}

function drawTemplatePage(
  page: PDFPage,
  tile: { colStart: number; colEnd: number; rowStart: number; rowEnd: number },
  index: number,
  total: number,
  cellMm: number,
  pageHeight: number,
  font: PDFFont,
  bold: PDFFont,
): void {
  const cellPt = mmToPt(cellMm);
  const tileCols = tile.colEnd - tile.colStart + 1;
  const tileRows = tile.rowEnd - tile.rowStart + 1;
  const tileWidth = tileCols * cellPt;
  const tileHeight = tileRows * cellPt;
  const originX = PDF_MARGIN;
  const originY = pageHeight - PDF_MARGIN - 46 - tileHeight;

  drawText(
    page,
    `Faint Template \u00b7 Tile ${index + 1} of ${total}`,
    PDF_MARGIN,
    pageHeight - PDF_MARGIN - 14,
    bold,
    11,
    INK,
  );
  drawText(
    page,
    `Columns ${tile.colStart + 1}\u2013${tile.colEnd + 1} \u00b7 Rows ${tile.rowStart + 1}\u2013${tile.rowEnd + 1} \u00b7 ${cellMm} mm cells`,
    PDF_MARGIN,
    pageHeight - PDF_MARGIN - 28,
    font,
    8,
    MUTED,
  );

  // One logical cell = three equal stripe columns.
  for (let col = 0; col <= tileCols; col += 1) {
    const logical = tile.colStart + col;
    const emphasis = col === 0 || col === tileCols || (logical + 1) % 5 === 0;
    const x = originX + col * cellPt;
    page.drawLine({
      start: { x, y: originY },
      end: { x, y: originY + tileHeight },
      thickness: emphasis ? 0.5 : 0.2,
      color: emphasis ? MID_LINE : LIGHT_LINE,
    });
    if (col < tileCols) {
      for (const third of [1, 2]) {
        const sx = x + (cellPt * third) / 3;
        page.drawLine({
          start: { x: sx, y: originY },
          end: { x: sx, y: originY + tileHeight },
          thickness: 0.15,
          color: LIGHT_LINE,
        });
      }
    }
  }

  for (let row = 0; row <= tileRows; row += 1) {
    const emphasis = row === 0 || row === tileRows || (tile.rowStart + row + 1) % 5 === 0;
    const y = originY + row * cellPt;
    page.drawLine({
      start: { x: originX, y },
      end: { x: originX + tileWidth, y },
      thickness: emphasis ? 0.5 : 0.2,
      color: emphasis ? MID_LINE : LIGHT_LINE,
    });
  }

  page.drawRectangle({
    x: originX,
    y: originY,
    width: tileWidth,
    height: tileHeight,
    borderColor: DARK,
    borderWidth: 1,
  });
  drawRegistrationMarks(page, originX, originY, tileWidth, tileHeight);

  // 10 mm calibration bar.
  const barY = PDF_MARGIN + 20;
  const barLength = mmToPt(10);
  page.drawLine({
    start: { x: PDF_MARGIN, y: barY },
    end: { x: PDF_MARGIN + barLength, y: barY },
    thickness: 1.2,
    color: DARK,
  });
  for (const x of [PDF_MARGIN, PDF_MARGIN + barLength]) {
    page.drawLine({
      start: { x, y: barY - 3 },
      end: { x, y: barY + 3 },
      thickness: 1,
      color: DARK,
    });
  }
  drawText(page, '10 mm', PDF_MARGIN + barLength + 6, barY - 3, bold, 8, INK);
  drawText(
    page,
    `Print at 100% / Actual size. 1 grid square = ${cellMm} mm \u00d7 ${cellMm} mm; measure the 10 mm bar to confirm scale.`,
    PDF_MARGIN,
    PDF_MARGIN + 6,
    font,
    7,
    MUTED,
  );
}

/**
 * Build the complete printable guide as PDF bytes. Async with a macrotask
 * yield between pages so a large export never blocks the UI for its full
 * duration. Contains no DOM access; the download helper lives in the UI layer.
 */
export async function exportGuidePdf(
  grid: MatchedGrid,
  palette: PencilPalette,
  options: ExportOptions,
): Promise<Uint8Array> {
  assertGrid(grid);

  const pageSize = options.pageSize === 'letter' ? 'letter' : 'a4';
  const includeTemplate = options.includeTemplate === true;
  const requestedCellMm = Number.isFinite(options.templateCellMm) ? options.templateCellMm : 6;
  const templateCellMm = Math.min(12, Math.max(4, requestedCellMm));

  const { width, height } = PAGE_DIMENSIONS[pageSize];
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const legendPage = pdf.addPage([width, height]);
  drawLegendPage(legendPage, grid, palette, font, bold, height);
  await yieldToEventLoop();

  const layout = chartLayout(pageSize);
  const tiles = paginateChart(grid.cols, grid.rows, layout.tileCols, layout.tileRows);
  for (let index = 0; index < tiles.length; index += 1) {
    const page = pdf.addPage([width, height]);
    drawChartPage(page, grid, tiles[index]!, index, tiles.length, layout, font, bold);
    await yieldToEventLoop();
  }

  const instructions = buildColumnInstructions(grid);
  const contentTop = height - PDF_MARGIN - CHECKLIST_HEADER_HEIGHT - 8;
  const plan = planChecklist(instructions, contentTop, PDF_MARGIN);
  for (let index = 0; index < plan.length; index += 1) {
    const page = pdf.addPage([width, height]);
    drawChecklistPage(
      page,
      plan[index]!,
      instructions,
      index,
      plan.length,
      font,
      bold,
      width,
      height,
    );
    await yieldToEventLoop();
  }

  if (includeTemplate) {
    const printWidth = width - PDF_MARGIN * 2;
    const printHeight = height - PDF_MARGIN * 2;
    const cellPt = mmToPt(templateCellMm);
    const tileCols = Math.max(2, Math.floor(printWidth / cellPt));
    const tileRows = Math.max(2, Math.floor((printHeight - 80) / cellPt));
    const templateTiles = paginateChart(grid.cols, grid.rows, tileCols, tileRows);
    for (let index = 0; index < templateTiles.length; index += 1) {
      const page = pdf.addPage([width, height]);
      drawTemplatePage(
        page,
        templateTiles[index]!,
        index,
        templateTiles.length,
        templateCellMm,
        height,
        font,
        bold,
      );
      await yieldToEventLoop();
    }
  }

  return pdf.save();
}
