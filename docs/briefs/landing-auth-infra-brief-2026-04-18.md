# Brief za Claude Code — Landing & Auth Infrastructure Gaps

**Datum**: 2026-04-18
**Izvor deep inspekcije**: HEAD 7c46d144 (nakon b4c54c68 snapshot-a), apps/www + apps/web + packages/server
**Status**: Čeka integraciju u nove sprintove posle trenutnog backlog-a Claude Code-a
**Gate**: Launch = Waggle + memorija zajedno, sa dokazima (LoCoMo 91.6% target), merljivim rezultatima i SOTA benchmark-om

---

## Kontekst

Deep inspekcija `apps/www`, `apps/web`, `packages/server/src/plugins/auth.ts` i `packages/server/src/routes/webhooks.ts` otkrila je sedam gap-ova između onoga što je već spremno (Clerk server plumbing, Stripe checkout flow, basic landing komponente) i onoga što je potrebno za SOTA-gated launch. Ovi gap-ovi su kod-side blocker-i. PM-Waggle-OS paralelno proizvodi persona research, landing copy i IA — kod mora biti spreman da prihvati te artefakte.

Ovaj brief se ne izvršava odmah — Claude Code je fokusiran na trenutni backlog (H-34 extraction, v2 GEPA eksperiment, preostali polish). Kad se ti stream-ovi spuste na next-up nivo, stavke ispod idu u nove sprint-ove.

## Prioritet P0 — Ship-blocker-i

### P0.1 — Clerk webhook signature verification (svix)

**Lokacija**: `packages/server/src/routes/webhooks.ts`

**Problem**: Webhook endpoint `/api/webhooks/clerk` trenutno prima user.created/updated/deleted događaje bez verifikacije potpisa. Komentar u kodu eksplicitno kaže "In production: verify Clerk webhook signature via svix" — ali to nije implementirano. Security hole: bilo ko može spoof-ovati Clerk user eventove i manipulisati user bazom.

**Acceptance**:
- Uvesti `svix` dependency u `packages/server`.
- Pre parsiranja body-a, `Webhook.verify(body, headers, secret)` mora proći. Secret čitati iz `CLERK_WEBHOOK_SIGNING_SECRET` env (dodati u config schema sa Zod validacijom).
- Na verification failure vratiti `401` i logovati event bez exfiltriranja header-a.
- Dodati integration test u `packages/server/test/webhooks.test.ts` koji pokriva (a) valid signature prolazi, (b) invalid signature 401, (c) replay attack (ponovljen timestamp) 401.
- Ažurirati `docs/OPS/` sa novim `clerk-webhook-smoke.md` sa setup instrukcijama.

### P0.2 — Auth handshake: landing Stripe checkout → Clerk session → desktop license

**Lokacija**: `apps/www/src/components/Pricing.tsx`, `packages/server/src/routes/stripe.ts`, `packages/launcher`, `packages/server/src/plugins/auth.ts`

**Problem**: Trenutno Pricing komponenta POST-uje na `${API_URL}/api/stripe/create-checkout-session` bez Clerk sesije. Desktop app nema načina da zna ko je platio. Nema license-key flow-a. Ovo je arhitektonski gap koji mora biti rešen pre nego što Stripe dashboard ide live.

**Acceptance**:
- Pre Stripe checkout poziva, landing proverava Clerk sesiju; ako nije prijavljen → otvara Clerk sign-up/sign-in modal; ako jeste → prosleđuje `userId` kao `client_reference_id` u Stripe session.
- Stripe `checkout.session.completed` webhook (novi endpoint `/api/webhooks/stripe`) čita `client_reference_id`, upisuje subscription u user record preko `userService.updateSubscription(userId, tier, stripeCustomerId, stripeSubscriptionId, status)`.
- Desktop `packages/launcher` dodaje "Sign in to activate Pro/Teams" flow: OAuth PKCE protiv Clerk-a, dobija JWT, čuva refresh token u OS keychain (macOS Keychain / Windows Credential Manager / Linux Secret Service — Tauri nudi `tauri-plugin-stronghold` ili `keyring` crate).
- App kontaktira `${API_URL}/api/me/entitlements` sa JWT-om; server vraća tier + feature flags.
- Free tier radi offline bez sign-in-a — to je LOCKED odluka, ne menjati.
- Acceptance test: E2E scenarijo "free user klikne Pro → Clerk sign-up → Stripe sandbox checkout → webhook updatuje DB → desktop relaunch prikazuje Pro features".

### P0.3 — Beta signup capture mehanizam

**Lokacija**: `apps/www/src/components/BetaSignup.tsx`

