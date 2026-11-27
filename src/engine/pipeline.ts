import { matchGrid } from './matcher';
import type {
  MatchedGrid,
  PipelineRequest,
  PipelineResult,
} from '../types/pipeline';

/**
 * Integer version of the pure pipeline. Persisted projects record it so a
 * future algorithm change can be detected without discarding the drawing.
 */
export const PIPELINE_VERSION = 1;

/**
 * The single pure pipeline: downsample → contrast → 125-combo match → dither,
 * plus the source fingerprint. Width validation happens in the matcher and
 * throws a `RangeError` for anything outside 16–96.
 */
export function runPipeline(request: PipelineRequest): PipelineResult {
  return { grid: matchGrid(request.image, request.settings) };
}

/** Buffers the worker transfers instead of cloning. */
export function gridTransferables(grid: MatchedGrid): ArrayBuffer[] {
  return [
    grid.ri.buffer as ArrayBuffer,
    grid.gi.buffer as ArrayBuffer,
    grid.bi.buffer as ArrayBuffer,
    grid.deltaE.buffer as ArrayBuffer,
    grid.target.buffer as ArrayBuffer,
  ];
}
