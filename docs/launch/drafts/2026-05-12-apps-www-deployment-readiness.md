# apps/www Deployment Readiness — Day-0 Plan

**Status:** DRAFT — what's needed to deploy `apps/www` to `https://waggle-os.ai`
**Authoring:** CC, 2026-05-12 (Phase 2 Wave 3 prep)
**Gates:** Wave 3 / C2 (Stripe live smoke) is blocked until apps/www is live at a real URL

---

## Why this matters

The Stripe webhook endpoint `we_1TVt5qCNCrMQy1f7Zl5ujKSC` (created during Wave 2 PG3
prep) is configured to POST to `https://waggle-os.ai/api/webhooks/stripe`. Without a
live deployment at that URL:
- Stripe webhook deliveries fail (5xx or DNS fail) — won't trigger tier upgrades.
- Marketing CTAs ("Start free trial") have nowhere to land.
- Day-0 LinkedIn post can't link to a real domain.

The Day-0 ETA target (2026-05-15) requires this resolved.

---

## Existing deploy automation: broken

`.github/workflows/deploy-www.yml` targets **GitHub Pages** and expects
`apps/www/dist` (static output). Two problems:

1. `next build` outputs `.next/`, NOT `dist/` — the workflow's artifact upload path is wrong.
2. GitHub Pages only serves **static files** — it cannot run:
   - The `/api/webhooks/stripe` route (needs serverless)
   - The Clerk middleware (needs Node runtime)
   - Server Actions / dynamic rendering

This workflow either needs full rewrite OR a different host. **Recommendation: switch to Vercel.**

---

## Recommended path: Vercel

### Why Vercel

- **Native Next.js hosting** — zero config; auto-detects `apps/www/next.config.mjs`
- **Server Actions + API routes + middleware** all work without translation
- **Free tier** sufficient for pilot traffic; auto-scaling on Pro
- **Native Clerk + Stripe + PostHog integrations** documented
- **DNS-by-CNAME** straightforward to point `waggle-os.ai` at Vercel

### Step 1 — Vercel project setup

```powershell
# Install Vercel CLI (one-time)
npm i -g vercel

# Link the apps/www directory to a new Vercel project
cd D:\Projects\waggle-os\apps\www
vercel login          # browser OAuth, uses Marko's account
vercel link           # creates .vercel/ folder (gitignored)
                      # When prompted: "Set up apps/www?" → Yes
                      # Project name: waggle-www  (or your choice)
                      # Framework: Next.js (auto-detected)
                      # Build command: leave default (npm run build)
                      # Output directory: leave default (.next)
                      # Root directory: ./   (already in apps/www)
```

### Step 2 — Set production environment variables

13 env vars from `apps/www/.env.local` need to land in Vercel. Use the CLI for atomicity:

```powershell
cd D:\Projects\waggle-os\apps\www

# Bulk-add all 13 prod env vars to Vercel (production environment)
# Reads from .env.local and pushes each to Vercel.
$envFile = ".env.local"
Get-Content $envFile | ForEach-Object {
  if ($_ -match "^([A-Z_]+)=(.+)$") {
    $key = $matches[1]
    $val = $matches[2]
    # Skip lines that are template/example values
    if ($val -notmatch "REPLACE_ME") {
      Write-Host "Setting $key in Vercel production..."
      $val | vercel env add $key production
    }
  }
}
```

**Verification:**
```powershell
vercel env ls production
# Should list all 13 keys (no values displayed; just names).
```

### Step 3 — First deploy (preview)

```powershell
cd D:\Projects\waggle-os\apps\www
vercel
# Deploys to a preview URL like https://waggle-www-<hash>.vercel.app
# Capture this URL — use for smoke test before production
```

### Step 4 — Preview smoke test

```powershell
# Open the preview URL in browser:
# 1. Landing page renders (no Clerk crash, no 500)
# 2. /sign-up loads the Clerk widget
# 3. /pricing renders Pro + Teams cards
# 4. /privacy + /terms + /cookies + /eu-ai-act render legal pages
# 5. Hit /api/webhooks/stripe with a curl POST (should reject without signature):
curl -X POST https://waggle-www-<hash>.vercel.app/api/webhooks/stripe -d '{}'
# Expected: 400 "Missing stripe-signature header" or similar
```

### Step 5 — Promote to production at waggle-os.ai

```powershell
vercel --prod
# Promotes the last preview to production at https://<project>.vercel.app
```

Now point `waggle-os.ai` DNS:
- Vercel dashboard → project → Domains → Add `waggle-os.ai`
- Vercel shows the CNAME/A record values to set at your DNS registrar
- At the registrar (whoever hosts waggle-os.ai DNS), add the records
- Verify with `nslookup waggle-os.ai` — should resolve to Vercel's IP
- SSL cert auto-provisions via Let's Encrypt within ~5 min of DNS pointing

### Step 6 — Production smoke test

