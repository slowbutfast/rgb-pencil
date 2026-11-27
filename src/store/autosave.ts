export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'memory-only';

export interface SaveOutcome {
  ok: boolean;
  /** Nothing was written (for example, a read-only tab); keep the status. */
  skipped?: boolean;
  /** Storage is unavailable: the in-memory state is the only copy. */
  memoryOnly?: boolean;
  message?: string;
}

export interface AutosaveOptions {
  save: () => Promise<SaveOutcome>;
  onStatus: (status: SaveStatus, error: string | null) => void;
  debounceMs?: number;
  /** Injection seam for tests; defaults to `window`/`document`. */
  events?: EventTarget | null;
  isHidden?: () => boolean;
}

export interface Autosave {
  /** Mark the state dirty and restart the debounce window. */
  schedule(): void;
  /** Save as soon as possible; `force` writes even when nothing is dirty. */
  flush(force?: boolean): Promise<void>;
  dispose(): void;
  hasPending(): boolean;
  status(): SaveStatus;
}

export const DEFAULT_AUTOSAVE_DEBOUNCE_MS = 500;

/**
 * Debounced, serialised autosave with last-chance lifecycle flushes. Writes are
 * never allowed to overlap; a change arriving mid-write schedules the next
 * write, and `flush()` forces the latest state to follow the in-flight one.
 */
export function createAutosave(options: AutosaveOptions): Autosave {
  const debounceMs = options.debounceMs ?? DEFAULT_AUTOSAVE_DEBOUNCE_MS;
  const isHidden =
    options.isHidden ??
    (() => typeof document !== 'undefined' && document.visibilityState === 'hidden');

  const visibilityTarget =
    options.events ?? (typeof document !== 'undefined' ? document : undefined);
  const pagehideTarget =
    options.events ?? (typeof window !== 'undefined' ? window : visibilityTarget);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;
  let running = false;
  let queued = false;
  let disposed = false;
  let current: SaveStatus = 'idle';
  let chain: Promise<void> = Promise.resolve();

  function setStatus(status: SaveStatus, error: string | null): void {
    if (disposed) return;
    current = status;
    options.onStatus(status, error);
  }

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  async function write(): Promise<void> {
    let outcome: SaveOutcome;
    try {
      outcome = await options.save();
    } catch (error) {
      outcome = {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }

    if (outcome.skipped) return;
    if (outcome.ok && outcome.memoryOnly) setStatus('memory-only', null);
    else if (outcome.ok) setStatus('saved', null);
    else setStatus('error', outcome.message ?? 'Saving failed');
  }

  function enqueue(): Promise<void> {
    if (disposed) return Promise.resolve();
    if (running) {
      queued = true;
      return chain;
    }

    running = true;
    chain = (async () => {
      do {
        queued = false;
        dirty = false;
        await write();
      } while (queued);
      running = false;
    })();
    return chain;
  }

  function schedule(): void {
    if (disposed) return;
    dirty = true;
    setStatus('saving', null);
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      if (dirty) void enqueue();
    }, debounceMs);
  }

  function flush(force = false): Promise<void> {
    if (disposed) return Promise.resolve();
    clearTimer();
    // A clean lifecycle flush is a no-op; it must not bump updatedAt.
    if (!force && !dirty && !running) return Promise.resolve();
    if (running) {
      if (force || dirty) queued = true;
      return chain;
    }
    dirty = true;
    return enqueue();
  }

  function onVisibility(): void {
    if (isHidden()) void flush();
  }

  function onPageHide(): void {
    void flush();
  }

  visibilityTarget?.addEventListener?.('visibilitychange', onVisibility);
  pagehideTarget?.addEventListener?.('pagehide', onPageHide);

  return {
    schedule,
    flush,
    dispose() {
      disposed = true;
      clearTimer();
      visibilityTarget?.removeEventListener?.('visibilitychange', onVisibility);
      pagehideTarget?.removeEventListener?.('pagehide', onPageHide);
    },
    hasPending() {
      return dirty || running;
    },
    status() {
      return current;
    },
  };
}
