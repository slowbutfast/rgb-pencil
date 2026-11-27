import { gridTransferables, runPipeline } from '../engine/pipeline';
import type { PipelineJobRequest, PipelineResponse } from '../types/pipeline';

/**
 * Thin module-worker adapter: one message in, one response out, result typed
 * arrays transferred zero-copy. All behaviour lives in `runPipeline`.
 */
export function handlePipelineJob(job: PipelineJobRequest): PipelineResponse {
  try {
    const { grid } = runPipeline(job.request);
    return { ok: true, jobId: job.jobId, grid };
  } catch (error) {
    return {
      ok: false,
      jobId: job.jobId,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<PipelineJobRequest>) => void) | null;
  postMessage(message: PipelineResponse, transfer?: Transferable[]): void;
}

const scope = globalThis as unknown as WorkerScope;

scope.onmessage = (event: MessageEvent<PipelineJobRequest>): void => {
  const response = handlePipelineJob(event.data);
  if (response.ok) scope.postMessage(response, gridTransferables(response.grid));
  else scope.postMessage(response);
};
