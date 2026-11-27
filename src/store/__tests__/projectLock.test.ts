// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runPipeline } from '../../engine/pipeline';
import { createGridStore, type GridStore } from '../gridStore';
import type { LockManagerLike, ProjectChannel } from '../projectLock';
import { acquireProjectLock } from '../projectLock';
import type { ProjectDatabase } from '../projectDb';
import { losslessCodec, memoryChannelHub, MemoryStorage, openTestDb, sampleBitmap } from './support';

class FakeLocks implements LockManagerLike {
  private readonly owners = new Map<string, () => void>();

  constructor(private readonly stealDelayMs = 0) {}

  private grant(
    name: string,
    callback: (lock: unknown) => Promise<void>,
  ): Promise<unknown> {
    const existing = this.owners.get(name);
    if (existing) {
      this.owners.delete(name);
      existing();
    }

    let release = (): void => {};
    const done = new Promise<void>((resolve) => {
      release = resolve;
    });
    const releaseLock = (): void => {
      if (this.owners.get(name) === releaseLock) this.owners.delete(name);
      release();
    };
    this.owners.set(name, releaseLock);
    void done.then(() => {
      if (this.owners.get(name) === releaseLock) this.owners.delete(name);
    });
    void Promise.resolve(callback({ name })).then(() => release());
    return done;
  }

  request(
    name: string,
    options: { ifAvailable?: boolean; steal?: boolean },
    callback: (lock: unknown) => Promise<void>,
  ): Promise<unknown> {
    const existing = this.owners.get(name);
    if (existing && !options.steal) {
      return Promise.resolve(callback(null));
    }
    if (options.steal && this.stealDelayMs > 0 && existing) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          void this.grant(name, callback).then(
            () => resolve(undefined),
            reject,
          );
        }, this.stealDelayMs);
      });
    }
    return this.grant(name, callback);
  }

  held(name: string): boolean {
    return this.owners.has(name);
  }
}

/** Mirrors the browser: granting a steal aborts the previous owner's request. */
class RevokingLocks implements LockManagerLike {
  private readonly owners = new Map<string, { reject: (error: unknown) => void }>();

  request(
    name: string,
    options: { ifAvailable?: boolean; steal?: boolean },
    callback: (lock: unknown) => Promise<void>,
  ): Promise<unknown> {
    const existing = this.owners.get(name);
    if (existing && !options.steal) {
      return Promise.resolve(callback(null));
    }

    return new Promise((resolve, reject) => {
      if (existing && options.steal) {
        this.owners.delete(name);
        const abort = new Error('The lock was stolen.');
        abort.name = 'AbortError';
        existing.reject(abort);
      }
      const entry = { reject };
      this.owners.set(name, entry);
      const release = (): void => {
        if (this.owners.get(name) === entry) this.owners.delete(name);
        resolve(undefined);
      };
      void Promise.resolve(callback({ name })).then(release, release);
    });
  }
}

let counter = 0;
const dbs: ProjectDatabase[] = [];
const stores: GridStore[] = [];

async function makeDb(): Promise<ProjectDatabase> {
  counter += 1;
  const db = await openTestDb(`lock-${counter}-${Math.random().toString(16).slice(2)}`);
  dbs.push(db);
  return db;
}

let clock = 10_000;
let idCounter = 0;

function makeStore(options: {
  db: ProjectDatabase | null;
  locks?: LockManagerLike | null;
  channel?: ProjectChannel | null;
  sample?: ReturnType<typeof sampleBitmap>;
}): GridStore {
  const store = createGridStore({
    client: { process: async (request) => runPipeline(request) },
    db: options.db,
    codec: losslessCodec(),
    storage: new MemoryStorage(),
    locks: options.locks,
    channel: options.channel,
    sampleImage: options.sample ? () => options.sample! : undefined,
    now: () => (clock += 1),
    randomId: () => `lock-project-${++idCounter}`,
    debounceMs: 5,
  });
  stores.push(store);
  return store;
}

afterEach(() => {
  while (stores.length > 0) stores.pop()?.dispose();
  while (dbs.length > 0) dbs.pop()?.close();
});

