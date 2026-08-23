import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import App from './App.tsx';
import './index.css';
import { applyStoredThemeEarly } from '@/providers/ThemeProvider';

export function mountApp(): void {
  // Apply the persisted theme before first paint to avoid a flash of the wrong
  // theme (warm graphite/dark default; warm paper for light).
  applyStoredThemeEarly();

  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error('Waggle root element is missing');
  flushSync(() => {
    createRoot(rootElement).render(<App />);
  });
  rootElement.dataset.waggleUiReady = 'ready';

  // Initialize PostHog cloud analytics (DAY0-04). Keep it off the startup path.
  void import('@/lib/posthog')
    .then(({ initPostHog }) => initPostHog())
    .catch(() => {});
}
