// @vitest-environment node
import { indexedDB } from 'fake-indexeddb';

import { downscaleBitmap, type PngCodec } from '../imageCodec';
import {
  openProjectDatabase,
  type ProjectDatabase,
  type ProjectImageRecord,
  type ProjectRecord,
  type ProjectSummary,
  type WriteResult,
  type LoadResult,
} from '../projectDb';
import type { WorkingBitmap } from '../../types/pipeline';
import type { StorageLike } from '../legacyMigration';
import type { ProjectChannel, ProjectChannelMessage } from '../projectLock';

/** Deterministic opaque RGBA bitmap with a smooth gradient. */
export function sampleBitmap(width = 32, height = 24, seed = 0): WorkingBitmap {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = (i * 3 + seed) % 256;
    data[i * 4 + 1] = (i * 5 + seed * 2) % 256;
    data[i * 4 + 2] = (i * 7 + seed * 3) % 256;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

/**
 * The test codec's "PNG" keeps the real signature and IHDR chunk so import
 * validation can read dimensions from the header, followed by raw RGBA.
 */
const FAKE_PNG_HEADER_BYTES = 33;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function toBytes(image: WorkingBitmap): Uint8Array {
  const header = new Uint8Array(FAKE_PNG_HEADER_BYTES);
  header.set(PNG_SIGNATURE, 0);
  const view = new DataView(header.buffer);
  view.setUint32(8, 13);
  header.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, image.width);
  view.setUint32(20, image.height);
  header[24] = 8;
  header[25] = 6;
  view.setUint32(29, 0);
  const bytes = new Uint8Array(header.length + image.data.length);
  bytes.set(header, 0);
  bytes.set(image.data, header.length);
  return bytes;
}

export function bytesToBitmap(bytes: Uint8Array): WorkingBitmap {
  if (bytes.length < FAKE_PNG_HEADER_BYTES) throw new Error('Undecodable PNG');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width <= 0 || height <= 0) throw new Error('Undecodable PNG');
  const data = bytes.slice(FAKE_PNG_HEADER_BYTES);
  if (data.length !== width * height * 4) throw new Error('Undecodable PNG');
  return { width, height, data: new Uint8ClampedArray(data) };
}

/**
 * Lossless in-memory codec used by tests. Its "PNG" is a header + raw RGBA,
 * which is enough to prove the storage boundary preserves bytes bit-exactly
 * while the browser implementation owns the real canvas PNG encoding.
 */
export function losslessCodec(): PngCodec {
  const codec: PngCodec = {
    async encode(image) {
      return new Blob([toBytes(image) as unknown as BlobPart], { type: 'image/png' });
    },
    async decode(png) {
      return bytesToBitmap(new Uint8Array(await png.arrayBuffer()));
    },
    async thumbnail(image, maxEdge = 64) {
      return codec.encode(downscaleBitmap(image, maxEdge));
    },
  };
  return codec;
}

export async function openTestDb(
  name: string,
  persistStorage?: () => Promise<boolean>,
): Promise<ProjectDatabase> {
  const opened = await openProjectDatabase({ factory: indexedDB, dbName: name, persistStorage });
  if (!opened.ok) throw new Error(opened.message);
  return opened.db;
}

export function testImageRecord(projectId: string, png: Blob): ProjectImageRecord {
  return { projectId, width: 32, height: 24, png, thumb: png };
}

export class MemoryStorage implements StorageLike {
  readonly map = new Map<string, string>();
  setCalls = 0;
  removeCalls = 0;

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.setCalls += 1;
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.removeCalls += 1;
    this.map.delete(key);
  }

  keys(): string[] {
    return [...this.map.keys()];
  }
}

export interface MemoryChannelHub {
  create(): ProjectChannel;
  sent: Array<ProjectChannelMessage>;
}

interface ChannelEntry {
  channel: MemoryChannel;
}

class MemoryChannel implements ProjectChannel {
  private readonly listeners = new Set<(message: ProjectChannelMessage) => void>();
  private closed = false;

  constructor(
    private readonly hub: MemoryChannelHubImpl,
    private readonly entry: ChannelEntry,
  ) {}

  post(message: ProjectChannelMessage): void {
    if (this.closed) return;
    this.hub.broadcast(this.entry, message);
  }

  subscribe(listener: (message: ProjectChannelMessage) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  close(): void {
    this.closed = true;
    this.hub.forget(this.entry);
  }

  deliver(message: ProjectChannelMessage): void {
    if (this.closed) return;
    for (const listener of this.listeners) listener(message);
  }
}

class MemoryChannelHubImpl implements MemoryChannelHub {
  private readonly entries: ChannelEntry[] = [];
  readonly sent: Array<ProjectChannelMessage> = [];

