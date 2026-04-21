import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import BrandPersonasCard from '../../../components/BrandPersonasCard';
import '../../../styles/globals.css';

/**
 * Isolated preview route for `BrandPersonasCard` landing variant.
 *
 * Served at `/waggle/design-personas.html` in dev + prod (no nav chrome).
 * Used for visual QA, hand-off to design, and canonical reference. Not linked
 * from the main landing — discovery is URL-only, and robots are disallowed
 * via the `<meta name="robots">` tag in the companion HTML entry.
 */
const mountEl = document.getElementById('root');
if (!mountEl) {
  throw new Error('Missing #root — expected in design-personas.html');
}

createRoot(mountEl).render(
  <StrictMode>
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--hive-950, #08090c)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
      }}
    >
      <BrandPersonasCard variant="landing" />
    </main>
  </StrictMode>,
);
