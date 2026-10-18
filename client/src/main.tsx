import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { applyTheme, cachedTheme } from './lib/theme';

// aplica o último tema antes de renderizar (evita piscar o tema padrão)
applyTheme(cachedTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
