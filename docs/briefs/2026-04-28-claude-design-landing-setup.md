# claude.ai/design Landing Generation Setup Brief

**Date:** 2026-04-28
**Author:** PM
**Status:** Awaiting Marko execution (manual paste + asset upload)
**Predecessor brief:** `briefs/2026-04-28-landing-copy-v4-waggle-product.md` (binding source-of-truth for all copy)
**Prior pause artifact:** `briefs/2026-04-20-claude-design-setup-submission.md` (Design System generation form content — historical reference, NOT to be reused for landing — different generation context)

---

## §1 — Setup approach

This is a **new generation in claude.ai/design** for the Waggle product landing page. NOT a resume of the Design System pause from 2026-04-20 (that generation completed and produced Waggle Design System with 16 sections, ratified 2026-04-24).

Decision tree on how to set up:

**Path A (preferred if available):** Open new generation **within existing claude.ai/design workspace** that contains the ratified Waggle Design System. Landing generation inherits design tokens, components, typography, and visual language automatically. Look for "New project" or "New canvas" within existing workspace, not in fresh organization.

**Path B (fallback):** If claude.ai/design doesn't expose intra-workspace new project flow, create new generation in fresh workspace, but include in the prompt a reference to the Design System artifacts as visual direction anchor (paste tokens + screenshots). Lower fidelity than Path A; Path A preferred.

**Path C (pivot):** If claude.ai/design generation produces unsatisfactory landing implementation after 2-3 iteration cycles, pivot to direct CC implementation in apps/www using v4 copy + wireframe v1.1 + Hive DS tokens. Per `project_claude_design_setup_pause` memory original Path 2 fallback. Document pivot in `decisions/2026-04-XX-landing-implementation-pivot.md`.

PM rec: try Path A first (~5 min to verify availability), fall back to Path B if not available, escalate to Path C only if generation quality fails after iteration.

---

## §2 — Project name + description (paste-ready for claude.ai/design form)

**Project name:**
```
Waggle Landing — v1
```

**Project description (if separate field exists):**
```
Marketing landing page for Waggle, the AI workspace product with persistent memory and EU AI Act audit reports. Backed by Egzakta Group advisory practice. Target audience: knowledge workers and vibe coders in regulated and unregulated industries. Distribution channels: organic search, GitHub, LinkedIn referrals, Hacker News, legal tech press, banking/insurance compliance newsletters, Egzakta Advisory partner referrals. Three pricing tiers: Solo (free forever) / Pro ($19/month) / Teams ($49/seat/month, 3-seat minimum). Plus minimal KVARK enterprise bridge (one sentence + one CTA). Implementation will land in apps/www repo (Vite + React 19 + Tailwind 4 + Hive Design System tokens).
```

---

## §3 — Company blurb (paste-ready, ~95 words, replaces 2026-04-20 dual-axis blurb which is now stale)

```
Waggle is the AI workspace where memory persists. Use any LLM — Claude, GPT, Qwen, Gemini, your local model — and Waggle gives it the memory it should already have. Your projects, decisions, and conversations captured locally, retrievable across models, structurally organized into your own knowledge graph. Zero cloud transit by default. EU AI Act audit reports built into the workflow. Free for individuals, $19 for power users, $49/seat for teams. Backed by Egzakta Group, an advisory practice in DACH/CEE/UK regulated industries since 2010 — not a venture-funded startup pivoting through positioning cycles.
```

**Voice guidelines for the generation:**
- Professional + sovereign, not chirpy startup
- Anti-jargon in headlines (no "cognitive layer" before scroll fold per wireframe v1.1 §1.6)
- Trust through institutional backing, not marketing momentum
- Honest claims with specifics ("$19", "$49/seat", "since 2010") not vague aspiration
- Compliance-grade language for regulated audience without alienating consumer audience

---

## §4 — Visual direction notes (paste-ready for visual notes field)

