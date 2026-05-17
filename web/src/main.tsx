import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ThemeProvider } from './lib/theme';
import './index.css';

// Dev-only: statically excluded from production bundles via import.meta.env.DEV.
const DevTweaks = import.meta.env.DEV ? lazy(() => import('./components/dev/TweaksPanel')) : null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <App />
        {DevTweaks && (
          <Suspense fallback={null}>
            <DevTweaks />
          </Suspense>
        )}
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
