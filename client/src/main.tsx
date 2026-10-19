import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { getToken } from './lib/api';
import { applyTheme, cachedTheme, DEFAULT_THEME } from './lib/theme';

// aplica o último tema antes de renderizar (evita piscar o tema padrão);
// sem login, a tela de entrada fica sempre com as cores da marca
applyTheme(getToken() ? cachedTheme() : DEFAULT_THEME);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
