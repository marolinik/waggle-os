import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import './globals.css';

/**
 * Root layout for the Waggle landing page (Next.js 15 App Router + next-intl).
 *
 * Owns the `<html>` and `<body>` shells, global stylesheet import, and the
 * Inter font CDN bootstrap. Wraps all children with `<NextIntlClientProvider>`
 * so client components can call `useTranslations()` without hydrating
 * messages per-component.
 *
 * Open Graph + Twitter + canonical metadata strings live in
 * `messages/en.json` under `landing.metadata.*`.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('landing.metadata');
  return {
    metadataBase: new URL('https://waggle-os.ai/'),
    title: t('title'),
    description: t('description'),
    alternates: { canonical: 'https://waggle-os.ai/' },
    openGraph: {
      title: t('og_title'),
      description: t('og_description'),
      url: 'https://waggle-os.ai/',
      type: 'website',
      images: ['/brand/waggle-logo.jpeg'],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('twitter_title'),
      description: t('twitter_description'),
    },
    icons: { icon: '/brand/waggle-logo.jpeg' },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className="scroll-smooth">
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
      <body>
        <NextIntlClientProvider messages={messages} locale={locale}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
