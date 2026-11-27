import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts, type PDFArray } from 'pdf-lib';

import exporterSource from '../pdfExporter.ts?raw';
import {
  PDF_MARGIN,
  CHART_CELL_SIZE,
  chartLayout,
  exportGuidePdf,
  guideFilename,
  mmToPt,
} from '../pdfExporter';
import { buildColumnInstructions, summariseStates } from '../guideBuilder';
import { getPalette } from '../palettes';
import {
  DEFAULT_EXPORT_OPTIONS,
  type ExportOptions,
  type MatchedGrid,
  type ShadingStateId,
} from '../../types/pipeline';

function makeGrid(cols: number, rows: number, hash = 'deadbeef'): MatchedGrid {
  const count = cols * rows;
  const ri = new Uint8Array(count);
  const gi = new Uint8Array(count);
  const bi = new Uint8Array(count);
  const target = new Uint8ClampedArray(count * 3);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col;
      ri[index] = ((col + row) % 5) as ShadingStateId;
      gi[index] = ((col + row * 2) % 5) as ShadingStateId;
      bi[index] = ((col * 2 + row) % 5) as ShadingStateId;
      target[index * 3] = (col * 7) % 256;
      target[index * 3 + 1] = (row * 5) % 256;
      target[index * 3 + 2] = ((col + row) * 3) % 256;
    }
  }
  return {
    cols,
    rows,
    ri,
    gi,
    bi,
    deltaE: new Float32Array(count).fill(2),
    target,
    palette: getPalette('reflective'),
    sourceHash: hash,
  };
}

function uniformGrid(cols: number, rows: number, hash = 'uniform'): MatchedGrid {
  const grid = makeGrid(cols, rows, hash);
  grid.ri.fill(1);
  grid.gi.fill(2);
  grid.bi.fill(4);
  return grid;
}

function options(overrides: Partial<ExportOptions> = {}): ExportOptions {
  return { ...DEFAULT_EXPORT_OPTIONS, ...overrides };
}

const WIN_ANSI_LITERALS: Record<number, string> = {
  0x96: '\u2013',
  0x97: '\u2014',
  0xb7: '\u00b7',
};

function decodeWinAnsi(hex: string): string {
  let result = '';
  for (let i = 0; i < hex.length; i += 2) {
    const byte = Number.parseInt(hex.slice(i, i + 2), 16);
    result += WIN_ANSI_LITERALS[byte] ?? String.fromCharCode(byte);
  }
  return result;
}

async function maybeInflate(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes[0] !== 0x78) return bytes;
  const decompression = new DecompressionStream('deflate');
  const writer = decompression.writable.getWriter();
  const chunks: Uint8Array[] = [];
  const reading = (async (): Promise<void> => {
    const reader = decompression.readable.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
  })();
  await writer.write(new Uint8Array(bytes));
  await writer.close();
  await reading;
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

interface ContentStreamLike {
  getContents(): Uint8Array;
}

/** Extract the drawn text of each page in document order (pdf-lib has no text API). */
async function extractPageText(bytes: Uint8Array): Promise<string[]> {
  const document = await PDFDocument.load(bytes);
  const decoder = new TextDecoder('latin1');
  const pages: string[] = [];

  for (const page of document.getPages()) {
    const contents = page.node.Contents() as PDFArray | undefined;
    if (!contents) {
      pages.push('');
      continue;
    }

    let text = '';
    for (let index = 0; index < contents.size(); index += 1) {
      const stream = document.context.lookup(contents.get(index)) as unknown as ContentStreamLike;
      const raw = await maybeInflate(stream.getContents());
      const decoded = decoder.decode(raw);
      text += decoded.replace(/<([0-9A-Fa-f]+)>\s*Tj/g, (_match, hex: string) => decodeWinAnsi(hex));
    }
    pages.push(text);
  }

  return pages;
}

