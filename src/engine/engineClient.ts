import { matchGrid } from './matcher';
import type {
  EngineClient,
  PipelineRequest,
  PipelineResult,
} from '../types/pipeline';

/**
 * The only execution strategy shipped in this change: run the pure engine
 * synchronously on the calling thread and resolve. A worker or remote
 * implementation can replace this behind the same interface.
 */
export function createLocalEngineClient(): EngineClient {
  return {
    async process(request: PipelineRequest): Promise<PipelineResult> {
      return { grid: matchGrid(request.image, request.settings) };
    },
  };
}
