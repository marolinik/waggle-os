# CC-1 Brief — Apps/www Next.js Port + DS Retrofit + Production Bootstrap

**Date**: 2026-04-25 (autored late evening 2026-04-24 dok Marko spava)
**Status**: Scope B ratified by Marko ("c da slazem se"), full port + bootstrap delegated
**Authorized by**: Marko Marković ("i sve sam guraj sad, sam odlucuj")
**PM**: claude-opus-4-7 (Cowork)
**Scope**: Migrate apps/www from Vite SPA to Next.js 14+ App Router, retrofit DS spec (Stage 1+2+3+light), bootstrap production infrastructure (auth, API routes, Stripe, analytics, i18n, SEO)

---

## §0 Pre-flight context

**Existing apps/www state** (auditован 2026-04-24):

Stack:
- Vite 6.3.5 + React 19.1.0 + TypeScript 5.9.3
- No Tailwind, no UI library — plain CSS sa custom properties u `src/styles/globals.css`
- Lucide-react za ikonice
- Vitest za testing
- npm scripts: `dev` / `build` / `preview` / `test` / `test:watch`

Komponente (sve u `src/components/`):
- `Navbar` — top nav
- `Hero` — h1 "AI Agents That Remember", 2 download CTAs (Windows + macOS GitHub releases), bee-orchestrator hero illustration, honey glow background
- `Features` — TBD audit
- `CrownJewels` — TBD audit
- `HowItWorks` — TBD audit
- `Pricing` — **FUNCTIONAL Stripe checkout integration** sa 3 tiera (FREE/PRO $19/TEAMS $49), API endpoint `https://cloud.waggle-os.ai/api/stripe/create-checkout-session`, "Most Popular" badge na PRO
- `Enterprise` — TBD audit
- `BetaSignup` — TBD audit
- `BrandPersonasCard` — sa Vitest test coverage
- `Footer` — TBD audit

Stilski pristup: **inline styles sa CSS var refs** (e.g., `style={{ color: 'var(--honey-500)' }}`). CSS vars u `globals.css` već usklađeni sa DS Stage 1 dark tokens (hive-50 do hive-950, honey-300/400/500/600, status-ai/healthy, shadow-honey/elevated). **NEMA `[data-theme="light"]` block** — light mode treba dodati per DS Stage 4.

Public assets (`public/brand/`):
- 13 bee personas u light + dark variants (.png)
- 16 app icons u light + dark variants (.jpeg)
- hex-texture-light.png + hex-texture-dark.png
- logo.jpeg + logo-light.jpeg
- Backup folders sa older bee assets (mogu biti deleted post-port)

Test setup:
- `__tests__/setup.ts`
- `__tests__/BrandPersonasCard.test.tsx`
- `vitest.config.ts`

Routing: **single-page** (App.tsx renderuje sve komponente sequential, no React Router). Section IDs: hero, features, crown-jewels, how-it-works, pricing, enterprise, beta-signup, footer.

---

## §1 Migration target — Next.js 14 App Router

### §1.1 Stack target

```json
{
  "name": "waggle-www",
  "private": true,
  "version": "0.3.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "lucide-react": "^0.577.0"
  },
  "devDependencies": {
    "@types/node": "^22.x",
    "@types/react": "^19.1.8",
    "@types/react-dom": "^19.1.6",
    "typescript": "^5.9.3",
    "vitest": "^2.x",
    "@vitejs/plugin-react": "^4.7.0",
    "happy-dom": "^15.x"
  }
}
```

Ne koristiti Tailwind — postojeći CSS vars patternd radi i mapira na DS. Retain.

### §1.2 Folder structure target

