import {
  PALETTE_KEYS,
  type PaletteKey,
  type WorkingBitmap,
} from '../types/pipeline';
import {
  completedByteLength,
  decodeCompleted,
  encodeCompleted,
} from './completedCodec';
import type { PngCodec } from './imageCodec';
import {
  MAX_NAME_LENGTH,
  createProjectRecord,
  sanitizeName,
  uniqueProjectName,
  type CreateProjectInput,
} from './projectManager';
import type { ProjectRecord, StoredSettings } from './projectDb';

export const PROJECT_FILE_FORMAT = 'rgb-pencil-project';
export const PROJECT_FILE_VERSION = 1;
export const MAX_PROJECT_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_BITMAP_EDGE = 1024;
export const BACKUP_NUDGE_THRESHOLD = 50;
export const MIN_CONTRAST = 1;
export const MAX_CONTRAST = 2.3;

export interface ProjectFileBitmap {
  width: number;
  height: number;
  png: string;
}

/** Serialised `.rgbpencil.json` payload. */
export interface ProjectFilePayload {
  format: typeof PROJECT_FILE_FORMAT;
  version: number;
  name: string;
  createdAt: number;
  updatedAt: number;
  pipelineVersion: number;
  settings: StoredSettings;
  cols: number;
  rows: number;
  sourceHash: string;
  completed: string;
  bitmap: ProjectFileBitmap;
}

export interface ParsedProjectFile {
  project: ProjectRecord;
  image: { width: number; height: number; png: Blob };
  bitmap: WorkingBitmap;
  completed: ReadonlySet<string>;
}

export type ImportResult =
  | {
      ok: true;
      project: ProjectRecord;
      image: { width: number; height: number; png: Blob };
      bitmap: WorkingBitmap;
      completed: ReadonlySet<string>;
    }
  | { ok: false; message: string };

export interface FileSource {
  size: number;
  text(): Promise<string>;
}

export interface ParseOptions {
  id: string;
  now: number;
  existingNames: readonly string[];
}

export function projectFileName(name: string): string {
  const safe = name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, MAX_NAME_LENGTH);
  return `${safe || 'project'}.rgbpencil.json`;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/** Assemble the backup payload from the live project state. */
export async function buildProjectFile(input: {
  record: ProjectRecord;
  bitmap: WorkingBitmap;
  png: Blob;
}): Promise<ProjectFilePayload> {
  const { record, bitmap, png } = input;
  return {
    format: PROJECT_FILE_FORMAT,
    version: PROJECT_FILE_VERSION,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    pipelineVersion: record.pipelineVersion,
    settings: { ...record.settings },
    cols: record.cols,
    rows: record.rows,
    sourceHash: record.sourceHash,
    completed: bytesToBase64(
      record.completedBits.length > 0
        ? record.completedBits
        : encodeCompleted(new Set<string>(), record.cols, record.rows),
    ),
    bitmap: {
      width: bitmap.width,
      height: bitmap.height,
      png: bytesToBase64(await blobBytes(png)),
    },
  };
}

