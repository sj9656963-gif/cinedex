import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installSparkleTexture } from './lib/sparkle';
import './styles/app.css';
import './styles/card.css';

installSparkleTexture();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
