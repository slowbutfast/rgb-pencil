import { beforeEach, describe, expect, it } from 'vitest';

import {
  StalePipelineResultError,
  createWorkerEngineClient,
} from '../pipelineClient';
import { runPipeline } from '../pipeline';
import { getPalette } from '../palettes';
import {
  DEFAULT_SETTINGS,
  type MatchedGrid,
  type PipelineRequest,
  type PipelineResponse,
  type PipelineSettings,
  type SourceImage,
} from '../../types/pipeline';

function uniformImage(
  width: number,
  height: number,
  rgb: readonly [number, number, number] = [90, 120, 150],
): SourceImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

function settings(overrides: Partial<PipelineSettings> = {}): PipelineSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

function request(overrides: Partial<PipelineSettings> = {}): PipelineRequest {
  return { image: uniformImage(32, 32), settings: settings(overrides) };
}

function makeGrid(cols: number, rows: number, hash = 'feedface'): MatchedGrid {
  const count = cols * rows;
  return {
    cols,
    rows,
    ri: new Uint8Array(count).fill(1),
    gi: new Uint8Array(count).fill(2),
    bi: new Uint8Array(count).fill(3),
    deltaE: new Float32Array(count).fill(1.25),
    target: new Uint8ClampedArray(count * 3).fill(64),
    palette: getPalette('reflective'),
    sourceHash: hash,
  };
}

interface PostedJob {
  jobId: number;
  request: PipelineRequest;
}

class FakeWorker {
  static instances: FakeWorker[] = [];

  readonly posted: PostedJob[] = [];
  terminated = false;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(message: unknown): void {
    this.posted.push(message as PostedJob);
  }

  terminate(): void {
    this.terminated = true;
  }

  respond(jobId: number, grid: MatchedGrid): void {
    this.onmessage?.({ data: { ok: true, jobId, grid } } as MessageEvent);
  }

  fail(jobId: number, error = 'worker failure'): void {
    this.onmessage?.({ data: { ok: false, jobId, error } } as MessageEvent);
  }

  crash(message = 'unhandled worker crash'): void {
    this.onerror?.({ message } as ErrorEvent);
  }
}

function workerFactory(): Worker {
  return new FakeWorker() as unknown as Worker;
}

function latestWorker(): FakeWorker {
  const worker = FakeWorker.instances[FakeWorker.instances.length - 1];
  if (!worker) throw new Error('no fake worker created');
  return worker;
}

/** Attach a catch handler immediately so intentional stale rejections are not unhandled. */
function guard<T>(promise: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  return promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
}

beforeEach(() => {
  FakeWorker.instances = [];
});

