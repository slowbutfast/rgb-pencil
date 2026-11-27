import { runPipeline } from './pipeline';
import type {
  EngineClient,
  PipelineJobRequest,
  PipelineRequest,
  PipelineResponse,
  PipelineResult,
} from '../types/pipeline';

export class StalePipelineResultError extends Error {
  constructor(message = 'Pipeline request was superseded') {
    super(message);
    this.name = 'StalePipelineResultError';
  }
}

export interface WorkerEngineClientOptions {
  /** Injectable for tests; defaults to a Vite module worker. */
  workerFactory?: () => Worker;
}

export interface PipelineEngineClient extends EngineClient {
  invalidate(): void;
  dispose(): void;
}

interface ClientJob {
  jobId: number;
  epoch: number;
  request: PipelineRequest;
  resolve: (result: PipelineResult) => void;
  reject: (error: unknown) => void;
}

function defaultWorkerFactory(): Worker {
  if (typeof Worker === 'undefined') throw new Error('Worker is unavailable');
  return new Worker(new URL('../workers/pipeline.worker.ts', import.meta.url), { type: 'module' });
}

/**
 * Worker-backed `EngineClient` with latest-job-wins semantics: one request in
 * flight plus one latest-pending request, stale responses dropped, a fresh
 * worker after a failure, and a synchronous `runPipeline` fallback when the
 * platform has no `Worker` or construction throws.
 */
export function createWorkerEngineClient(
  options: WorkerEngineClientOptions = {},
): PipelineEngineClient {
  const factory = options.workerFactory ?? defaultWorkerFactory;

  let worker: Worker | null = null;
  let mode: 'worker' | 'sync' = 'worker';
  let epoch = 0;
  let jobCounter = 0;
  let latestJobId = 0;
  let inFlight: ClientJob | null = null;
  let pending: ClientJob | null = null;

  function ensureWorker(): Worker | null {
    if (mode === 'sync') return null;
    if (worker) return worker;

    try {
      const created = factory();
      created.onmessage = (event: MessageEvent) => onMessage(created, event);
      created.onerror = () => onWorkerError(created);
      worker = created;
      return created;
    } catch {
      mode = 'sync';
      worker = null;
      return null;
    }
  }

  function resetWorker(): void {
    const current = worker;
    worker = null;
    if (current) current.terminate();
  }

  function pump(): void {
    if (!pending) return;
    const next = pending;
    pending = null;
    if (next.epoch !== epoch) {
      next.reject(new StalePipelineResultError());
      return;
    }
    dispatch(next);
  }

  function dispatch(job: ClientJob): void {
    const active = ensureWorker();
    if (!active) {
      try {
        job.resolve(runPipeline(job.request));
      } catch (error) {
        job.reject(error);
      }
      return;
    }

    inFlight = job;
    const message: PipelineJobRequest = { jobId: job.jobId, request: job.request };
    try {
      active.postMessage(message);
    } catch (error) {
      inFlight = null;
      resetWorker();
      job.reject(error);
      pump();
    }
  }

  function onMessage(source: Worker, event: MessageEvent): void {
    if (source !== worker) return;
    const response = event.data as PipelineResponse;
    const job = inFlight;
    if (!job || response.jobId !== job.jobId) return;

    inFlight = null;
    if (response.ok) {
      if (job.epoch !== epoch || job.jobId !== latestJobId) {
        job.reject(new StalePipelineResultError());
      } else {
        job.resolve({ grid: response.grid });
      }
    } else {
      job.reject(new Error(response.error));
      resetWorker();
    }
    pump();
  }

  function onWorkerError(source: Worker): void {
    if (source !== worker) return;
    const job = inFlight;
    inFlight = null;
    resetWorker();
    if (job) job.reject(new Error('Pipeline worker failed'));
    pump();
  }

  return {
    process(request: PipelineRequest): Promise<PipelineResult> {
      const jobId = ++jobCounter;
      latestJobId = jobId;

      return new Promise<PipelineResult>((resolve, reject) => {
        const job: ClientJob = { jobId, epoch, request, resolve, reject };
        if (inFlight) {
          if (pending) pending.reject(new StalePipelineResultError());
          pending = job;
          return;
        }
        dispatch(job);
      });
    },

    invalidate(): void {
      epoch += 1;
      if (pending) {
        pending.reject(new StalePipelineResultError());
        pending = null;
      }
      if (inFlight) {
        const job = inFlight;
        inFlight = null;
        resetWorker();
        job.reject(new StalePipelineResultError());
      }
    },

    dispose(): void {
      epoch += 1;
      const outstanding = [inFlight, pending];
      inFlight = null;
      pending = null;
      resetWorker();
      mode = 'sync';
      for (const job of outstanding) job?.reject(new StalePipelineResultError());
    },
  };
}