**Problem**: Trenutno `mailto:marko@egzakta.rs` placeholder. Komentar u kodu eksplicitno priznaje "Placeholder — replace with Formspree or API endpoint". Za launch PR kampanju ovo je neprihvatljivo — izgubićemo signup intel.

**Acceptance**:
- Nova ruta `POST /api/beta/signup` u `packages/server`. Body: `{ email, persona (optional enum), source (utm_source), consentMarketing: boolean }`.
- Rate limiting (3 req/min po IP), email format validacija (Zod), consent-GDPR-ready audit log.
- DB tabela `beta_signups` sa `id, email, persona, source, consent_marketing, created_at, verified_at`.
- Landing komponenta šalje preko fetch, prikazuje success state bez page reload-a.
- Opcija A (preporuka): koristiti Clerk waitlist feature ako je enabled — minimiše novu infrastrukturu.
- Confirmation email preko Resend ili SendGrid — čak i single-sender sa `hello@waggle-os.ai` za sada.

## Prioritet P1 — Launch-aligned

### P1.1 — i18n infrastruktura predefinisana (English-only content u prvom krugu)

**Lokacija**: `apps/www/src/`

**Problem**: Sav landing copy je hardkodovan u JSX-u. Kad budemo dodavali srpski/nemački/španski, biće potpuni refaktor.

**Acceptance**:
- Uvesti `react-i18next` (ili `i18next` + `vite-plugin-i18next-loader`).
- Svaki string externalizovati u `public/locales/en/landing.json` sa hijerarhijskim key-evima (`hero.headline`, `pricing.pro.cta`, `features.cognitive_layer.title`).
- Routing: `/` = English (no prefix), `/:locale(sr|de|fr|es|...)?/...` prefix za ostale. Za sada samo `en` locale file postoji; rute za druge su 404 dok se locale-i ne dodaju.
- `<html lang={locale}>` se dinamički menja.
- Meta i OG tagovi per-locale preko `react-helmet-async`.
- RTL switch logic (dir="rtl" kad dođu ar/he) — stub, ne aktivirati.
- Datum/broj format preko `Intl.DateTimeFormat` i `Intl.NumberFormat`.
- Sitemap.xml sa `alternate hreflang` stub-ovima (trenutno samo `en` aktivan).
- CI check: `pnpm run i18n:validate` skripta koja potvrđuje da svi key-evi u `en/landing.json` imaju iste key-eve u svakom drugom locale file-u kad se dodaju.
- **Bitno**: English copy ne menjati u ovom sprintu — samo externalizovati. Novi copy dolazi iz PM-Waggle-OS persona research deliverable-a.

### P1.2 — Analytics instrumentacija za merljive user journey-e

**Lokacija**: `apps/www/src/` i `apps/web/` (ako ima), plus server-side event forwarding endpoint

**Problem**: Nema event tracking-a. Persona testing i konverzione metrike zahtevaju instrumentaciju, inače landing review = subjektivno mišljenje, ne podatak.

**Acceptance**:
- Odluka o stack-u: **preporuka PostHog self-hosted** (privacy-first, EU-deploy-able, hive-mind ethos kompatibilan; Plausible je alternativa ali slabiji za event funnel-e). Marko potvrđuje pre implementacije.
- Consent banner pre bilo kakvog event firing-a — GDPR i EU AI Act compliant. Default = no tracking dok user ne pristane. Essential cookies only u opt-out stanju.
- Event schema (prvi krug):
  - `landing.page_view` — `{ path, locale, utm_source, utm_medium, utm_campaign, referrer }`
  - `landing.hero_cta_click` — `{ cta_variant, destination }`
  - `landing.pricing_tier_click` — `{ tier: 'free'|'pro'|'teams' }`
  - `landing.beta_signup_submit` — `{ persona?, source }`
  - `landing.download_click` — `{ platform: 'mac'|'win'|'linux' }`
  - `auth.signup_started` / `auth.signup_completed` — `{ provider }`
  - `checkout.started` / `checkout.completed` — `{ tier, amount }`
  - `desktop.first_launch` — `{ os, tier }`
  - `desktop.first_value_reached` — `{ time_ms_from_launch }` (prvi uspešan chat)
- Server-side forwarding endpoint `POST /api/analytics/event` — code sa Bearer tokenom, rate-limited. Sprečava ad-blocker-e da skrate event feed.
- Funnel pre-definisan u PostHog-u: `page_view → beta_signup_submit` (top-of-funnel), `page_view → pricing_tier_click → checkout.completed` (revenue funnel), `checkout.completed → desktop.first_value_reached` (activation funnel).
- Dashboard artefakt u `docs/OPS/analytics-dashboard.md` sa link-om na PostHog board.

