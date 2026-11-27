import './styles/tokens.css';
import './styles/main.css';

import { createLocalEngineClient } from './engine/engineClient';
import { renderSampleScene } from './engine/sampleScenes';
import { createGridStore } from './store/gridStore';
import { mountDropZone, readImageElement } from './ui/dropZone';
import { mountGridCanvas } from './ui/gridCanvas';
import { mountInspectorSidebar } from './ui/inspectorSidebar';
import { mountSettingsPopover } from './ui/settingsPopover';
import { mountTopBar } from './ui/topBar';

const store = createGridStore({ client: createLocalEngineClient() });

mountGridCanvas(document.body, store);
mountInspectorSidebar(document.body, store);
mountTopBar(document.body, store);
mountSettingsPopover(document.body, store);
mountDropZone(document.body, store);

const defaultScene = readImageElement(renderSampleScene('tree'));
if (defaultScene) {
  void store.loadImage(defaultScene);
}