```
DESIGN PRINCIPLES (ratified Waggle Design System, 16 sections):

Palette: hive/honey hex spectrum
- Background: hive-950 #08090c (dark-first; light mode is v1.1 stretch)
- Honey accent ladder: 400 #f5b731 / 500 #e5a000 / 600 #b87a00
- Cool secondary: violet #a78bfa / mint #34d399 (status only)
- Neutral ladder: hive-50 through hive-950, 11 stops
- Honey gradient backdrop on hero only; rest of sections solid hive-950

Typography:
- Inter as primary typeface (variable font, weight range 400-700)
- Headline scale: 48-64px hero, 36-48px section, 24-32px subhead
- Body: 16-18px main, 14px caption
- Letter-spacing tight on display weights (-0.02em)

Layout paradigm:
- macOS-aesthetic shell influence (per Waggle Design System Stage 1+2+3 ratifications) — rounded corners, soft shadows, subtle layering, but applied to marketing landing not desktop UI
- Linear + Notion as visual reference points (clean, dense-information-friendly, dark-first)
- 60/40 split heroes, full-bleed proof bands, 6+6+1 personas card grid (xl breakpoint)
- Generous vertical rhythm (32-48px section gaps, 16-24px element gaps)
- Honeycomb texture motif appears as subtle background detail in trust band (low opacity)

Motion:
- MPEG-4 hero loop ≤800KB, 7s, prefers-reduced-motion suppression mandatory
- Bee swarm orchestration motion in personas section (subtle ambient)
- All other motion: hover micro-interactions only, no scroll-triggered storytelling

Brand assets:
- Waggle wordmark + bee mascot logo (waggle-logo.svg)
- 13 bee-persona illustrations (one per persona role)
- Hex/honeycomb texture asset for trust band background

Anti-patterns (binding):
- No SaaS landing clichés (centered hero, feature icon grid, trust-logos-of-companies-that-never-heard-of-us, CEO quote carousel)
- No "AI does everything" aspirational copy
- No KVARK pitch beyond one sentence + one CTA
- No bee names as UI command aliases (Opcija 3 dual-layer rule)
- No "cognitive layer" jargon in first three scroll viewports
- No light-mode design in v1 (dark-first locked)
```

---

## §5 — Landing generation prompt (paste into main generation prompt field)

This is the meat of what Claude Design needs to generate. Paste verbatim:

```
Generate a marketing landing page for Waggle (waggle-os.ai) following these binding constraints:

SECTION ORDER (per ratified IA Faza 2 + wireframe v1.1 LOCKED, simplified to 7 sections):

1. HERO — left-aligned 60/40 split (visual right at lg, hidden md and below). Eyebrow + headline + subhead + body + primary CTA "Download for {os}" + secondary CTA "See how it works →". MPEG-4 loop visual right side (placeholder: animated frame transition, will swap real loop).

2. PROOF / SOTA — full-width band, 5 cards. Cards in order: LoCoMo substrate 74%, trio-strict 33.5%, Apache 2.0, Zero cloud, EU AI Act audit reports. Elastic responsive: 5-in-row at xl, 3+2 at lg, 2×2+1 at md, single column at sm.

3. HOW IT WORKS — 3-step narrative with simple iconography. "Install once → Work normally → Compound, don't repeat." Each step has 2-3 sentence explanation, no jargon.

4. PERSONAS — 13 bee tiles, 6+6+1 grid at xl. Each tile is a bee illustration + persona title + 1-line JTBD. Personas adapt their workspace to user role. Tile names locked from existing card copy spec.

5. PRICING — 3 tier cards equal width. Solo (free forever) / Pro ($19/month) / Teams ($49/seat/month, 3-seat minimum). Each card: tier label + price + tagline + audience + included features + primary CTA. Plus tier comparison table below cards (collapsible).

6. TRUST BAND — Egzakta Group attribution + 5 trust signals (EU AI Act, Apache 2.0, Zero cloud, Published methodology, Egzakta Group backed). Honeycomb texture background at low opacity.

7. FINAL CTA — large headline "Stop pasting context. Start using AI that remembers." + primary download CTA + secondary "Compare tiers" CTA + minimal KVARK bridge sentence ("Need it on your organization's sovereign infrastructure? Talk to KVARK team →").

8. FOOTER — Egzakta attribution line + 4 link columns (Product, Research, Company, Legal).

HERO COPY VARIANTS — generate 5 variants for per-persona resolution:

Variant A (Marcus, default): Eyebrow "AI workspace with memory" + Headline "Your AI doesn't reset. Your work doesn't either." + Subhead about persistent memory across LLMs + body about pasting context fatigue.

Variant B (Klaudia, regulated/Egzakta channel): Eyebrow "AI for regulated industries, finally" + Headline "AI workspace that satisfies your CISO." + Subhead about local-first + EU AI Act audit + Egzakta backing + body about CISO-blocked-ChatGPT pain.

Variant C (Yuki, founder/HN channel): Eyebrow "Shared context for moving teams" + Headline "Your team's memory, before someone has to write it down." + Subhead about Notion wiki staleness + Slack search hostility + body about 8-person team onboarding compression.

Variant D (Sasha, GitHub/developer channel): Eyebrow "Memory substrate for any agent" + Headline "Memory layer that doesn't lock you to a vendor." + Subhead about Apache 2.0 + MCP + local deployment + body about Mem0 cloud-only / LangMem toy-tier / Letta agent-centric.

Variant E (Petra, legal tech channel): Eyebrow "AI for confidential work" + Headline "AI that never sees your client matter." + Subhead about local-first + bar association + audit log + body about ChatGPT-as-malpractice-risk fear.

DESIGN STYLE:
- macOS aesthetic shell influence (rounded corners, soft shadows, subtle layering)
- Inter typeface throughout
- Honey palette ladder (#f5b731 / #e5a000 / #b87a00) on hive-950 dark ground
- Linear + Notion as reference points
- Honeycomb motif as subtle background detail in trust band only
- Dark-first locked, light mode is v1.1 stretch

OUTPUT FORMAT:
- Single React component tree (apps/www/src/app/page.tsx + supporting components)
- Component-level extraction: <Hero variant="..." />, <ProofPointsBand />, <HowItWorks />, <PersonasGrid />, <PricingTiers />, <TrustBand />, <FinalCTA />, <Footer />
- All copy keyed under landing.* namespace per i18n contract
- TypeScript strict mode
- Tailwind 4 utility classes (no custom CSS unless impossible)
- Responsive at sm/md/lg/xl breakpoints with mobile-first cascade

REFERENCES TO RESPECT:
- Existing Waggle Design System (16 sections, ratified 2026-04-24) — components and tokens
- Hive DS tokens in apps/www/src/styles/globals.css — canonical color/typography source
- Persona Rev 1 + IA Faza 2 + wireframe v1.1 ratified upstream — section structure binding
- Voice contract from waggle-os/docs/BRAND-VOICE.md — six brand voice clauses
```