  create(): ProjectChannel {
    const entry: ChannelEntry = { channel: null as unknown as MemoryChannel };
    const channel = new MemoryChannel(this, entry);
    entry.channel = channel;
    this.entries.push(entry);
    return channel;
  }

  broadcast(from: ChannelEntry, message: ProjectChannelMessage): void {
    this.sent.push(message);
    for (const entry of this.entries) {
      if (entry === from) continue;
      // Deliver asynchronously like a real BroadcastChannel.
      queueMicrotask(() => {
        (entry.channel as MemoryChannel).deliver(message);
      });
    }
  }

  forget(entry: ChannelEntry): void {
    const index = this.entries.indexOf(entry);
    if (index >= 0) this.entries.splice(index, 1);
  }
}

export function memoryChannelHub(): MemoryChannelHub {
  return new MemoryChannelHubImpl();
}

/**
 * In-memory `ProjectDatabase` for jsdom UI tests where fake-indexeddb cannot
 * structured-clone jsdom host Blobs. It implements the same contract.
 */
export class MemoryProjectDatabase implements ProjectDatabase {
  readonly projects = new Map<string, ProjectRecord>();
  readonly images = new Map<string, ProjectImageRecord>();
  lastOpened: string | null = null;
  readonly meta = new Map<string, string>();
  removeCalls: string[] = [];

  constructor(private readonly now: () => number = () => Date.now()) {}

  private clone(record: ProjectRecord): ProjectRecord {
    return {
      ...record,
      settings: { ...record.settings },
      completedBits: record.completedBits.slice(),
    };
  }

  async list(): Promise<ProjectSummary[]> {
    return [...this.projects.values()]
      .filter((record) => record.schemaVersion <= 1)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((record) => ({
        id: record.id,
        name: record.name,
        updatedAt: record.updatedAt,
        doneCount: record.doneCount,
        cols: record.cols,
        rows: record.rows,
        thumb: this.images.get(record.id)?.thumb ?? null,
      }));
  }

  async get(id: string): Promise<LoadResult> {
    const record = this.projects.get(id);
    if (!record) return { ok: false, reason: 'missing' };
    if (record.schemaVersion > 1) return { ok: false, reason: 'newer-schema', project: record };
    return { ok: true, project: this.clone(record) };
  }

  async getImage(id: string): Promise<ProjectImageRecord | null> {
    return this.images.get(id) ?? null;
  }

  async put(record: ProjectRecord, options?: { expectedUpdatedAt?: number }): Promise<WriteResult> {
    const existing = this.projects.get(record.id);
    if (existing && existing.schemaVersion > 1) {
      return { ok: false, message: 'Newer schema', newerSchema: true };
    }
    if (
      existing &&
      options?.expectedUpdatedAt !== undefined &&
      existing.updatedAt > options.expectedUpdatedAt
    ) {
      return { ok: false, message: 'Newer save exists', conflict: true };
    }
    this.projects.set(record.id, this.clone(record));
    return { ok: true };
  }

  async putWithImage(
    record: ProjectRecord,
    image: ProjectImageRecord,
    options?: { expectedUpdatedAt?: number },
  ): Promise<WriteResult> {
    const result = await this.put(record, options);
    if (result.ok) this.images.set(record.id, image);
    return result;
  }

  async rename(id: string, name: string): Promise<WriteResult> {
    const record = this.projects.get(id);
    if (!record) return { ok: false, message: 'Project not found' };
    this.projects.set(id, { ...record, name, updatedAt: this.now() });
    return { ok: true };
  }

  async remove(id: string): Promise<void> {
    this.removeCalls.push(id);
    this.projects.delete(id);
    this.images.delete(id);
    if (this.lastOpened === id) this.lastOpened = null;
  }

  async findBySourceHash(hash: string, cols: number): Promise<ProjectRecord | null> {
    const matches = [...this.projects.values()]
      .filter((record) => record.sourceHash === hash && record.cols === cols)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const found = matches[0];
    return found ? this.clone(found) : null;
  }

  async getLastOpenedId(): Promise<string | null> {
    return this.lastOpened;
  }

  async setLastOpenedId(id: string | null): Promise<void> {
    this.lastOpened = id;
  }

  async getMeta(key: string): Promise<string | null> {
    return this.meta.get(key) ?? null;
  }

  async setMeta(key: string, value: string | null): Promise<void> {
    if (value === null) this.meta.delete(key);
    else this.meta.set(key, value);
  }

  close(): void {}
}
