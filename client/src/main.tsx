import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { StagingBadge } from './components/StagingBadge';
import { TitleBar } from './components/TitleBar';
import './index.css';
import './lib/pwa';
import { getToken } from './lib/api';
import { applyTheme, cachedTheme, DEFAULT_THEME } from './lib/theme';
import { STAGING, markStagingTitle } from './lib/staging';

// aplica o último tema antes de renderizar (evita piscar o tema padrão);
// sem login, a tela de entrada fica sempre com as cores da marca
applyTheme(getToken() ? cachedTheme() : DEFAULT_THEME);
if (STAGING) markStagingTitle();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary area="app">
      <App />
    </ErrorBoundary>
    <StagingBadge />
    <TitleBar />
  </StrictMode>,
);