### P1.3 — Landing content scaffolding (persona-aware sections)

**Lokacija**: `apps/www/src/components/`

**Problem**: Trenutne sekcije (Hero, Features, CrownJewels, HowItWorks, Pricing, Enterprise, BetaSignup, Footer) su generic. Nema persona-specifičnih entry tačaka. Proof points nedostaju. CrownJewels prikazuje feature-e, ne diferencijatore.

**Acceptance** (coordinated sa PM deliverable-om):
- Kreirati strukturu komponenti koja prima persona i tier kao props, tako da PM može isporučiti copy varijantu po persona-i bez kod izmene:
  ```tsx
  <PersonaHero persona="solo-developer" variant="A" />
  <ProofPoints benchmark="locomo-91.6" v1Result="108.8" />
  <TierComparison highlight="pro" />
  <KvarkBridge enabledFor="teams" />
  ```
- Proof points sekcija (nova): LoCoMo benchmark target, v1 108.8% rezultat, open-source + Apache 2.0, zero cloud, EU AI Act ready.
- KVARK bridge sekcija (nova): "Scale beyond your desktop — KVARK enterprise option" sa CTA ka enterprise sales.
- Copy ostaje placeholder dok ne stigne iz PM persona research-a; struktura je to što se sada skelira.

## Prioritet P2 — Polish

### P2.1 — apps/web Clerk integracija (ako će biti web console)

**Lokacija**: `apps/web`

**Problem**: `apps/web` ima nula Clerk integracije. Ako će služiti kao post-login console (account, billing, team management), sada je vreme.

**Acceptance**:
- Potvrditi sa Markom: da li `apps/web` ide live za v1 launch, ili je lazy-deploy posle? Ako ide — Clerk React SDK + protected routes + `/account`, `/billing`, `/team` rute. Ako ne — skip do post-launch.

### P2.2 — Download detection i smart CTA

**Lokacija**: `apps/www/src/components/Hero.tsx`

**Problem**: Download CTA trenutno šalje sve na `github.com/marolinik/waggle/releases/latest`. User na Mac-u ne zna koji fajl da skine.

**Acceptance**:
- Detektuj OS preko `navigator.userAgent` (ili `userAgentData.platform` gde je dostupno).
- Generiši direct link na `.dmg` / `.msi` / `.AppImage` asset iz najnovijeg GitHub release API poziva (cache 5 min).
- Fallback na release page ako detekcija ne uspe.

### P2.3 — Status page stub

**Lokacija**: Nova `apps/www/src/pages/status.tsx` ili eksterno

**Problem**: Kada cloud.waggle-os.ai bude live (Stripe webhook, entitlements endpoint), potreban je javni status za enterprise evaluacije.

**Acceptance**: Basic uptime stub — Statuspage.io ili jednostavan Cloudflare Worker sa health checks.

## Šta NIJE u ovom brief-u (explicit out-of-scope)

- Landing copy i pravi content — dolazi iz PM-Waggle-OS persona research deliverable-a kad Marko odobri (posle control-gate-a).
- Wireframe i visual design — produkuje se u PM-Waggle-OS sa Claude design system referencom, zatim se predaje kao spec Claude Code-u.
- H-34 hive-mind extraction — poseban workstream.
- v2 GEPA eksperiment — poseban workstream.
- E2E persona testing pack-ovi — PM-Waggle-OS produkuje, Marko izvršava u browser-u.

## Predloženi redosled izvršenja

Prvo P0.1 (svix — najmanji, najbitniji, dan rada). Paralelno P1.1 (i18n — mehanički ali obiman, može u background). Onda P0.2 (auth handshake — najkompleksniji, zavisi od Clerk webhook signature-e). Onda P0.3 (beta signup — brzo, unblock-uje marketing). Onda P1.2 (analytics — da bi persona testovi mogli da se mere). Onda P1.3 (content scaffolding — da bi PM deliverable mogao samo da ubaci copy).

Estimat: P0 blok = 3-5 eng-dana. P1 blok = 4-6 eng-dana. Ukupno ~2 nedelje paralelnog rada sa H-34 extraction-om.

## Integracioni uslov

Ovaj brief se integrira u BACKLOG-MASTER-2026-04-18.md v2 kao novi blok H13 (Landing & Auth Infrastructure) kad Claude Code završi trenutni sprint. Do tada stoji kao pending artefakt u PM-Waggle-OS/briefs/. Gap ka dashboard backlog-u: dodati [M]-15 (Auth architecture decision) i [M]-16 (Beta signup capture mechanism) kao formalne stavke u Marko-side queue-u na sledećem backlog reconciliation pass-u.
