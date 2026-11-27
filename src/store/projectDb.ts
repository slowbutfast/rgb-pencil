import type { PaletteKey } from '../types/pipeline';

/** IndexedDB identity and schema version. */
export const DB_NAME = 'rgb-pencil';
export const DB_VERSION = 1;
export const SCHEMA_VERSION = 1;

export const PROJECT_STORE = 'projects';
export const IMAGE_STORE = 'images';
export const META_STORE = 'meta';
export const LAST_OPENED_KEY = 'lastOpenedProjectId';

/** Settings exactly as persisted in a project record and backup file. */
export interface StoredSettings {
  cols: number;
  contrast: number;
  dither: boolean;
  ditherStrength: number;
  paletteId: PaletteKey;
}

/** Metadata record for one saved drawing. */
export interface ProjectRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  schemaVersion: number;
  pipelineVersion: number;
  sourceHash: string;
  cols: number;
  rows: number;
  settings: StoredSettings;
  completedBits: Uint8Array;
  doneCount: number;
}

/** Blob store keyed by project id: the lossless working bitmap plus a thumb. */
export interface ProjectImageRecord {
  projectId: string;
  width: number;
  height: number;
  png: Blob;
  thumb: Blob;
}

/** Small record used by the Projects list. */
export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
  doneCount: number;
  cols: number;
  rows: number;
  thumb: Blob | null;
}

export type WriteResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
      quotaExceeded?: boolean;
      conflict?: boolean;
      newerSchema?: boolean;
    };

export type LoadResult =
  | { ok: true; project: ProjectRecord }
  | { ok: false; reason: 'missing' | 'newer-schema'; project?: ProjectRecord };

export type OpenResult =
  | { ok: true; db: ProjectDatabase }
  | { ok: false; message: string };

export interface ProjectDbOptions {
  /** Defaults to `globalThis.indexedDB`; tests inject `fake-indexeddb`. */
  factory?: IDBFactory | null;
  /** Defaults to the production `rgb-pencil` database. */
  dbName?: string;
  /** Called once after the first successful write. */
  persistStorage?: () => Promise<boolean> | null;
}

export interface ProjectDatabase {
  list(): Promise<ProjectSummary[]>;
  get(id: string): Promise<LoadResult>;
  getImage(id: string): Promise<ProjectImageRecord | null>;
  put(record: ProjectRecord, options?: { expectedUpdatedAt?: number }): Promise<WriteResult>;
  putWithImage(
    record: ProjectRecord,
    image: ProjectImageRecord,
    options?: { expectedUpdatedAt?: number },
  ): Promise<WriteResult>;
  rename(id: string, name: string): Promise<WriteResult>;
  remove(id: string): Promise<void>;
  findBySourceHash(hash: string, cols: number): Promise<ProjectRecord | null>;
  getLastOpenedId(): Promise<string | null>;
  setLastOpenedId(id: string | null): Promise<void>;
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string | null): Promise<void>;
  close(): void;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' ? message : String(error);
}