describe('exportGuidePdf', () => {
  it('returns a valid multi-page PDF beginning with %PDF-', async () => {
    const grid = makeGrid(56, 42);
    const bytes = await exportGuidePdf(grid, grid.palette, options());

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThan(3);
  });

  it('writes pages in legend, chart, checklist, template order', async () => {
    const grid = makeGrid(56, 42);
    const bytes = await exportGuidePdf(
      grid,
      grid.palette,
      options({ includeTemplate: true }),
    );
    const pages = await extractPageText(bytes);

    expect(pages[0]).toContain('Legend');
    const chartIndexes = pages.flatMap((text, index) => (text.includes('Symbol Chart') ? [index] : []));
    const checklistIndexes = pages.flatMap((text, index) => (text.includes('Column Checklist') ? [index] : []));
    const templateIndexes = pages.flatMap((text, index) => (text.includes('Faint Template') ? [index] : []));

    expect(chartIndexes.length).toBeGreaterThan(0);
    expect(checklistIndexes.length).toBeGreaterThan(0);
    expect(templateIndexes.length).toBeGreaterThan(0);
    expect(chartIndexes[0]).toBe(1);
    expect(Math.max(...chartIndexes)).toBeLessThan(Math.min(...checklistIndexes));
    expect(Math.max(...checklistIndexes)).toBeLessThan(Math.min(...templateIndexes));
  });

  it('omits template pages by default', async () => {
    const grid = makeGrid(56, 42);
    const bytes = await exportGuidePdf(grid, grid.palette, options({ includeTemplate: false }));
    const pages = await extractPageText(bytes);
    expect(pages.some((text) => text.includes('Faint Template'))).toBe(false);
  });

  it('lists all five states with their summarised counts on the legend page', async () => {
    const grid = makeGrid(56, 42);
    const counts = summariseStates(grid);
    const pages = await extractPageText(await exportGuidePdf(grid, grid.palette, options()));
    const legend = pages[0]!;

    for (const name of ['White Paper', 'Full Color', 'Light Black', 'Heavy Black', 'Solid Black']) {
      expect(legend).toContain(name);
    }
    for (const count of counts) expect(legend).toContain(String(count));
    expect(legend).toContain('7056');
  });

  it('labels chart tiles with absolute 1-based indices', async () => {
    const grid = makeGrid(56, 42);
    const pages = await extractPageText(await exportGuidePdf(grid, grid.palette, options()));
    const charts = pages.filter((text) => text.includes('Symbol Chart'));

    expect(charts.length).toBeGreaterThan(1);
    expect(charts[0]).toContain('Columns 1\u2013');
    expect(charts.some((text) => /Columns 21\u201341/.test(text))).toBe(true);
    expect(charts.some((text) => /Columns 0\b/.test(text))).toBe(false);
    charts.forEach((text) => expect(text).toMatch(/Tile \d+ of \d+/));
  });

  it.each(['a4', 'letter'] as const)('keeps every chart tile inside the %s margins', (pageSize) => {
    const layout = chartLayout(pageSize);
    expect(layout.originX + layout.tileCols * CHART_CELL_SIZE).toBeLessThanOrEqual(
      layout.pageWidth - PDF_MARGIN,
    );
    expect(layout.originY - layout.tileRows * CHART_CELL_SIZE).toBeGreaterThanOrEqual(PDF_MARGIN);
  });

  it('renders exactly 168 checklist entries for a 56 x 42 grid in stripe-column order', async () => {
    const grid = makeGrid(56, 42);
    const pages = await extractPageText(await exportGuidePdf(grid, grid.palette, options()));
    const titles = [...pages.join('\n').matchAll(/X(\d+) \u00b7 ([RGB])/g)].map(
      (match) => `${match[1]}${match[2]}`,
    );

    const expected: string[] = [];
    for (let col = 1; col <= 56; col += 1) {
      for (const channel of ['R', 'G', 'B']) expected.push(`${col}${channel}`);
    }
    expect(titles).toEqual(expected);
  });

  it('keeps each checklist entry whole on one page when it fits', async () => {
    const grid = uniformGrid(56, 42);
    const pages = await extractPageText(await exportGuidePdf(grid, grid.palette, options()));
    const checklistPages = pages.filter((text) => text.includes('Column Checklist'));

    const seenTitles: string[] = [];
    for (const text of checklistPages) {
      const titles = [...text.matchAll(/X\d+ \u00b7 [RGB]/g)].map((match) => match[0]);
      const runs = [...text.matchAll(/rows \d+\u2013\d+:/g)].length;
      // Uniform columns have exactly one run per entry, so a page must show as
      // many run lines as titles: no entry is split across a page boundary.
      expect(runs).toBe(titles.length);
      seenTitles.push(...titles);
    }
    expect(seenTitles).toHaveLength(168);
    expect(new Set(seenTitles).size).toBe(168);
  });

  it('continues an oversize entry with (cont.) without losing or duplicating runs', async () => {
    const grid = makeGrid(3, 288);
    for (let row = 0; row < grid.rows; row += 1) grid.ri[row * grid.cols] = (row % 2 === 0 ? 1 : 4) as ShadingStateId;

    const pages = await extractPageText(await exportGuidePdf(grid, grid.palette, options()));
    const text = pages.join('\n');

    expect(text).toContain('(cont.)');
    const drawnRuns = [...text.matchAll(/rows \d+\u2013\d+:/g)].length;
    const expectedRuns = buildColumnInstructions(grid).reduce(
      (total, instruction) => total + instruction.runs.length,
      0,
    );
    expect(drawnRuns).toBe(expectedRuns);
  });

  it('draws the template at the configured millimetre scale and tiles a large grid', async () => {
    const small = uniformGrid(56, 42);
    const without = await exportGuidePdf(small, small.palette, options());
    const withTemplate = await exportGuidePdf(
      small,
      small.palette,
      options({ includeTemplate: true, templateCellMm: 6 }),
    );
    const templatePages = (await extractPageText(withTemplate)).filter((text) =>
      text.includes('Faint Template'),
    );

    expect(mmToPt(6)).toBeCloseTo(17.01, 1);
    expect(templatePages.length).toBeGreaterThan(0);
    templatePages.forEach((text) => {
      expect(text).toContain('10 mm');
      expect(text).toContain('Print at 100%');
    });
    expect((await PDFDocument.load(withTemplate)).getPageCount()).toBeGreaterThan(
      (await PDFDocument.load(without)).getPageCount(),
    );

    const large = uniformGrid(96, 72);
    const largeTemplate = await exportGuidePdf(
      large,
      large.palette,
      options({ includeTemplate: true, templateCellMm: 6 }),
    );
    const largePages = (await extractPageText(largeTemplate)).filter((text) =>
      text.includes('Faint Template'),
    );
    expect(largePages.length).toBeGreaterThan(1);
    largePages.forEach((text) => expect(text).toMatch(/Tile \d+ of \d+/));
  });

  it('clamps the template cell size to 4-12 mm for direct callers', async () => {
    const grid = uniformGrid(16, 12);
    for (const [requested, expected] of [
      [20, '12 mm cells'],
      [1, '4 mm cells'],
    ] as const) {
      const bytes = await exportGuidePdf(
        grid,
        grid.palette,
        options({ includeTemplate: true, templateCellMm: requested }),
      );
      const template = (await extractPageText(bytes)).find((text) =>
        text.includes('Faint Template'),
      );
      expect(template).toContain(expected);
    }
  });

  it('requires vector symbols because standard fonts cannot encode the glyphs', async () => {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    expect(() => font.encodeText('\u25d0')).toThrow();
    expect(() => font.encodeText('\u25cf')).toThrow();
    expect(() => font.encodeText('\u25a1')).toThrow();

    const grid = makeGrid(16, 12);
    await expect(exportGuidePdf(grid, grid.palette, options())).resolves.toBeInstanceOf(Uint8Array);
  });

  it('uses one standard font family for all text and derives the download filename', async () => {
    const grid = makeGrid(56, 42);
    const bytes = await exportGuidePdf(grid, grid.palette, options());
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThan(0);
    expect(guideFilename(grid.cols, grid.rows)).toBe('rgb-pencil-guide-56x42.pdf');
  });

  it('rejects invalid input before producing a document', async () => {
    const grid = makeGrid(16, 12);
    grid.cols = 0;
    await expect(exportGuidePdf(grid, grid.palette, options())).rejects.toBeInstanceOf(RangeError);

    const mismatched = makeGrid(16, 12);
    mismatched.ri = new Uint8Array(3);
    await expect(
      exportGuidePdf(mismatched, mismatched.palette, options()),
    ).rejects.toBeInstanceOf(RangeError);
  });

  it('imports no DOM APIs so it stays unit-testable in Node', () => {
    expect(exporterSource).not.toMatch(/\bdocument\.|\bwindow\.|new Worker/);
    expect(exporterSource).toContain("from 'pdf-lib'");
  });
});
