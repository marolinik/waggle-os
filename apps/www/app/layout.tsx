import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Hanken_Grotesk, JetBrains_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { ClerkProvider } from '@clerk/nextjs';
import { dark } from '@clerk/themes';
import './globals.css';

/* ──────────────────────────────────────────────────────────────────────────
 * Hive DS appearance applied globally to all Clerk components.
 * Values updated to the warm-Hive palette (PR8): hex literals reflect the
 * remapped scale (e.g. hive-950 = #0e0c07, hive-100 = #ece3d0, honey = #e9a52c).
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
// NOTE: do NOT use `as const` here. Clerk's `Appearance` type is a wide
// discriminated union; deeply-readonly literals from `as const` over-narrow
// it and at least one Clerk version silently dropped the `baseTheme` field
// when the prop value didn't match the expected mutable shape.
const HIVE_CLERK_APPEARANCE = {
  baseTheme: dark,
  variables: {
    colorPrimary: '#e9a52c',
    colorBackground: '#0e0c07',
    colorText: '#ece3d0',
    colorTextSecondary: '#c8bfa9',
    colorInputBackground: '#1f1a12',
    colorInputText: '#ece3d0',
    colorNeutral: '#c8bfa9',
    borderRadius: '8px',
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
  },
  // Belt-and-braces element-level overrides. apps/www does NOT use Tailwind
  // (vanilla CSS + custom properties only — see app/globals.css), so these
  // are CSSProperties objects, not className strings. Clerk's appearance API
  // accepts either form per element.
  //
  // Each entry targets a Clerk internal element key (stable API, see
  // https://clerk.com/docs/customization/appearance-prop). Values match
  // Hive DS hex literals so they survive SSR without needing CSS-var
  // resolution from a parent.
  elements: {
    card: {
      backgroundColor: '#0e0c07',
      border: '1px solid #272117',
      boxShadow: '0 4px 16px rgba(0,0,0,0.55), 0 2px 4px rgba(0,0,0,0.4)',
    },
    headerTitle: { color: '#ece3d0' },
    headerSubtitle: { color: '#c8bfa9' },
    socialButtonsBlockButton: {
      backgroundColor: '#1f1a12',
      border: '1px solid #4a4030',
      color: '#ece3d0',
    },
    socialButtonsBlockButtonText: { color: '#ece3d0' },
    socialButtonsBlockButtonArrow: { color: '#c8bfa9' },
    dividerLine: { backgroundColor: '#4a4030' },
    dividerText: { color: '#c8bfa9' },
    formFieldLabel: { color: '#d8cfba' },
    formFieldInput: {
      backgroundColor: '#1f1a12',
      border: '1px solid #4a4030',
      color: '#ece3d0',
    },
    formButtonPrimary: {
      backgroundColor: '#e9a52c',
      color: '#0e0c07',
      fontWeight: 600,
    },
    footerActionText: { color: '#c8bfa9' },
    footerActionLink: { color: '#e9a52c' },
    identityPreviewText: { color: '#ece3d0' },
    identityPreviewEditButton: { color: '#e9a52c' },
    // Modal-specific (the `<SignInButton mode="modal">` flow).
    modalContent: { backgroundColor: '#0e0c07' },
    modalCloseButton: { color: '#c8bfa9' },
  },
};

const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-hanken',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-mono',
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

const META_TITLE = 'Waggle — The AI workspace that remembers';
const META_DESCRIPTION =
  'Waggle is a local-first AI workspace with persistent memory. Your projects, decisions, and context compound across every model — Claude, GPT, Gemini, or a local model — and never leave your machine.';
const META_OG_DESCRIPTION =
  'A local-first AI workspace with persistent memory. Your context compounds across every model and stays on your machine.';
const META_TWITTER_DESCRIPTION = META_OG_DESCRIPTION;
const META_CANONICAL = 'https://waggle-os.ai/';
const META_OG_IMAGE = 'https://waggle-os.ai/brand/og.png';

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
    siteName: 'Waggle',
    images: [{ url: '/brand/og.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: META_TITLE,
    description: META_TWITTER_DESCRIPTION,
    images: [META_OG_IMAGE],
  },
};

/**
 * JSON-LD structured data. Facts only: Solo tier at $0, Team $49/seat/mo
 * (packages/shared/src/tiers.ts); Windows + macOS desktop app.
 */
const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: 'Waggle',
      operatingSystem: 'Windows, macOS',
      applicationCategory: 'ProductivityApplication',
      description: META_DESCRIPTION,
      url: META_CANONICAL,
      image: META_OG_IMAGE,
      offers: [
        { '@type': 'Offer', price: '0', priceCurrency: 'USD', name: 'Solo' },
        { '@type': 'Offer', price: '49', priceCurrency: 'USD', name: 'Team (per seat, monthly)' },
      ],
      publisher: { '@id': 'https://waggle-os.ai/#org' },
    },
    {
      '@type': 'Organization',
      '@id': 'https://waggle-os.ai/#org',
      name: 'Egzakta Group',
      url: 'https://egzakta.com',
    },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`scroll-smooth ${hanken.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Progressive enhancement flag: scroll-reveal styles only apply
            when JS runs (html.js gate in globals.css), so no-JS visitors
            and crawlers see every section fully rendered. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js')",
          }}
        />
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
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            // Static compile-time object (no user input); escape `<` per the
            // standard JSON-LD embedding guidance to rule out </script> breaks.
            __html: JSON.stringify(JSON_LD).replace(/</g, '\\u003c'),
          }}
        />
      </head>
      <body style={{ fontFamily: 'var(--sans)' }}>
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
