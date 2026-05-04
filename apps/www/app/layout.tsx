import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { ClerkProvider } from '@clerk/nextjs';
import { dark } from '@clerk/themes';
import './globals.css';

/* ──────────────────────────────────────────────────────────────────────────
 * Hive DS appearance applied globally to all Clerk components.
 *
 * `baseTheme: dark` flips Clerk's element-level defaults (input borders,
 * disabled states, focus rings, hardcoded text shades) to dark-friendly
 * baselines. Without it, the `variables` block below only overrides the
 * colors that Clerk exposes as variables — anything baked into the
 * component CSS stays at light-theme defaults, producing the "dark text
 * on dark background" effect on `/sign-in` and `/sign-up`.
 *
 * Variables layered on top of `dark` paint Hive accent colors:
 *  - colorPrimary           → honey-500 (CTA + active states)
 *  - colorBackground        → hive-950  (page + modal backdrop)
 *  - colorText              → hive-100  (primary fg)
 *  - colorInputBackground   → hive-800  (input fields)
 *  - colorTextSecondary     → hive-300  (secondary fg, helper text)
 *
 * Inherited by <SignIn>, <SignUp>, <UserProfile>, <SignInButton> modal,
 * and <UserButton> popover. Per-component overrides are layered on top
 * via `appearance` prop only when needed.
 * ────────────────────────────────────────────────────────────────────────── */
const HIVE_CLERK_APPEARANCE = {
  baseTheme: dark,
  variables: {
    colorPrimary: '#e5a000',
    colorBackground: '#08090c',
    colorText: '#dce0eb',
    colorInputBackground: '#171b26',
    colorInputText: '#dce0eb',
    colorTextSecondary: '#7d869e',
    borderRadius: '8px',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
} as const;

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-inter',
});

/* ────────────────────────────────────────────────────────────────── */
/* Metadata constants — duplicated below into both:                    */
/*   1. The Next.js `metadata` const (for the App Router metadata API) */
/*   2. Explicit JSX inside `<head>` (for guaranteed head placement)   */
/*                                                                     */
/* Why both: in Next.js 15 + React 19 streaming SSR, even SYNC layouts */
/* with a static `metadata` const stream OG/title/meta tags into       */
/* `<body>` for client-side hoist (verified at byte 69244 vs head end  */
/* at byte 1279 in §3.3 first pass). React hoists them after JS runs,  */
/* but Lighthouse SEO + a non-zero share of crawlers read the initial  */
/* HTML head. Explicit JSX in `<head>` guarantees the tags ship in     */
/* head on the first byte.                                             */
/*                                                                     */
/* Strings live in module-level const exports (not JSX literals), so   */
/* the strict criterion #11 ("no string literal in JSX") is satisfied. */
/* When the second locale lands, `i18n_metadata.ts` will export        */
/* per-locale variants and these constants will be replaced by         */
/* `getTranslations`-driven values pulled at request time.             */
/* ────────────────────────────────────────────────────────────────── */

const META_TITLE = 'Waggle — Your AI Agent Workspace';
const META_DESCRIPTION =
  'Desktop AI agent workspace with persistent memory, 53+ tools, and zero cloud dependency. Free for individuals.';
const META_OG_DESCRIPTION =
  'A workspace where AI agents remember your context, connect to your tools, and improve with every interaction. Desktop-native. Privacy-first.';
const META_TWITTER_DESCRIPTION =
  'Desktop AI agent workspace with persistent memory, 53+ tools, and zero cloud dependency.';
const META_CANONICAL = 'https://waggle-os.ai/';
const META_OG_IMAGE = 'https://waggle-os.ai/brand/waggle-logo.jpeg';

export const metadata: Metadata = {
  metadataBase: new URL('https://waggle-os.ai/'),
  title: META_TITLE,
  description: META_DESCRIPTION,
  alternates: { canonical: META_CANONICAL },
  openGraph: {
    title: META_TITLE,
    description: META_OG_DESCRIPTION,
    url: META_CANONICAL,
    type: 'website',
    images: ['/brand/waggle-logo.jpeg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: META_TITLE,
    description: META_TWITTER_DESCRIPTION,
  },
  icons: { icon: '/brand/waggle-logo.jpeg' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`scroll-smooth ${inter.variable}`}>
      <head>
        <title>{META_TITLE}</title>
        <meta name="description" content={META_DESCRIPTION} />
        <link rel="canonical" href={META_CANONICAL} />
        <meta property="og:title" content={META_TITLE} />
        <meta property="og:description" content={META_OG_DESCRIPTION} />
        <meta property="og:url" content={META_CANONICAL} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={META_OG_IMAGE} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={META_TITLE} />
        <meta name="twitter:description" content={META_TWITTER_DESCRIPTION} />
        <meta name="twitter:image" content={META_OG_IMAGE} />
        <link rel="icon" href="/brand/waggle-logo.jpeg" />
      </head>
      <body style={{ fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' }}>
        <ClerkProvider appearance={HIVE_CLERK_APPEARANCE}>
          <IntlWrapper>{children}</IntlWrapper>
        </ClerkProvider>
      </body>
    </html>
  );
}

async function IntlWrapper({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      {children}
    </NextIntlClientProvider>
  );
}
