import './styles/tokens.css';
import './styles/main.css';

import { createWorkerEngineClient } from './engine/pipelineClient';
import { renderSampleScene } from './engine/sampleScenes';
import { createGridStore } from './store/gridStore';
import { mountDropZone, readImageElement } from './ui/dropZone';
import { mountGridCanvas } from './ui/gridCanvas';
import { mountInspectorSidebar } from './ui/inspectorSidebar';
import { mountSettingsPopover } from './ui/settingsPopover';
import { mountTopBar } from './ui/topBar';

const client = createWorkerEngineClient();

function sampleImage() {
  return readImageElement(renderSampleScene('tree'));
}

async function boot(): Promise<void> {
  const store = createGridStore({ client, sampleImage });

  // Resume the last project (image, settings, completed cells) before mounting
  // the grid, so the first paint already matches the paper drawing. The sample
  // scene is only loaded when no project exists.
  const resumed = await store.resumeLastProject();
  if (!resumed) {
    const sample = sampleImage();
    if (sample) await store.loadImage(sample, { name: 'Sample scene' });
  }

  mountGridCanvas(document.body, store);
  mountInspectorSidebar(document.body, store);
  mountTopBar(document.body, store);
  mountSettingsPopover(document.body, store);
  mountDropZone(document.body, store);

  window.addEventListener('pagehide', () => {
    void (async () => {
      await store.flushNow();
      store.dispose();
      client.dispose();
    })();
  });
}

void boot();