async function seedProject(db: ProjectDatabase): Promise<GridStore> {
  const store = makeStore({ db });
  await store.loadImage(sampleBitmap(32, 24, 3), { name: 'shared.png' });
  store.toggleCell(1, 1);
  await store.flushNow();
  return store;
}

describe('projectLock', () => {
  it('gives the second opener read-only mode and writes nothing', async () => {
    const db = await makeDb();
    const locks = new FakeLocks();
    const hub = memoryChannelHub();
    const owner = await seedProject(db);
    const projectId = owner.getState().projectId!;

    // The owner seeded without locks: release it by closing before the locked opener.
    stores.splice(stores.indexOf(owner), 1);
    owner.dispose();

    const first = makeStore({ db, locks, channel: hub.create() });
    await expect(first.resumeLastProject()).resolves.toBe(true);
    expect(first.getState().readOnly).toBe(false);

    const readOnly = makeStore({ db, locks, channel: hub.create() });
    await expect(readOnly.resumeLastProject()).resolves.toBe(true);
    expect(readOnly.getState().readOnly).toBe(true);
    expect(readOnly.getState().banners.map((banner) => banner.id)).toContain('read-only');

    readOnly.toggleCell(5, 5);
    await readOnly.flushNow();
    expect(readOnly.getState().completedCells.has('5,5')).toBe(false);

    // Inspection still works.
    readOnly.setHovered({ col: 4, row: 4 });
    expect(readOnly.getState().hoveredCell).toEqual({ col: 4, row: 4 });

    const record = await db.get(projectId);
    expect(record.ok && record.project.doneCount).toBe(1);
  });

  it('takes over ownership and flushes the previous owner before going read-only', async () => {
    const db = await makeDb();
    const locks = new FakeLocks();
    const hub = memoryChannelHub();
    const owner = await seedProject(db);
    const projectId = owner.getState().projectId!;
    owner.dispose();
    stores.splice(stores.indexOf(owner), 1);

    const first = makeStore({ db, locks, channel: hub.create() });
    await first.resumeLastProject();
    const second = makeStore({ db, locks, channel: hub.create() });
    await second.resumeLastProject();
    expect(second.getState().readOnly).toBe(true);

    first.toggleCell(2, 2);
    await expect(second.takeOver()).resolves.toBeUndefined();
    expect(second.getState().readOnly).toBe(false);

    await vi.waitFor(() => expect(first.getState().readOnly).toBe(true));
    expect(first.getState().banners.map((banner) => banner.id)).toContain('read-only');

    // The stolen lock must actually be held by the new owner.
    expect(locks.held(`rgb-pencil:project:${projectId}`)).toBe(true);

    second.toggleCell(3, 3);
    await second.flushNow();

    // A third tab must now be read-only and unable to write concurrently.
    const third = makeStore({ db, locks, channel: hub.create() });
    await third.resumeLastProject();
    expect(third.getState().readOnly).toBe(true);
    third.toggleCell(4, 4);
    await third.flushNow();

    const record = await db.get(projectId);
    expect(record.ok && record.project.doneCount).toBe(3);
  });

  it('waits for a delayed steal grant and keeps the stolen lock held', async () => {
    const db = await makeDb();
    const locks = new FakeLocks(300);
    const hub = memoryChannelHub();
    const owner = await seedProject(db);
    const projectId = owner.getState().projectId!;
    owner.dispose();
    stores.splice(stores.indexOf(owner), 1);

    const first = makeStore({ db, locks, channel: hub.create() });
    await first.resumeLastProject();
    const second = makeStore({ db, locks, channel: hub.create() });
    await second.resumeLastProject();
    expect(second.getState().readOnly).toBe(true);

    await second.takeOver();

    // The old 250 ms cutoff abandoned the request before this 300 ms grant;
    // the fixed handle waits and still owns the lock afterwards.
    const name = `rgb-pencil:project:${projectId}`;
    expect(locks.held(name)).toBe(true);
    expect(second.getState().readOnly).toBe(false);

    const third = makeStore({ db, locks, channel: hub.create() });
    await third.resumeLastProject();
    expect(third.getState().readOnly).toBe(true);
    third.toggleCell(4, 4);
    await third.flushNow();

    const record = await db.get(projectId);
    expect(record.ok && record.project.doneCount).toBe(1);
  });

  it('releases the lock when the owning tab closes', async () => {
    const db = await makeDb();
    const locks = new FakeLocks();
    const hub = memoryChannelHub();
    const owner = await seedProject(db);
    owner.dispose();
    stores.splice(stores.indexOf(owner), 1);

    const first = makeStore({ db, locks, channel: hub.create() });
    await first.resumeLastProject();
    const name = first.getState().projectId!;
    expect(locks.held(`rgb-pencil:project:${name}`)).toBe(true);

    first.dispose();
    stores.splice(stores.indexOf(first), 1);
    await vi.waitFor(() =>
      expect(locks.held(`rgb-pencil:project:${name}`)).toBe(false),
    );

    const next = makeStore({ db, locks, channel: hub.create() });
    await expect(next.resumeLastProject()).resolves.toBe(true);
    expect(next.getState().readOnly).toBe(false);
  });

  it('skips a stale write and offers Reload project without Web Locks', async () => {
    const db = await makeDb();
    const store = makeStore({ db, locks: null });
    await store.loadImage(sampleBitmap(32, 24, 4), { name: 'fallback.png' });
    store.toggleCell(1, 1);
    await store.flushNow();
    const projectId = store.getState().projectId!;

    const current = await db.get(projectId);
    if (!current.ok) throw new Error('missing');
    await db.put({
      ...current.project,
      doneCount: 7,
      updatedAt: current.project.updatedAt + 10_000,
    });

    store.toggleCell(2, 2);
    await store.flushNow();

    expect(store.getState().banners.map((banner) => banner.id)).toContain('reload');
    const after = await db.get(projectId);
    expect(after.ok && after.project.doneCount).toBe(7);
  });

  it('refreshes the list across tabs and switches a deleted open project', async () => {
    const db = await makeDb();
    const locks = new FakeLocks();
    const hub = memoryChannelHub();
    const sample = sampleBitmap(24, 18, 7);

    const writer = makeStore({ db, locks, channel: hub.create(), sample });
    await writer.loadImage(sampleBitmap(32, 24, 5), { name: 'broadcast.png' });
    const other = makeStore({ db, locks, channel: hub.create(), sample });
    writer.toggleCell(1, 1);
    await writer.flushNow();
    const projectId = writer.getState().projectId!;

    await vi.waitFor(() => expect(other.getState().projects.map((p) => p.id)).toContain(projectId));

    await other.resumeLastProject();
    expect(other.getState().projectId).toBe(projectId);

    await writer.deleteProject(projectId);
    await vi.waitFor(() => expect(other.getState().projectId).toBeNull());
    expect(other.getState().banners.map((banner) => banner.id)).toContain('notice');
    expect(other.getState().grid).not.toBeNull();
  });

  it('goes read-only and calls onLost when a steal revoked the lock with no channel', async () => {
    const locks = new RevokingLocks();
    let lost = 0;
    const first = await acquireProjectLock('project-revoked', {
      locks,
      channel: null,
      onLost: () => {
        lost += 1;
      },
    });
    expect(first.readOnly).toBe(false);

    const second = await acquireProjectLock('project-revoked', { locks, channel: null });
    expect(second.readOnly).toBe(true);
    await expect(second.takeOver()).resolves.toBe(true);
    expect(second.readOnly).toBe(false);

    await vi.waitFor(() => expect(first.readOnly).toBe(true));
    expect(lost).toBe(1);
    first.release();
    second.release();
  });

  it('calls onLost exactly once when abort and lock-taken both arrive', async () => {
    const locks = new RevokingLocks();
    const hub = memoryChannelHub();
    let lost = 0;
    const first = await acquireProjectLock('project-abort', {
      locks,
      channel: hub.create(),
      onLost: () => {
        lost += 1;
      },
    });
    const second = await acquireProjectLock('project-abort', {
      locks,
      channel: hub.create(),
    });

    await expect(second.takeOver()).resolves.toBe(true);
    await vi.waitFor(() => expect(first.readOnly).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(lost).toBe(1);
    first.release();
    second.release();
  });
});