---

## §6 — Asset inventory (manual upload, 15 files)

claude.ai/design blocks programmatic file injection (per `project_claude_design_setup_pause` memory). Manual upload via native file picker is required.

**Path correction (from pause memory):** Real assets live in `D:\Projects\waggle-os\apps\www\public\brand\`, NOT `app\icons\` (which is NSIS installer placeholder only).

**15 files to upload:**

```
1.  D:\Projects\waggle-os\app\public\waggle-logo.svg
2.  D:\Projects\waggle-os\apps\www\public\brand\bee-analyst-dark.png
3.  D:\Projects\waggle-os\apps\www\public\brand\bee-architect-dark.png
4.  D:\Projects\waggle-os\apps\www\public\brand\bee-builder-dark.png
5.  D:\Projects\waggle-os\apps\www\public\brand\bee-celebrating-dark.png
6.  D:\Projects\waggle-os\apps\www\public\brand\bee-confused-dark.png
7.  D:\Projects\waggle-os\apps\www\public\brand\bee-connector-dark.png
8.  D:\Projects\waggle-os\apps\www\public\brand\bee-hunter-dark.png
9.  D:\Projects\waggle-os\apps\www\public\brand\bee-marketer-dark.png
10. D:\Projects\waggle-os\apps\www\public\brand\bee-orchestrator-dark.png
11. D:\Projects\waggle-os\apps\www\public\brand\bee-researcher-dark.png
12. D:\Projects\waggle-os\apps\www\public\brand\bee-sleeping-dark.png
13. D:\Projects\waggle-os\apps\www\public\brand\bee-team-dark.png
14. D:\Projects\waggle-os\apps\www\public\brand\bee-writer-dark.png
15. D:\Projects\waggle-os\apps\www\public\brand\hex-texture-dark.png
```

**Verification step before upload:** open Windows Explorer to `D:\Projects\waggle-os\apps\www\public\brand\` and confirm all 13 bee-*-dark.png + hex-texture-dark.png exist. If any missing, halt-and-PM — bee regen workstream may need re-run before landing setup proceeds.

---

## §7 — Manual execution steps for Marko

1. **Open browser to claude.ai/design** in regular Chrome (not Chrome MCP — manual upload won't work otherwise).

2. **Verify Path A availability:** look for "New project" or "New canvas" within existing workspace that holds Waggle Design System. If found, use that flow (inherits design tokens). If not, fall back to Path B (new workspace).

3. **Fill project name field:** paste "Waggle Landing — v1" from §2.

4. **Fill project description field (if exists):** paste the description block from §2.

5. **Fill company blurb / overview field:** paste the ~95-word blurb from §3.

6. **Fill visual direction notes field:** paste the design principles block from §4.

7. **Fill main generation prompt field:** paste the entire landing generation prompt from §5. This is the long block — verify it pastes fully without truncation.

8. **GitHub URL field:** leave blank (waggle-os is private, hive-mind is the OSS facing repo at github.com/marolinik/hive-mind). If claude.ai/design strictly requires a URL, paste `https://github.com/marolinik/hive-mind` as design system reference; do NOT paste waggle-os repo URL.

