import { MAX_COLS, MIN_COLS, type PipelineSettings } from '../types/pipeline';
import { countCompletedBits, encodeCompleted } from './completedCodec';
import type { ProjectRecord, StoredSettings } from './projectDb';

export const MAX_NAME_LENGTH = 60;
export const FALLBACK_PROJECT_NAME = 'Untitled';

/** Trim and cap a user-provided name; the store rejects an empty result. */
export function sanitizeName(raw: string): string {
  return raw.trim().slice(0, MAX_NAME_LENGTH);
}

/** File name without its final extension, used as the default project name. */
export function projectNameFromFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return sanitizeName(stem) || FALLBACK_PROJECT_NAME;
}

/** Append ` (2)`, ` (3)`, … until the name is unused, staying within 60 chars. */
export function uniqueProjectName(base: string, existing: readonly string[]): string {
  const wanted = sanitizeName(base) || FALLBACK_PROJECT_NAME;
  const taken = new Set(existing);
  if (!taken.has(wanted)) return wanted;

  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const tail = ` (${suffix})`;
    const candidate = `${wanted.slice(0, MAX_NAME_LENGTH - tail.length)}${tail}`;
    if (!taken.has(candidate)) return candidate;
  }
  return wanted;
}

export function toStoredSettings(settings: PipelineSettings): StoredSettings {
  return {
    cols: settings.cols,
    contrast: settings.contrast,
    dither: settings.dither,
    ditherStrength: settings.ditherStrength,
    paletteId: settings.palette,
  };
}

export function fromStoredSettings(settings: StoredSettings): PipelineSettings {
  return {
    cols: settings.cols,
    contrast: settings.contrast,
    dither: settings.dither,
    ditherStrength: settings.ditherStrength,
    palette: settings.paletteId,
  };
}

export interface CreateProjectInput {
  id: string;
  name: string;
  now: number;
  createdAt?: number;
  pipelineVersion: number;
  sourceHash: string;
  cols: number;
  rows: number;
  settings: PipelineSettings;
  completed: ReadonlySet<string>;
}

/** Build the persisted metadata record, packing cells at the boundary. */
export function createProjectRecord(input: CreateProjectInput): ProjectRecord {
  const cols = Math.min(MAX_COLS, Math.max(MIN_COLS, Math.trunc(input.cols)));
  const completedBits = encodeCompleted(input.completed, cols, input.rows);
  return {
    id: input.id,
    name: sanitizeName(input.name) || FALLBACK_PROJECT_NAME,
    createdAt: input.createdAt ?? input.now,
    updatedAt: input.now,
    schemaVersion: 1,
    pipelineVersion: input.pipelineVersion,
    sourceHash: input.sourceHash,
    cols,
    rows: input.rows,
    settings: toStoredSettings(input.settings),
    completedBits,
    // The persisted count must match what the bitset can actually represent.
    doneCount: countCompletedBits(completedBits, cols, input.rows),
  };
}
