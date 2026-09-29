import '@fontsource-variable/inter';
import './hub/hub.css';
import './global.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { HubShell } from './hub/HubShell';

const container = document.getElementById('root');
if (!container) throw new Error('index.html is missing #root');

createRoot(container).render(
  <StrictMode>
    <HubShell>
      <App />
    </HubShell>
  </StrictMode>,
);
