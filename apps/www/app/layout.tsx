import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

/**
 * Root layout for the Waggle landing page (Next.js 15 App Router).
 *
 * Owns the `<html>` and `<body>` shells, global stylesheet import, and the
 * Inter font CDN bootstrap (preserved verbatim from the legacy Vite
 * `index.html` to keep paint behaviour identical post-migration).
 *
 * Open Graph + Twitter + canonical metadata mirror the legacy `index.html`
 * tags; canonical URL switched from `marolinik.github.io/waggle/` to
 * `waggle-os.ai/` per CLAUDE.md §1 — confirm before launch.
 */
export const metadata: Metadata = {
  metadataBase: new URL('https://waggle-os.ai/'),
  title: 'Waggle — Your AI Agent Workspace',
  description:
    'Desktop AI agent workspace with persistent memory, 53+ tools, and zero cloud dependency. Free for individuals.',
  alternates: {
    canonical: 'https://waggle-os.ai/',
  },
  openGraph: {
    title: 'Waggle — Your AI Agent Workspace',
    description:
      'A workspace where AI agents remember your context, connect to your tools, and improve with every interaction. Desktop-native. Privacy-first.',
    url: 'https://waggle-os.ai/',
    type: 'website',
    images: ['/brand/waggle-logo.jpeg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Waggle — Your AI Agent Workspace',
    description:
      'Desktop AI agent workspace with persistent memory, 53+ tools, and zero cloud dependency.',
  },
  icons: {
    icon: '/brand/waggle-logo.jpeg',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
