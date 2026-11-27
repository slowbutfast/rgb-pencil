// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAutosave, type SaveOutcome, type SaveStatus } from '../autosave';

interface Harness {
  statuses: Array<{ status: SaveStatus; error: string | null }>;
  save: ReturnType<typeof vi.fn>;
  scheduler: ReturnType<typeof createAutosave>;
  events: EventTarget;
}

function harness(
  outcomes: Array<SaveOutcome | (() => Promise<SaveOutcome>)> = [{ ok: true }],
  debounceMs = 500,
): Harness {
  const statuses: Harness['statuses'] = [];
  let index = 0;
  const save = vi.fn(async () => {
    const next = outcomes[Math.min(index, outcomes.length - 1)]!;
    index += 1;
    return typeof next === 'function' ? next() : next;
  });
  const events = new EventTarget();
  const scheduler = createAutosave({
    save,
    onStatus: (status, error) => statuses.push({ status, error }),
    debounceMs,
    events,
    isHidden: () => true,
  });
  return { statuses, save, scheduler, events };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('autosave', () => {
  it('coalesces a burst into one write after the debounce window', async () => {
    const { save, scheduler, statuses } = harness();
    for (let i = 0; i < 40; i += 1) scheduler.schedule();

    expect(statuses[0]).toEqual({ status: 'saving', error: null });
    await vi.advanceTimersByTimeAsync(499);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toEqual({ status: 'saved', error: null });

    scheduler.dispose();
  });

  it('flushes immediately when the page becomes hidden', async () => {
    const { save, scheduler, events } = harness();
    scheduler.schedule();
    expect(save).not.toHaveBeenCalled();

    events.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });

  it('flushes immediately on pagehide', async () => {
    const { save, scheduler, events } = harness();
    scheduler.schedule();
    events.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });

  it('serialises overlapping writes and lets the latest state win', async () => {
    let releaseFirst: (() => void) | null = null;
    let running = 0;
    let maxRunning = 0;
    const save = vi.fn(async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      if (save.mock.calls.length === 1) {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      }
      running -= 1;
      return { ok: true } satisfies SaveOutcome;
    });
    const scheduler = createAutosave({
      save,
      onStatus: () => {},
      debounceMs: 500,
      events: new EventTarget(),
    });

    const first = scheduler.flush();
    await Promise.resolve();
    scheduler.schedule();
    const second = scheduler.flush();

    expect(save).toHaveBeenCalledTimes(1);
    releaseFirst!();
    await first;
    await second;

    expect(maxRunning).toBe(1);
    expect(save).toHaveBeenCalledTimes(2);
    scheduler.dispose();
  });

  it('reports a warning status on failure and keeps retrying on the next change', async () => {
    const { save, scheduler, statuses } = harness([{ ok: false, message: 'QuotaExceededError' }]);
    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(500);

    expect(save).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toEqual({ status: 'error', error: 'QuotaExceededError' });

    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(2);
    scheduler.dispose();
  });

  it('reports memory-only without flashing an error', async () => {
    const { scheduler, statuses } = harness([{ ok: true, memoryOnly: true }]);
    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(500);
    expect(statuses.at(-1)).toEqual({ status: 'memory-only', error: null });
    scheduler.dispose();
  });

  it('cancels timers and listeners on dispose', async () => {
    const { save, scheduler, events } = harness();
    scheduler.schedule();
    scheduler.dispose();
    await vi.advanceTimersByTimeAsync(1000);
    events.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(0);
    expect(save).not.toHaveBeenCalled();
  });
});