```powershell
# Once https://waggle-os.ai resolves to Vercel:
# 1. Browser: load https://waggle-os.ai — landing renders
# 2. curl Stripe webhook endpoint (should 400, not 404 or 5xx):
curl -X POST https://waggle-os.ai/api/webhooks/stripe -d '{}'
# Expected: 400 — endpoint reachable, just rejected for missing signature

# 3. Test Stripe webhook delivery FROM Stripe side:
#    Stripe Dashboard → Developers → Webhooks → endpoint we_1TVt5qCNCrMQy1f7Zl5ujKSC
#    → "Send test webhook" → checkout.session.completed event
#    Look for 200 response in Stripe's recent deliveries panel.
```

### Step 7 — Update Day-0 ETA marker

After production smoke passes, Wave 3 / C2 (Stripe live smoke) can fire — that's the
real Pro Checkout test with a card 4242, watching webhook arrive + Clerk publicMetadata
update + tier flip in the UI.

---

## Env var checklist (the 13)

Order matches `apps/www/.env.local` line-by-line. Each must be in Vercel "Production"
environment before deploy.

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk dashboard, "live" mode key (`pk_live_*` or `pk_test_*`) |
| `CLERK_SECRET_KEY` | Server-side Clerk auth. **Rotated 2026-05-12** ✓ |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Default `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Default `/sign-up` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | Where to send post-signin (e.g. `/`) |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | Where to send post-signup (e.g. `/`) |
| `CLERK_WEBHOOK_SECRET` | For Clerk → tier publicMetadata sync; set if using Clerk webhooks (else can defer) |
| `STRIPE_SECRET_KEY` | Live key, on Egzakta account (`CNCrMQy1f7`). **Marko declined rotation per session call** — left in chat log; consider rotating post-Day-0. |
| `STRIPE_WEBHOOK_SECRET` | `whsec_smwv4fInMEzJ3NSj3AwcNY2pz21eVrBu` (live endpoint created Wave 2 PG3 prep) |
| `STRIPE_PRICE_PRO_MONTHLY` | `price_1TVsaMCNCrMQy1f7KwImpxA4` (Pro $19/mo) |
| `STRIPE_PRICE_PRO_ANNUAL` | `price_1TVsaLCNCrMQy1f7YhQGDH2o` (Pro $190/yr) |
| `STRIPE_PRICE_TEAMS_MONTHLY` | `price_1TVsaLCNCrMQy1f7WUhtbZ88` (Teams $49/seat/mo) |
| `STRIPE_PRICE_TEAMS_ANNUAL` | `price_1TVsaLCNCrMQy1f75lmMHMTj` (Teams $490/seat/yr) |

**Note:** `.env.example` is missing 10 of these 13. Update `.env.example` to include
all key names (no values; just placeholders) so onboarding contributors know what's needed.

---

## Alternative paths (if Vercel doesn't fit)

### Alt-A: Self-host via Docker + Render/Fly/Railway

```dockerfile
# apps/www/Dockerfile (would need creating)
FROM node:20-alpine
WORKDIR /app
COPY apps/www/package*.json ./
RUN npm install
COPY apps/www/ ./
RUN npm run build
CMD ["npm", "start"]
EXPOSE 3000
```

Render/Fly: connect GitHub repo, point at `apps/www`, set 13 env vars, deploy.
Cost: $0-7/mo for hobby, scales with traffic.

### Alt-B: Cloudflare Pages with Functions

CF Pages supports Next.js with Functions for API routes. Slightly more setup than
Vercel, similar feature parity. Pro: cheaper at scale. Con: less mature Next.js
integration vs Vercel.

### Alt-C: Existing GitHub Pages workflow + Next.js static export

Rewrite `apps/www/next.config.mjs` with `output: 'export'`, drop API routes, move
the Stripe webhook handler elsewhere (Cloudflare Worker, AWS Lambda, your `cloud.waggle-os.ai`
sidecar). **Significant rework. NOT recommended for Day-0.**

---

## Day-0 readiness gate

Wave 3 / C2 (Stripe live smoke) **cannot fire** until:

- [ ] apps/www deployed to https://waggle-os.ai (whichever path)
- [ ] Production smoke confirms `/api/webhooks/stripe` responds (4xx for missing sig, not 5xx or 404)
- [ ] Stripe dashboard "Send test webhook" delivers 200 from production endpoint
- [ ] DNS propagation confirmed (`nslookup waggle-os.ai` resolves)
- [ ] SSL cert active (no browser warning)

Once those 5 checks pass, the Wave 3 C2 task in `02-PLAN.md` (real Pro Checkout
with test card 4242 → live webhook → Clerk publicMetadata.tier flip → tier
unlock in product) can fire as designed.

**Wall-clock estimate** for Marko to drive this: 30-60 min if Vercel auth + DNS
are already set up; +1-2h if DNS is at a registrar that takes hours to propagate.

---

## Disposition

Once you pick a deploy path:
- **Vercel (recommended):** follow Steps 1-7 above. Tell CC "deployment live at https://waggle-os.ai" and I fire Wave 3 / C2 from there.
- **Other:** confirm the path; CC adapts the smoke script accordingly.

---

*Drafted 2026-05-12 by CC. Wave 3 C2 task in `02-PLAN.md` resumes once deployment is live.*
