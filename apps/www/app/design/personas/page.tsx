import type { Metadata } from 'next';
import BrandPersonasCard from '@/src/components/BrandPersonasCard';

/**
 * Isolated preview route for the `BrandPersonasCard` landing variant.
 *
 * Served at `/design/personas` (Next.js App Router). No nav chrome.
 * Used for visual QA, hand-off to design, and as the canonical reference.
 * Discovery is URL-only — not linked from the main landing, robots blocked
 * via the `metadata.robots` export below.
 *
 * `BrandPersonasCard` is a Client Component (uses `useState`/`useCallback`),
 * but this page itself is a Server Component — Next.js App Router supports
 * server→client composition, and the metadata export requires a server
 * component context.
 */
export const metadata: Metadata = {
  title: 'Waggle — Personas Preview',
  description:
    'Internal preview route for the BrandPersonasCard component. Not indexed.',
  robots: { index: false, follow: false },
};

export default function DesignPersonasPage() {
  return (
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
  );
}
