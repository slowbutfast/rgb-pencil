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
const store = createGridStore({ client });

mountGridCanvas(document.body, store);
mountInspectorSidebar(document.body, store);
mountTopBar(document.body, store);
mountSettingsPopover(document.body, store);
mountDropZone(document.body, store);

window.addEventListener('pagehide', () => client.dispose());

const defaultScene = readImageElement(renderSampleScene('tree'));
if (defaultScene) {
  void store.loadImage(defaultScene);
}
