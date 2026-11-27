import { runPipeline } from './pipeline';
import type {
  EngineClient,
  PipelineRequest,
  PipelineResult,
} from '../types/pipeline';

/**
 * Synchronous main-thread implementation. Delegates to the exact same pure
 * `runPipeline` used by the worker and the worker-less fallback.
 */
export function createLocalEngineClient(): EngineClient {
  return {
    async process(request: PipelineRequest): Promise<PipelineResult> {
      return runPipeline(request);
    },
  };
}