export function serializeProjectFile(payload: ProjectFilePayload): string {
  return JSON.stringify(payload);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPalette(value: unknown): value is PaletteKey {
  return typeof value === 'string' && (PALETTE_KEYS as readonly string[]).includes(value);
}

/**
 * Validate an untrusted project file structurally and decode it. Nothing from
 * the file is executed, inserted as markup, or written to storage here.
 */
export async function parseProjectFile(
  source: FileSource,
  codec: PngCodec,
  options: ParseOptions,
): Promise<ImportResult> {
  if (source.size > MAX_PROJECT_FILE_BYTES) {
    return { ok: false, message: 'Project file is larger than 8 MB.' };
  }

  let text: string;
  try {
    text = await source.text();
  } catch {
    return { ok: false, message: 'The selected file could not be read.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: 'The selected file is not valid JSON.' };
  }
  if (!isRecord(parsed)) {
    return { ok: false, message: 'The selected file is not valid JSON.' };
  }

  if (parsed.format !== PROJECT_FILE_FORMAT) {
    return { ok: false, message: 'The file is not an RGB Pencil project (wrong format).' };
  }
  if (!isInteger(parsed.version) || parsed.version < 1) {
    return { ok: false, message: 'The project file has an invalid version.' };
  }
  if (parsed.version > PROJECT_FILE_VERSION) {
    return {
      ok: false,
      message: 'This project file was created by a newer version; update the application.',
    };
  }

  const cols = parsed.cols;
  if (!isInteger(cols) || cols < 16 || cols > 96) {
    return { ok: false, message: 'Project columns must be an integer between 16 and 96.' };
  }
  const rows = parsed.rows;
  if (!isInteger(rows) || rows < 1 || rows > 512) {
    return { ok: false, message: 'Project rows must be an integer between 1 and 512.' };
  }

  const settings = parsed.settings;
  if (!isRecord(settings)) {
    return { ok: false, message: 'Project settings are missing or malformed.' };
  }
  const contrast = settings.contrast;
  if (!isFiniteNumber(contrast) || contrast < MIN_CONTRAST || contrast > MAX_CONTRAST) {
    return { ok: false, message: 'Contrast must be between 1.0 and 2.3.' };
  }
  const ditherStrength = settings.ditherStrength;
  if (!isFiniteNumber(ditherStrength) || ditherStrength < 0 || ditherStrength > 1) {
    return { ok: false, message: 'Dither strength must be between 0 and 1.' };
  }
  if (!isPalette(settings.paletteId)) {
    return { ok: false, message: 'Unknown pencil palette.' };
  }
  if (settings.cols !== cols) {
    return { ok: false, message: 'Project settings do not match the grid width.' };
  }
  if (typeof settings.dither !== 'boolean') {
    return { ok: false, message: 'Project dither flag is invalid.' };
  }
  if (typeof parsed.sourceHash !== 'string') {
    return { ok: false, message: 'Project source hash is missing.' };
  }
  if (typeof parsed.completed !== 'string') {
    return { ok: false, message: 'The completed-cell bitset is missing.' };
  }

  let completedBits: Uint8Array;
  try {
    completedBits = base64ToBytes(parsed.completed);
  } catch {
    return { ok: false, message: 'The completed-cell bitset is not valid base64.' };
  }
  if (completedBits.length !== completedByteLength(cols, rows)) {
    return { ok: false, message: 'The completed-cell bitset length does not match the grid.' };
  }

  const bitmap = parsed.bitmap;
  if (!isRecord(bitmap)) {
    return { ok: false, message: 'The bitmap is missing.' };
  }
  const width = bitmap.width;
  const height = bitmap.height;
  if (!isInteger(width) || !isInteger(height) || width < 1 || height < 1) {
    return { ok: false, message: 'The bitmap dimensions are invalid.' };
  }
  if (Math.max(width, height) > MAX_BITMAP_EDGE) {
    return { ok: false, message: "The bitmap's longest edge must be 1024 px or less." };
  }
  if (typeof bitmap.png !== 'string' || bitmap.png.length === 0) {
    return { ok: false, message: 'The bitmap PNG is missing.' };
  }

  let pngBytes: Uint8Array;
  try {
    pngBytes = base64ToBytes(bitmap.png);
  } catch {
    return { ok: false, message: 'The bitmap PNG is not valid base64.' };
  }
  const png = new Blob([pngBytes as unknown as BlobPart], { type: 'image/png' });

  let decoded: WorkingBitmap;
  try {
    decoded = await codec.decode(png);
  } catch {
    return { ok: false, message: 'The bitmap data is not a decodable PNG.' };
  }
  if (!(decoded.width > 0) || !(decoded.height > 0)) {
    return { ok: false, message: 'The bitmap data is not a decodable PNG.' };
  }
  if (Math.max(decoded.width, decoded.height) > MAX_BITMAP_EDGE) {
    return { ok: false, message: "The bitmap's longest edge must be 1024 px or less." };
  }
  if (decoded.width !== width || decoded.height !== height) {
    return { ok: false, message: 'The bitmap dimensions do not match the PNG.' };
  }

  const rawName = typeof parsed.name === 'string' ? sanitizeName(parsed.name) : '';
  const name = uniqueProjectName(rawName || 'Imported project', options.existingNames);
  const createdAt = isFiniteNumber(parsed.createdAt) ? parsed.createdAt : options.now;
  const pipelineVersion = isInteger(parsed.pipelineVersion) ? parsed.pipelineVersion : 0;

  const input: CreateProjectInput = {
    id: options.id,
    name,
    now: options.now,
    createdAt,
    pipelineVersion,
    sourceHash: parsed.sourceHash,
    cols,
    rows,
    settings: {
      cols,
      contrast,
      dither: typeof settings.dither === 'boolean' ? settings.dither : true,
      ditherStrength,
      palette: settings.paletteId,
    },
    completed: decodeCompleted(completedBits, cols, rows),
  };

  // Reuse the same record builder as the live store.
  const project = createProjectRecord(input);

  return {
    ok: true,
    project,
    image: { width: decoded.width, height: decoded.height, png },
    bitmap: decoded,
    completed: input.completed,
  };
}

/** One quiet backup suggestion at 50 cells until exported or dismissed. */
export function shouldShowBackupNudge(
  doneCount: number,
  exported: boolean,
  dismissed: boolean,
): boolean {
  return doneCount >= BACKUP_NUDGE_THRESHOLD && !exported && !dismissed;
}