9. **Asset upload (manual, 15 files):** click upload button, navigate to `D:\Projects\waggle-os\apps\www\public\brand\`, select all 13 bee-*-dark.png + hex-texture-dark.png. Then click upload again and add `app\public\waggle-logo.svg`. Verify all 15 files listed before proceeding.

10. **Click Continue to generation.** Generation will take 2-10 minutes depending on complexity.

11. **Review first generation output:** look for these signals (pass/fail per signal):
    - All 7 sections present in correct order? PASS / FAIL
    - Hero shows Variant A (Marcus default) at minimum? PASS / FAIL (if missing variants, iterate with prompt update)
    - Pricing shows 3 tiers with correct prices ($0 / $19 / $49)? PASS / FAIL
    - Trust band includes Egzakta Group attribution? PASS / FAIL
    - KVARK bridge is one sentence + one CTA only? PASS / FAIL
    - No "cognitive layer" jargon above scroll fold in hero? PASS / FAIL

12. **Iterate via Claude Design feedback loop:** for each FAIL signal, write specific feedback ("Hero is missing the Klaudia variant — add another hero block triggered by ?p=compliance UTM"). Two to three iterations should converge. Halt-and-PM if more than 5 iterations needed (signal of generation quality issue, may need pivot to Path C).

13. **Export to apps/www repo:** Claude Design generates React component tree. Export option (look for "Get the code" or "Export" button) downloads JSX/TSX files. Manually copy to `D:\Projects\waggle-os\apps\www\src\app\page.tsx` + supporting components in `apps/www/src/components/landing/`. Verify TypeScript compiles + Tailwind classes resolve in dev server.

---

## §8 — What signals halt-and-PM during iteration

You don't have to bring every iteration question to me. But these specific signals halt:

- **Section reorder** — Claude Design generates sections in different order than ratified IA Faza 2. Don't accept; re-prompt or halt-and-PM.
- **Hero variants reduce to one** — Claude Design refuses to generate 5 variants. May indicate prompt complexity issue; simplify by asking for 1 hero with `?variant=` prop hook stub, or halt-and-PM.
- **KVARK pitch expands** — Claude Design generates large KVARK section. Strong anti-pattern violation; re-prompt with explicit "KVARK is one sentence + one CTA only".
- **Light-mode design** — Claude Design defaults to light mode. Re-prompt with "Dark-first locked, hive-950 background mandatory".
- **Cognitive layer jargon in hero** — Claude Design uses "cognitive layer" prominently in hero. Re-prompt with "anti-pattern: no cognitive layer keyword in first three scroll viewports".
- **Pricing tier feature lists ballooning** — Claude Design adds 15+ bullet points per tier. Anti-pattern (per `decisions/2026-04-22-landing-personas-ia-locked.md` "no feature-count pricing"). Re-prompt with "Tiers differentiated by audience role, not feature count. 5-7 bullets max per tier."
- **Bee persona names appear as UI command aliases** — Anti-pattern Opcija 3 dual-layer rule violation. Re-prompt.
- **TypeScript or Tailwind issues post-export** — generation produces invalid syntax or unresolvable classes. Halt-and-PM, may need Path C pivot.

---

## §9 — Output integration to apps/www

After Claude Design generation passes Step 11 review:

**Step 13a — Repo placement:**
- `apps/www/src/app/page.tsx` — main landing route
- `apps/www/src/components/landing/Hero.tsx` — hero section component (with variant prop)
- `apps/www/src/components/landing/ProofPointsBand.tsx`
- `apps/www/src/components/landing/HowItWorks.tsx`
- `apps/www/src/components/landing/PersonasGrid.tsx`
- `apps/www/src/components/landing/PricingTiers.tsx`
- `apps/www/src/components/landing/TrustBand.tsx`
- `apps/www/src/components/landing/FinalCTA.tsx`
- `apps/www/src/components/landing/Footer.tsx`
- `apps/www/src/data/personas.ts` — 13 bee tiles config (existing locked file, may need imports update)
- `apps/www/src/data/proof-points.ts` — 5 proof cards config (per wireframe v1.1 §3.3)
- `apps/www/src/i18n/en/landing.json` — all `landing.*` copy keys with EN fallback strings

**Step 13b — i18n setup:**
- `apps/www/src/lib/i18n.ts` — basic locale resolver (English first, locale-ready stubs for future expansion per `feedback_i18n_landing_policy.md`)
- Future locales (Serbian, German) added post-launch as separate workstream

**Step 13c — Hero variant resolver:**
- `apps/www/src/lib/hero-headline-resolver.ts` — per wireframe v1.1 §2.2 spec, resolves variant from URL `?p=` param, `utm_source` heuristic, or fallback to Marcus default
- Variant routing rules: `?p=compliance` or `utm_source=egzakta` → Klaudia; `utm_source=hn` or `?p=founder` → Yuki; `utm_source=github` or `?p=developer` → Sasha; `utm_source=legal-tech` → Petra; default → Marcus

**Step 13d — Verify with dev server:**
- `npm run dev` in apps/www
- Visit localhost:5173 (or whatever port Vite uses)
- Test 5 hero variants by manually changing `?p=` param
- Verify all sections render at sm/md/lg/xl breakpoints
- Verify dark mode + honeycomb motif + bee tiles
- Halt-and-PM if anything visually broken

**Step 13e — Backend integrations remain CC work (separate brief):**
- Stripe checkout integration ($19/$49 LOCKED, webhook handlers, tier-gating verification)
- Analytics integration (Plausible or Fathom per `feedback_landing_work_location.md` — privacy-respecting, NOT GA)
- OS detection for Download CTA (Mac → .dmg, Windows → .msi, Linux → .AppImage)
- Email capture / lead form for Klaudia "Talk to a sovereign architect" CTA (Egzakta Advisory CRM integration)

These are NOT Claude Design generation scope — separate CC sesija after landing UI is in repo.

---

## §10 — Sequencing post claude.ai/design landing setup

**Now (Marko-side):** execute §7 manual steps, iterate per §8 signals, integrate per §9. Estimate: 3-6 hours active work + iteration time.

**Post landing UI ready (PM-side):** author CC-Stripe brief — Stripe checkout integration + webhook handlers + tier-gating + analytics setup. Estimate: 1-2 days CC work.

**Post Stripe integration (PM-side):** author CC-E2E brief — Playwright persona test matrix per `briefs/e2e-persona-tests/2026-04-25-e2e-persona-test-matrix.md`. 9 archetypes total, 3 MVP for Day 0 (Marcus + Klaudia + Yuki). Estimate: 2-3 days CC work.

**Pre launch (PM-side):** populate live V2 retrieval numbers + arxiv link + benchmark page detail. Gated by Phase 5 GEPA-evolved variant outcome.

**Day 0:** landing live at waggle-os.ai (or chosen domain), arxiv preprint live, hive-mind public release, KVARK bridge CTA active (Egzakta Advisory CRM ready to receive enterprise leads).

---

## §11 — Cross-references

- Landing copy v4 (binding source): `briefs/2026-04-28-landing-copy-v4-waggle-product.md`
- Persona Rev 1: `strategy/landing/persona-research-2026-04-18-rev1.md`
- IA Faza 2: `strategy/landing/information-architecture-2026-04-19.md`
- Wireframe v1.1 LOCKED: `strategy/landing/landing-wireframe-spec-v1.1-LOCKED-2026-04-22.md`
- Personas card copy LOCKED: `decisions/2026-04-22-personas-card-copy-locked.md`
- 2026-04-20 setup pause memory: `.auto-memory/project_claude_design_setup_pause.md`
- 2026-04-20 historical setup brief (DO NOT REUSE for landing): `briefs/2026-04-20-claude-design-setup-submission.md`
- Brand voice contract: `D:\Projects\waggle-os\docs\BRAND-VOICE.md`
- Hive DS tokens: `D:\Projects\waggle-os\apps\www\src\styles\globals.css`
- E2E persona test matrix: `briefs/e2e-persona-tests/2026-04-25-e2e-persona-test-matrix.md`
- i18n landing policy: `.auto-memory/feedback_i18n_landing_policy.md`
- Landing work location feedback: `.auto-memory/feedback_landing_work_location.md`

---

**End of setup brief. Ready for Marko execution. Halt-and-PM at any §8 signal.**
