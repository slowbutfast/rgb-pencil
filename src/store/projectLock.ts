/** Name of the Web Lock that grants write ownership of one project. */
export function projectLockName(projectId: string): string {
  return `rgb-pencil:project:${projectId}`;
}

export const PROJECT_CHANNEL_NAME = 'rgb-pencil-projects';

const LOCK_STEAL_TIMEOUT_MS = 250;

export interface LockManagerLike {
  request(
    name: string,
    options: { ifAvailable?: boolean; steal?: boolean },
    callback: (lock: unknown) => Promise<void>,
  ): Promise<unknown>;
}

export type ProjectChannelMessage =
  | { type: 'list-changed' }
  | { type: 'deleted'; id: string }
  | { type: 'lock-taken'; id: string; tabId: string }
  | { type: 'lock-released'; id: string; tabId: string };

export interface ProjectChannel {
  post(message: ProjectChannelMessage): void;
  subscribe(listener: (message: ProjectChannelMessage) => void): () => void;
  close(): void;
}

export interface ProjectLockHandle {
  readonly readOnly: boolean;
  readonly mode: 'web-lock' | 'fallback';
  /** Best-effort notification that another tab stole the lock. */
  setOnLost(callback: (() => void | Promise<void>) | null): void;
  takeOver(): Promise<boolean>;
  release(): void;
}

export interface AcquireLockOptions {
  locks?: LockManagerLike | null;
  channel?: ProjectChannel | null;
  onLost?: () => void | Promise<void>;
}

function defaultLocks(): LockManagerLike | null {
  try {
    const locks = (globalThis.navigator as Navigator | undefined)?.locks;
    return (locks as LockManagerLike | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Guarded `BroadcastChannel` wrapper; returns `null` where unsupported. */
export function createProjectChannel(
  factory?: ((name: string) => BroadcastChannel) | null,
): ProjectChannel | null {
  if (factory === null) return null;
  try {
    const create =
      factory ??
      (typeof BroadcastChannel === 'function'
        ? (name: string) => new BroadcastChannel(name)
        : null);
    if (!create) return null;
    const channel = create(PROJECT_CHANNEL_NAME);
    return {
      post(message) {
        try {
          channel.postMessage(message);
        } catch {
          /* another tab may have closed; list refresh is best-effort */
        }
      },
      subscribe(listener) {
        const handler = (event: MessageEvent) => {
          listener(event.data as ProjectChannelMessage);
        };
        channel.addEventListener('message', handler);
        return () => channel.removeEventListener('message', handler);
      },
      close() {
        try {
          channel.close();
        } catch {
          /* already closed */
        }
      },
    };
  } catch {
    return null;
  }
}

function tabId(): string {
  return `tab-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

interface LockHold {
  promise: Promise<void>;
  resolve: () => void;
}

function makeHold(): LockHold {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/**
 * Acquire `rgb-pencil:project:<id>` with `ifAvailable`. No lock means another
 * tab is the writer, so this handle is read-only. Without Web Locks the handle
 * runs in fallback mode: read-write, with compare-and-put on save.
 */
export async function acquireProjectLock(
  projectId: string,
  options: AcquireLockOptions = {},
): Promise<ProjectLockHandle> {
  const locks = options.locks === undefined ? defaultLocks() : options.locks;
  const ownTab = tabId();
  const name = projectLockName(projectId);
  let readOnly = false;
  let onLost = options.onLost ?? null;
  let released = false;
  let pendingRelease: (() => void) | null = null;

  if (!locks) {
    return {
      get readOnly() {
        return false;
      },
      mode: 'fallback',
      setOnLost(callback) {
        onLost = callback;
      },
      async takeOver() {
        return true;
      },
      release() {
        released = true;
      },
    };
  }

  let activeHold: LockHold | null = null;
  let lostNotified = false;

  const notifyLost = (): void => {
    if (lostNotified || released) return;
    lostNotified = true;
    readOnly = true;
    const hold = activeHold;
    activeHold = null;
    hold?.resolve();
    const notify = onLost;
    void Promise.resolve(notify ? notify() : undefined).finally(() => {
      options.channel?.post({ type: 'lock-released', id: projectId, tabId: ownTab });
    });
  };

  const decided = deferred<boolean>();

  try {
    const request = locks.request(name, { ifAvailable: true }, async (lock) => {
      if (!lock) {
        decided.resolve(false);
        return;
      }
      // A fresh hold is created only for an actual ownership grant; a denied
      // ifAvailable request never resolves a hold.
      const hold = makeHold();
      activeHold = hold;
      decided.resolve(true);
      await hold.promise;
    });
    // The owning callback intentionally never settles until release; avoid an
    // unhandled rejection if the browser aborts the request later. A post-grant
    // AbortError means another tab stole the lock, so this tab must stop
    // writing even if no BroadcastChannel message arrives.
    void Promise.resolve(request).catch(() => {
      if (activeHold) {
        notifyLost();
      } else {
        decided.resolve(false);
      }
    });
  } catch {
    decided.resolve(false);
  }

  const granted = await decided.promise;
  readOnly = !granted;

  const unsubscribe = options.channel?.subscribe((message) => {
    if (message.type === 'lock-taken' && message.id === projectId && message.tabId !== ownTab) {
      notifyLost();
    }
    if (
      message.type === 'lock-released' &&
      message.id === projectId &&
      message.tabId !== ownTab
    ) {
      pendingRelease?.();
      pendingRelease = null;
    }
  });

  function waitForPreviousRelease(): Promise<void> {
    if (!options.channel) return Promise.resolve();
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        pendingRelease = null;
        resolve();
      };
      pendingRelease = finish;
      setTimeout(finish, LOCK_STEAL_TIMEOUT_MS);
    });
  }

  return {
    get readOnly() {
      return readOnly;
    },
    mode: 'web-lock',
    setOnLost(callback) {
      onLost = callback;
    },
    async takeOver() {
      if (released) return false;
      if (!readOnly) return true;

      const previous = waitForPreviousRelease();
      const hold = makeHold();
      const decidedSteal = deferred<boolean>();
      let callbackEntered = false;

      const deny = (): void => {
        if (callbackEntered) return;
        decidedSteal.resolve(false);
        hold.resolve();
      };

      try {
        const request = locks.request(name, { steal: true }, async (lock) => {
          if (!lock) {
            deny();
            return;
          }
          callbackEntered = true;
          activeHold = hold;
          decidedSteal.resolve(true);
          // Must stay pending: returning would release the freshly stolen lock.
          await hold.promise;
        });
        void Promise.resolve(request).catch(deny);
      } catch {
        deny();
        return false;
      }

      // No timeout here: a delayed steal grant must not abandon a hold that a
      // late callback would then resolve immediately. Wait for the callback.
      const granted = await decidedSteal.promise;
      if (!granted || released) {
        hold.resolve();
        return false;
      }

      // Only after the steal callback has actually been entered is ownership
      // real. Post the notification afterwards so the previous owner flushes.
      readOnly = false;
      options.channel?.post({ type: 'lock-taken', id: projectId, tabId: ownTab });
      // Best-effort only: the previous owner's flush may not complete within
      // this window, but the steal itself is already granted.
      await previous;
      return true;
    },
    release() {
      if (released) return;
      released = true;
      readOnly = true;
      const hold = activeHold;
      activeHold = null;
      hold?.resolve();
      unsubscribe?.();
    },
  };
}