```
apps/www/
├── app/                           # Next.js App Router
│   ├── layout.tsx                 # Root layout sa <html lang="en" data-theme="dark">
│   ├── page.tsx                   # Landing home (port App.tsx → server component sa client island-ima)
│   ├── globals.css                # Import postojeći styles/globals.css + dodati [data-theme="light"] block
│   ├── pricing/
│   │   └── page.tsx              # Standalone pricing page za direct linking
│   ├── api/
│   │   ├── stripe/
│   │   │   └── checkout/
│   │   │       └── route.ts       # POST /api/stripe/checkout — replace external cloud.waggle-os.ai
│   │   ├── waitlist/
│   │   │   └── route.ts           # POST /api/waitlist — beta signup endpoint
│   │   └── analytics/
│   │       └── route.ts           # POST /api/analytics — anonymous event collection
│   ├── (legal)/
│   │   ├── privacy/page.tsx
│   │   ├── terms/page.tsx
│   │   └── cookies/page.tsx
│   ├── opengraph-image.png        # OG fallback image
│   ├── twitter-image.png          # Twitter card
│   ├── icon.png                   # Favicon
│   └── apple-icon.png
├── components/                    # All client components (with "use client" header)
│   ├── Navbar.tsx
│   ├── Hero.tsx                   # Server component (static content)
│   ├── Features.tsx               # Server component
│   ├── CrownJewels.tsx
│   ├── HowItWorks.tsx
│   ├── Pricing.tsx                # CLIENT (useState za loading, useCallback za checkout)
│   ├── Enterprise.tsx
│   ├── BetaSignup.tsx             # CLIENT (form state)
│   ├── BrandPersonasCard.tsx      # Server (static render)
│   ├── Footer.tsx
│   ├── ThemeToggle.tsx            # NEW — Auto/Light/Dark toggle, sets data-theme on <html>
│   └── CookieBanner.tsx           # NEW — GDPR consent
├── lib/
│   ├── stripe.ts                  # Server-side Stripe client init
│   ├── analytics.ts               # Client-side event tracking
│   ├── i18n.ts                    # Locale detection + helpers
│   └── theme.ts                   # data-theme persistence (localStorage waggle.theme)
├── data/
│   └── personas.ts                # Move from src/data
├── public/
│   ├── brand/                     # Same as before — assets kept
│   └── robots.txt                 # NEW
├── messages/                      # i18n locale strings (English first)
│   └── en.json
├── middleware.ts                  # i18n routing + locale detection
├── next.config.mjs                # Next.js config
├── tsconfig.json                  # Updated paths
├── vitest.config.ts               # Adjust for Next.js
└── package.json
```

### §1.3 Per-component port plan

**Server components** (no "use client", static render):
- `Hero` — replace `<img src="brand/...">` with `next/image` for optimization. Add LCP priority hint.
- `Features` — verify static; if has hover state, mark as client.
- `CrownJewels` — same pattern.
- `HowItWorks` — same.
- `Enterprise` — same.
- `BrandPersonasCard` — uses static personas data; server component.
- `Footer` — static.

**Client components** (need "use client" directive):
- `Navbar` — likely has scroll-aware state, mobile menu toggle.
- `Pricing` — uses `useRef`, `useEffect` (IntersectionObserver), `useState` (loading), `useCallback` (Stripe checkout). All client-side. Update fetch URL from `https://cloud.waggle-os.ai/api/stripe/create-checkout-session` to **internal** `/api/stripe/checkout`.
- `BetaSignup` — form state, submission loading, success/error UI. Update endpoint to internal `/api/waitlist`.
- `ThemeToggle` (NEW) — `useState` + `useEffect` za localStorage sync + `document.documentElement.setAttribute('data-theme', mode)`.
- `CookieBanner` (NEW) — consent state.

### §1.4 Path mapping (asset references)

- `<img src="brand/bee-orchestrator-dark.png">` → `<Image src="/brand/bee-orchestrator-dark.png" width={176} height={176} priority />`
- All `public/brand/*` references stay relative to public root.
- CSS `url("data:image/svg+xml,...")` honeycomb pattern stays inline u globals.css.

---

## §2 DS retrofit — light/dark mode + Stage 4 tokens

### §2.1 globals.css augmentation

Postojeći `:root` block sadrži dark tokens. Dodaj `[data-theme="light"]` block sa Stage 4 light tokens:

```css
[data-theme="light"] {
  --hive-950: #fafaf7;  /* swap top */
  --hive-900: #f0ede5;
  --hive-850: #e8e3d6;
  --hive-800: #d8d2c1;
  --hive-700: #b8b0a0;
  --hive-600: #8a8073;
  --hive-500: #6b6359;
  --hive-400: #4a443e;
  --hive-300: #2c2724;
  --hive-200: #1a1815;
  --hive-100: #0e0c0a;
  --hive-50: #1a1815;  /* swap bottom — used as fg */
  
  --honey-600: #8e6912;  /* darker for AAA on light */
  --honey-500: #b8821f;  /* recalibrated AAA on cream */
  --honey-400: #c4a418;
  --honey-300: #e0c869;
  --honey-glow: rgba(184, 130, 31, 0.15);
  --honey-pulse: rgba(184, 130, 31, 0.08);
  
  --status-ai: #6b46c1;
  --status-healthy: #059669;
  
  --shadow-honey: 0 0 24px rgba(184, 130, 31, 0.18), 0 0 4px rgba(184, 130, 31, 0.10);
  --shadow-elevated: 0 4px 16px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04);
}
```