function failure(error: unknown): WriteResult {
  const name = (error as { name?: string } | null)?.name;
  if (name === 'QuotaExceededError') {
    return {
      ok: false,
      quotaExceeded: true,
      message: 'Storage quota exceeded. Delete a project or export a backup, then retry.',
    };
  }
  return { ok: false, message: errorMessage(error) };
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function upgrade(db: IDBDatabase): void {
  // Ordered, idempotent upgrade steps. Version 1 is the initial schema.
  if (!db.objectStoreNames.contains(PROJECT_STORE)) {
    const projects = db.createObjectStore(PROJECT_STORE, { keyPath: 'id' });
    projects.createIndex('updatedAt', 'updatedAt');
    projects.createIndex('sourceHash', 'sourceHash');
  }
  if (!db.objectStoreNames.contains(IMAGE_STORE)) {
    db.createObjectStore(IMAGE_STORE, { keyPath: 'projectId' });
  }
  if (!db.objectStoreNames.contains(META_STORE)) {
    db.createObjectStore(META_STORE, { keyPath: 'k' });
  }
}

function openRaw(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(name, DB_VERSION);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => upgrade(request.result);
    request.onblocked = () => reject(new Error('IndexedDB open is blocked by another tab'));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

function defaultPersist(): Promise<boolean> | null {
  try {
    const storage = (globalThis.navigator as Navigator | undefined)?.storage;
    return storage?.persist ? storage.persist() : null;
  } catch {
    return null;
  }
}

export async function openProjectDatabase(
  options: ProjectDbOptions = {},
): Promise<OpenResult> {
  const factory =
    options.factory === undefined ? (globalThis.indexedDB ?? null) : options.factory;
  if (!factory) return { ok: false, message: 'IndexedDB is unavailable in this browser' };

  let raw: IDBDatabase;
  try {
    raw = await openRaw(factory, options.dbName ?? DB_NAME);
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }

  return { ok: true, db: createProjectDatabase(raw, options.persistStorage ?? defaultPersist) };
}

function createProjectDatabase(
  raw: IDBDatabase,
  persistStorage: () => Promise<boolean> | null,
): ProjectDatabase {
  let persistRequested = false;

  function afterSuccessfulWrite(): void {
    if (persistRequested) return;
    persistRequested = true;
    try {
      const result = persistStorage();
      if (result) void result.catch(() => {});
    } catch {
      /* persistent storage is best-effort */
    }
  }

  async function getMeta(key: string): Promise<string | null> {
    try {
      const tx = raw.transaction(META_STORE, 'readonly');
      const entry = await requestToPromise<{ k: string; value: string } | undefined>(
        tx.objectStore(META_STORE).get(key),
      );
      return entry?.value ?? null;
    } catch {
      return null;
    }
  }

  async function setMeta(key: string, value: string | null): Promise<void> {
    try {
      const tx = raw.transaction(META_STORE, 'readwrite');
      const store = tx.objectStore(META_STORE);
      if (value === null) store.delete(key);
      else store.put({ k: key, value });
      await transactionDone(tx);
    } catch {
      /* meta is best-effort */
    }
  }

  async function get(id: string): Promise<LoadResult> {
    try {
      const tx = raw.transaction(PROJECT_STORE, 'readonly');
      const record = await requestToPromise<ProjectRecord | undefined>(
        tx.objectStore(PROJECT_STORE).get(id),
      );
      if (!record) return { ok: false, reason: 'missing' };
      if (record.schemaVersion > SCHEMA_VERSION) {
        return { ok: false, reason: 'newer-schema', project: record };
      }
      return { ok: true, project: record };
    } catch {
      return { ok: false, reason: 'missing' };
    }
  }

  async function write(
    record: ProjectRecord,
    image?: ProjectImageRecord,
    options: { expectedUpdatedAt?: number } = {},
  ): Promise<WriteResult> {
    let tx: IDBTransaction | null = null;
    try {
      tx = raw.transaction(
        image ? [PROJECT_STORE, IMAGE_STORE] : [PROJECT_STORE],
        'readwrite',
      );
      const store = tx.objectStore(PROJECT_STORE);
      const existing = await requestToPromise<ProjectRecord | undefined>(store.get(record.id));
      if (existing) {
        if (existing.schemaVersion > SCHEMA_VERSION) {
          tx.abort();
          return {
            ok: false,
            newerSchema: true,
            message: 'This project was saved by a newer version of the app',
          };
        }
        if (
          options.expectedUpdatedAt !== undefined &&
          existing.updatedAt > options.expectedUpdatedAt
        ) {
          tx.abort();
          return {
            ok: false,
            conflict: true,
            message: 'A newer save exists; reload the project',
          };
        }
      }
      store.put(record);
      if (image) tx.objectStore(IMAGE_STORE).put(image);
      await transactionDone(tx);
      afterSuccessfulWrite();
      return { ok: true };
    } catch (error) {
      try {
        tx?.abort();
      } catch {
        /* already aborted/completed */
      }
      return failure(error);
    }
  }

  return {
    async list() {
      try {
        const tx = raw.transaction([PROJECT_STORE, IMAGE_STORE], 'readonly');
        const projects = await requestToPromise<ProjectRecord[]>(
          tx.objectStore(PROJECT_STORE).getAll(),
        );
        const images = await requestToPromise<ProjectImageRecord[]>(
          tx.objectStore(IMAGE_STORE).getAll(),
        );
        const thumbs = new Map(images.map((image) => [image.projectId, image.thumb]));
        return projects
          .filter((record) => record.schemaVersion <= SCHEMA_VERSION)
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .map((record) => ({
            id: record.id,
            name: record.name,
            updatedAt: record.updatedAt,
            doneCount: record.doneCount,
            cols: record.cols,
            rows: record.rows,
            thumb: thumbs.get(record.id) ?? null,
          }));
      } catch {
        return [];
      }
    },

    get,

    async getImage(id) {
      try {
        const tx = raw.transaction(IMAGE_STORE, 'readonly');
        const image = await requestToPromise<ProjectImageRecord | undefined>(
          tx.objectStore(IMAGE_STORE).get(id),
        );
        return image ?? null;
      } catch {
        return null;
      }
    },

    put(record, options) {
      return write(record, undefined, options);
    },

    putWithImage(record, image, options) {
      return write(record, image, options);
    },

    async rename(id, name) {
      try {
        const tx = raw.transaction(PROJECT_STORE, 'readwrite');
        const store = tx.objectStore(PROJECT_STORE);
        const existing = await requestToPromise<ProjectRecord | undefined>(store.get(id));
        if (!existing) return { ok: false, message: 'Project not found' };
        if (existing.schemaVersion > SCHEMA_VERSION) {
          tx.abort();
          return { ok: false, newerSchema: true, message: 'Project uses a newer schema' };
        }
        store.put({ ...existing, name, updatedAt: Date.now() });
        await transactionDone(tx);
        afterSuccessfulWrite();
        return { ok: true };
      } catch (error) {
        return failure(error);
      }
    },

    async remove(id) {
      try {
        const tx = raw.transaction([PROJECT_STORE, IMAGE_STORE], 'readwrite');
        tx.objectStore(PROJECT_STORE).delete(id);
        tx.objectStore(IMAGE_STORE).delete(id);
        await transactionDone(tx);
      } catch {
        /* deletion is best-effort; listing excludes missing records */
      }
    },

    async findBySourceHash(hash, cols) {
      try {
        const tx = raw.transaction(PROJECT_STORE, 'readonly');
        const records = await requestToPromise<ProjectRecord[]>(
          tx.objectStore(PROJECT_STORE).index('sourceHash').getAll(hash),
        );
        return (
          records
            .filter(
              (record) =>
                record.cols === cols && record.schemaVersion <= SCHEMA_VERSION,
            )
            .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
        );
      } catch {
        return null;
      }
    },

    getMeta,

    setMeta,

    async getLastOpenedId() {
      return getMeta(LAST_OPENED_KEY);
    },

    async setLastOpenedId(id) {
      await setMeta(LAST_OPENED_KEY, id);
    },

    close() {
      raw.close();
    },
  };
}
