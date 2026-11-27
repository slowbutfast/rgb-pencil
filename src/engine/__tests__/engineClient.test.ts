import { describe, expect, it } from 'vitest';

import { createLocalEngineClient } from '../engineClient';
import { matchGrid } from '../matcher';
import {
  DEFAULT_SETTINGS,
  type PipelineSettings,
  type SourceImage,
} from '../../types/pipeline';

function uniformImage(width: number, height: number, rgb: readonly [number, number, number]): SourceImage {
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

describe('createLocalEngineClient', () => {
  it('resolves the same MatchedGrid as a direct engine call', async () => {
    const image = uniformImage(96, 72, [55, 130, 210]);
    const request = { image, settings: settings({ cols: 24, contrast: 1.45 }) };

    const client = createLocalEngineClient();
    const viaClient = await client.process(request);
    const direct = matchGrid(image, request.settings);

    expect(viaClient.grid).toEqual(direct);
    expect(viaClient.grid.ri).toHaveLength(direct.cols * direct.rows);
  });

  it.each([15, 97])('rejects width %s outside 16-96', async (cols) => {
    const client = createLocalEngineClient();
    await expect(
      client.process({ image: uniformImage(32, 32, [1, 2, 3]), settings: settings({ cols }) }),
    ).rejects.toThrow(RangeError);
  });
});