### §2.2 Theme toggle component

`components/ThemeToggle.tsx`:

```tsx
"use client";
import { useState, useEffect } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

type Mode = 'auto' | 'light' | 'dark';

export default function ThemeToggle() {
  const [mode, setMode] = useState<Mode>('auto');

  useEffect(() => {
    const stored = localStorage.getItem('waggle.theme') as Mode | null;
    setMode(stored ?? 'auto');
  }, []);

  useEffect(() => {
    const apply = (m: Mode) => {
      const effective = m === 'auto'
        ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
        : m;
      document.documentElement.setAttribute('data-theme', effective);
    };
    apply(mode);
    localStorage.setItem('waggle.theme', mode);

    if (mode === 'auto') {
      const mq = window.matchMedia('(prefers-color-scheme: light)');
      const handler = () => apply(mode);
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [mode]);

  return (
    <div className="theme-toggle">
      <button onClick={() => setMode('auto')} aria-label="Auto mode" data-active={mode === 'auto'}>
        <Monitor size={16} />
      </button>
      <button onClick={() => setMode('light')} aria-label="Light mode" data-active={mode === 'light'}>
        <Sun size={16} />
      </button>
      <button onClick={() => setMode('dark')} aria-label="Dark mode" data-active={mode === 'dark'}>
        <Moon size={16} />
      </button>
    </div>
  );
}
```

Place `<ThemeToggle />` u Navbar desno (visible on all pages).

### §2.3 Asset variant resolution

Bee personas, app icons, hex texture imaju light + dark variants. Dodati helper:

```tsx
import { useTheme } from '@/lib/theme';

const theme = useTheme();
const beeAsset = `/brand/bee-orchestrator-${theme}.png`;
```

Za Hero specifically: switch bee asset on theme change (orchestrator-dark vs orchestrator-light).

---

## §3 Bootstrap items — production infrastructure

### §3.1 API routes

#### `/api/stripe/checkout` (POST)
- Replace external `https://cloud.waggle-os.ai/api/stripe/create-checkout-session`
- Server-side init Stripe client sa `STRIPE_SECRET_KEY` env var
- Body: `{ tier: 'PRO' | 'TEAMS', billingPeriod: 'monthly' | 'annual' }`
- Returns: `{ url: string }` (Stripe Checkout Session URL)
- Error: `{ message: string }` 400/500
- Use Stripe Price IDs from env (`STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_TEAMS_MONTHLY`, etc.)

