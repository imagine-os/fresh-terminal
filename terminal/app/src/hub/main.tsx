import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HubRoot } from './HubRoot';
import './hub.css';

const root = document.getElementById('hub');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <HubRoot />
    </StrictMode>,
  );
}