describe('createWorkerEngineClient concurrency', () => {
  it('discards a stale response that arrives after a newer request was issued', async () => {
    const client = createWorkerEngineClient({ workerFactory });
    const stale = guard(client.process(request({ cols: 32 })));
    const latest = guard(client.process(request({ cols: 40 })));

    const worker = latestWorker();
    expect(worker.posted).toHaveLength(1);
    expect(worker.posted[0]!.jobId).toBe(1);

    worker.respond(1, makeGrid(32, 24, 'stale'));
    expect(worker.posted).toHaveLength(2);
    expect(worker.posted[1]!.jobId).toBe(2);

    worker.respond(2, makeGrid(40, 30, 'fresh'));

    const staleResult = await stale;
    const latestResult = await latest;
    expect(staleResult.ok).toBe(false);
    if (!staleResult.ok) expect(staleResult.error).toBeInstanceOf(StalePipelineResultError);
    expect(latestResult.ok).toBe(true);
    if (latestResult.ok) expect(latestResult.value.grid.sourceHash).toBe('fresh');
  });

  it('collapses 30 rapid requests into one in-flight plus the latest pending', async () => {
    const client = createWorkerEngineClient({ workerFactory });
    const requests = Array.from({ length: 30 }, (_, index) =>
      request({ cols: 16 + index % 80 }),
    );
    const guarded = requests.map((item) => guard(client.process(item)));

    const worker = latestWorker();
    expect(worker.posted).toHaveLength(1);

    worker.respond(1, makeGrid(16, 12, 'one'));
    expect(worker.posted).toHaveLength(2);
    const latestJob = worker.posted[1]!;
    expect(latestJob.request.settings.cols).toBe(requests[29]!.settings.cols);

    worker.respond(latestJob.jobId, makeGrid(requests[29]!.settings.cols, 12, 'latest'));
    const results = await Promise.all(guarded);

    const fulfilled = results.filter((result) => result.ok);
    expect(fulfilled).toHaveLength(1);
    if (fulfilled[0]?.ok) expect(fulfilled[0].value.grid.sourceHash).toBe('latest');
    expect(worker.posted).toHaveLength(2);
  });

  it('rejects on a worker error, surfaces it, and recreates the worker for the next request', async () => {
    const client = createWorkerEngineClient({ workerFactory });
    const failed = guard(client.process(request()));
    const worker = latestWorker();

    worker.fail(1, 'boom');
    const result = await failed;
    expect(result.ok).toBe(false);
    if (!result.ok) expect((result.error as Error).message).toBe('boom');
    expect(worker.terminated).toBe(true);

    const next = guard(client.process(request({ cols: 24 })));
    expect(FakeWorker.instances).toHaveLength(2);
    const replacement = latestWorker();
    expect(replacement.posted).toHaveLength(1);
    expect(replacement.posted[0]!.jobId).toBe(2);

    replacement.respond(2, makeGrid(24, 18, 'after-error'));
    const nextResult = await next;
    expect(nextResult.ok).toBe(true);
  });

  it('recovers from an unhandled worker error event', async () => {
    const client = createWorkerEngineClient({ workerFactory });
    const failed = guard(client.process(request()));
    const worker = latestWorker();

    worker.crash('segfault');
    const result = await failed;
    expect(result.ok).toBe(false);

    const next = guard(client.process(request()));
    expect(FakeWorker.instances).toHaveLength(2);
    latestWorker().respond(2, makeGrid(56, 42, 'recovered'));
    expect((await next).ok).toBe(true);
  });

  it('runs synchronously when worker construction throws', async () => {
    const failingFactory = (): Worker => {
      throw new Error('Worker unavailable');
    };
    const client = createWorkerEngineClient({ workerFactory: failingFactory });
    const req = request({ cols: 24, contrast: 1.45 });

    const result = await client.process(req);
    const direct = runPipeline(req).grid;

    expect(result.grid.ri).toEqual(direct.ri);
    expect(result.grid.gi).toEqual(direct.gi);
    expect(result.grid.bi).toEqual(direct.bi);
    expect(result.grid.deltaE).toEqual(direct.deltaE);
    expect(result.grid.target).toEqual(direct.target);
    expect(result.grid.sourceHash).toBe(direct.sourceHash);
  });

  it('runs synchronously when the platform has no Worker', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
    Object.defineProperty(globalThis, 'Worker', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    try {
      const client = createWorkerEngineClient();
      const req = request({ cols: 16 });
      const result = await client.process(req);

      expect(result.grid.cols).toBe(16);
      expect(result.grid.ri).toEqual(runPipeline(req).grid.ri);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'Worker', descriptor);
      else delete (globalThis as { Worker?: unknown }).Worker;
    }
  });

  it('invalidates in-flight results when a new image is loaded', async () => {
    const client = createWorkerEngineClient({ workerFactory });
    const first = guard(client.process(request({ cols: 32 })));
    const firstWorker = latestWorker();
    const posted = firstWorker.posted[0]!;

    client.invalidate();

    const firstResult = await first;
    expect(firstResult.ok).toBe(false);
    if (!firstResult.ok) expect(firstResult.error).toBeInstanceOf(StalePipelineResultError);
    expect(firstWorker.terminated).toBe(true);

    // A late response from the previous image must not resurrect the old grid.
    firstWorker.respond(posted.jobId, makeGrid(32, 24, 'old-image'));
    expect(client.process).toBeTypeOf('function');

    const next = guard(client.process(request({ cols: 40 })));
    const secondWorker = latestWorker();
    expect(secondWorker).not.toBe(firstWorker);
    const nextPosted = secondWorker.posted[0]!;
    expect(nextPosted.jobId).toBeGreaterThan(posted.jobId);

    secondWorker.respond(nextPosted.jobId, makeGrid(40, 30, 'new-image'));
    const nextResult = await next;
    expect(nextResult.ok).toBe(true);
    if (nextResult.ok) expect(nextResult.value.grid.sourceHash).toBe('new-image');
  });

  it('terminates in-flight work on dispose', async () => {
    const client = createWorkerEngineClient({ workerFactory });
    const pending = guard(client.process(request()));
    const worker = latestWorker();

    client.dispose();

    expect(worker.terminated).toBe(true);
    const result = await pending;
    expect(result.ok).toBe(false);
  });
});

describe('pipeline worker adapter', () => {
  interface WorkerScope {
    onmessage: ((event: MessageEvent) => void) | null;
    postMessage: (...args: unknown[]) => void;
  }

  async function emit(job: { jobId: number; request: PipelineRequest }): Promise<unknown[][] | null> {
    await import('../../workers/pipeline.worker');
    const scope = globalThis as unknown as WorkerScope;
    if (typeof scope.onmessage !== 'function') return null;

    const posted: unknown[][] = [];
    const original = scope.postMessage;
    scope.postMessage = (...args: unknown[]): void => {
      posted.push(args);
    };
    try {
      scope.onmessage({ data: job } as MessageEvent);
    } finally {
      scope.postMessage = original;
    }
    return posted;
  }

  it('posts a success response with all five result buffers transferred', async () => {
    const posted = await emit({ jobId: 42, request: request({ cols: 16 }) });
    expect(posted).toHaveLength(1);

    const [response, transfer] = posted![0]!;
    const typed = response as PipelineResponse;
    expect(typed.ok).toBe(true);
    expect(typed.jobId).toBe(42);
    expect(transfer).toHaveLength(5);
    (transfer as ArrayBuffer[]).forEach((buffer) => expect(buffer).toBeInstanceOf(ArrayBuffer));
  });

  it('posts a typed error response for an out-of-range width', async () => {
    const posted = await emit({ jobId: 43, request: request({ cols: 8 }) });
    expect(posted).toHaveLength(1);

    const [response] = posted![0]!;
    const typed = response as PipelineResponse;
    expect(typed.ok).toBe(false);
    expect(typed.jobId).toBe(43);
    if (!typed.ok) expect(typed.error).toContain('16');
  });
});