#### `/api/waitlist` (POST)
- Body: `{ email: string, persona?: string, source?: string }`
- Validate email format
- Store: forward to Resend / Supabase / Postmark — choose one (Marko: pick what's cheapest, suggest Resend for now)
- Returns: `{ success: boolean }`
- Rate limit: 5 requests/min per IP

#### `/api/analytics` (POST)
- Body: `{ event: string, properties: Record<string, unknown>, anonymous_id: string }`
- Anonymous events only (no PII unless user opted in via cookie consent)
- Forward to PostHog or Plausible — Marko pick (PostHog je in tools list, prefer)
- Returns: `{ accepted: boolean }`

### §3.2 Cookie consent + GDPR

`components/CookieBanner.tsx`:
- Show on first visit
- 3 options: "Accept all", "Necessary only", "Customize"
- Store consent: `localStorage.setItem('waggle.consent', JSON.stringify({...}))`
- Categories: necessary (always on), analytics (opt-in), marketing (opt-in)
- Render bottom-fixed sa backdrop blur na dark / soft drop shadow na light

### §3.3 Legal pages

`app/(legal)/privacy/page.tsx`, `terms/page.tsx`, `cookies/page.tsx`:
- Markdown-driven content (lib/markdown.ts helper)
- Static generation (export const dynamic = 'force-static')
- Linked from Footer + CookieBanner

Privacy text seed: koristi `pm-toolkit:privacy-policy` skill output kao starting draft, manual review pre publish-a.

### §3.4 SEO + metadata

`app/layout.tsx`:

```tsx
export const metadata: Metadata = {
  metadataBase: new URL('https://waggle-os.ai'),
  title: {
    default: 'Waggle — AI Agents That Remember',
    template: '%s · Waggle'
  },
  description: 'A workspace where AI agents remember your context, connect to your tools, and improve with every interaction. Desktop-native. Privacy-first. Local-first cognitive layer with bitemporal memory.',
  keywords: ['AI memory', 'cognitive layer', 'local-first AI', 'EU AI Act', 'GDPR AI', 'bitemporal knowledge graph', 'MCP protocol', 'agent harness'],
  authors: [{ name: 'Egzakta Group' }],
  openGraph: {
    type: 'website',
    siteName: 'Waggle',
    images: [{ url: '/opengraph-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/twitter-image.png'],
    creator: '@waggle_os',
  },
  robots: { index: true, follow: true },
  alternates: {
    canonical: '/',
    languages: { 'en': '/' },  // expand on i18n rollout
  },
};
```

`public/robots.txt`:
```
User-agent: *
Allow: /
Disallow: /api/

Sitemap: https://waggle-os.ai/sitemap.xml
```

`app/sitemap.ts`:
```tsx
import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://waggle-os.ai', lastModified: new Date(), priority: 1.0 },
    { url: 'https://waggle-os.ai/pricing', lastModified: new Date(), priority: 0.8 },
    { url: 'https://waggle-os.ai/privacy', lastModified: new Date(), priority: 0.3 },
    { url: 'https://waggle-os.ai/terms', lastModified: new Date(), priority: 0.3 },
  ];
}
```

### §3.5 i18n scaffolding (English first)

Install `next-intl` (recommended for App Router):
```
pnpm add next-intl
```

Locale routing: `/[locale]/...` ali za MVP samo English live, infrastruktura ready za sledeće lokale (DE, FR, ES) bez code rewrite.

`middleware.ts`:
```ts
import createMiddleware from 'next-intl/middleware';
export default createMiddleware({
  locales: ['en'],
  defaultLocale: 'en',
});
export const config = { matcher: ['/((?!api|_next|.*\\..*).*)'] };
```

`messages/en.json` — extract user-facing strings iz komponenti (Hero h1, CTA labels, pricing tier names, BetaSignup form copy). Per `feedback_i18n_landing_policy.md`: engleski first, locale-ready infra predefinisana.

### §3.6 Build + deploy

**Recommended host**: **Vercel** (zero-config Next.js, native preview deploys, edge runtime za API routes, integrated analytics)

Alternative: **Cloudflare Pages** (cheaper za high traffic, edge-first)

Env vars u Vercel dashboard:
- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_TEAMS_MONTHLY`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY` (ili Postmark/Supabase ekvivalent)
- `POSTHOG_PROJECT_KEY`
- `POSTHOG_HOST`
- `NEXT_PUBLIC_POSTHOG_KEY` (client-side init)

`next.config.mjs`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};
export default nextConfig;
```

---

## §4 Wireframe v1.1 LOCKED gap analysis

Per `project_landing_wireframe_v11_locked_2026_04_22` memory, wireframe v1.1 specifies sections:

| Wireframe section | Existing component? | Action |
|---|---|---|
| Hero with KPI counter | Hero.tsx (no KPI counter yet) | **Augment** — add KPI counter sa "X memories preserved", "Y agents running", real-time API call ili static placeholder |
| Why-now hook | NOT PRESENT | **Add** new section between Hero and Features — narrative hook ("AI without memory is groundhog day") |
| Three-product columns | NOT PRESENT (Features may overlap) | **Add or refactor** — "hive-mind (OSS) / Waggle (consumer) / KVARK (enterprise)" 3-column architecture overview |
| How-it-works | HowItWorks.tsx | Verify content matches v1.1 spec |
| Pricing 3-tier | Pricing.tsx | ✓ Functional, **integrate with internal API route** |
| Personas grid 13 bees | BrandPersonasCard.tsx (single card) | **Augment** — add full 13-grid section pre BetaSignup |
| FAQ | NOT PRESENT | **Add** new FAQ section (5-7 questions: pricing, privacy, EU AI Act, MCP, OSS) |
| Founder note | NOT PRESENT | **Add** "From the team" section with Marko's photo + short narrative |
| CTA | Hero CTAs + Pricing CTAs + BetaSignup | Sufficient |
| Footer | Footer.tsx | Verify links: Privacy, Terms, Cookies, Twitter, GitHub, Discord (TBD) |

---

## §5 Test migration

Existing `__tests__/BrandPersonasCard.test.tsx` + `__tests__/setup.ts` keep but adapt:
- Vitest config update (Next.js compatibility, may need `vitest-environment-vitest-pure` or `happy-dom`)
- Add component tests for: ThemeToggle, CookieBanner, Pricing checkout flow (mock Stripe), BetaSignup submission
- Add API route integration tests sa MSW (Mock Service Worker)

---

## §6 Sequential execution plan (12 commits suggested)

Commit 1: `[port] init Next.js 15 scaffold, retain Vite parallel for rollback`
Commit 2: `[port] migrate components to Next.js with use client where needed`
Commit 3: `[port] move src/styles → app/globals.css + light mode tokens block`
Commit 4: `[port] ThemeToggle component + integrate u Navbar`
Commit 5: `[port] API routes — stripe checkout, waitlist, analytics`
Commit 6: `[port] middleware.ts + i18n scaffolding (en only live)`
Commit 7: `[port] legal pages (privacy/terms/cookies) + CookieBanner`
Commit 8: `[port] SEO metadata + sitemap + robots + OG/Twitter images`
Commit 9: `[port] add wireframe v1.1 missing sections (WhyNow + ThreeProducts + PersonasGrid + FAQ + FounderNote)`
Commit 10: `[port] update tests + add new component coverage`
Commit 11: `[port] build verification + Vercel deploy config`
Commit 12: `[port] retire Vite scaffolding (delete vite.config.ts, src/main.tsx etc.) — POST-VERIFICATION`

Commit 1-11: incremental, ne bocе vam working state.
Commit 12: cleanup, tek posle visual + functional QA na deployed staging URL.

---

## §7 Halt criteria + budget

- **Budget**: $0 (no API calls during port — codegen only). Stripe + Resend + PostHog incur $0 setup, pay-per-use after launch.
- **Wall-clock**: 8-12h CC-1 work realistic za scratch port + bootstrap. Marko može da paste-uje brief u CC-1 kad SOTA padne, paralelno sa Gate D exit + claim-narrative work.
- **Halt triggers**:
  - Vite cleanup (Commit 12) — only after staging deploy verified by Marko visual review
  - Live env vars (Stripe Production keys) — Marko populates u Vercel dashboard, not in code
  - Domain DNS cutover (waggle-os.ai → Vercel) — Marko handles
- **Rollback**: Commits 1-11 keep Vite scaffolding present, can `git revert` and rebuild Vite if Next.js port has unforeseen issue. Commit 12 is one-way.

---

## §8 PM signals to watch

- "use client" overuse (every component) — sign of confused server/client split, code review pass needed
- CSS regression na light mode toggle — visual diff vs DS Stage 4 spec
- Stripe checkout flow break — manual test sa test card 4242 4242 4242 4242 pre prod
- SEO meta validation — `next build` output check za canonical URLs, OG images
- Lighthouse score baseline — target ≥90 Performance, ≥95 Accessibility, ≥100 Best Practices, ≥95 SEO

---

## §9 Authorized by

PM Marko Marković, 2026-04-24 evening, full execution delegated ("i sve sam guraj sad, sam odlucuj, ja odoh da spavam citam ujutro sta si sve uradio").

CC-1 može da počne kad benchmark završi i SOTA narrative ratifikuje, ili paralelno ako ima dovoljno context-a (Vite stack je read-only audit, port je clean greenfield Next.js).

Brief je deterministic — sve odluke arhitekture su uzete u brief-u, no clarifying questions needed.

---

## §10 Companion deliverables (paralelno sa ovim brief-om)

PM (claude-opus-4-7) overnight produces:
1. `briefs/2026-04-25-launch-comms-templates.md` — multi-asset suite (technical blog post, LinkedIn, Twitter, hive-mind announcement, waitlist email, press kit)
2. `briefs/e2e-persona-tests/2026-04-25-e2e-persona-test-matrix.md` — 9-archetype × scenarios test matrix (3 monetization tier × 3 user proficiency)
3. `decisions/2026-04-25-overnight-pm-execution-log.md` — what was completed overnight, decision rationale, open items za Marko ujutru

Sve čekaju Marka u 2026-04-25 ujutru za review.
