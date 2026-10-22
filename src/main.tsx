import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const container = document.getElementById('root')!;
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

// The production HTML is prerendered, so React attaches to it instead of re-drawing the page.
if (container.firstElementChild) hydrateRoot(container, app);
else createRoot(container).render(app);
