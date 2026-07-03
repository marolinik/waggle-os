# Waggle Marketing Site (apps/www) — World-Class Rebuild — Design Spec

**Date:** 2026-07-03
**Scope:** `apps/www` presentation layer only. Auth (Clerk), billing (Stripe checkout + webhook), legal pages, and the account page keep their current wiring; they get visual coherence passes only. No changes outside `apps/www` except reading docs.
**Mode:** Autonomous (goal-hook). Decisions below are final unless implementation reveals a blocker.

---

## 1. Product truth (what the site is allowed to say)

Only claims verifiable in this repository. Canonical sources:

- **What it is:** Waggle is a workspace-native personal AI workspace with persistent memory. Tauri 2.0 desktop app (Windows/macOS), local Node sidecar, SQLite memory substrate on-device. (`CLAUDE.md` §1, `packages/hive-mind-core/src/mind/`)
- **Memory:** FrameStore + HybridSearch (vector+keyword) + KnowledgeGraph + IdentityLayer + AwarenessLayer. Harvest imports ChatGPT/Claude/Claude Code/Gemini/Perplexity/PDF/Markdown/URL histories on-device. (`packages/hive-mind-core/src/{mind,harvest}/`)
- **Benchmark:** LoCoMo 86.49% (N=1,540, GPT-4.1-mini answerer+judge — the prior leader's own protocol), +4.54pp over prior best 81.95, z=4.64. Reproducible offline (`benchmarks/results/locomo-sota-2026-06/`, `node recount.mjs`). **Never 87.66** (withdrawn).
- **Open source:** memory substrate published as `hive-mind` (github.com/marolinik/hive-mind), Apache-2.0, npm packages.
- **Model-agnostic:** LiteLLM routing; Claude, GPT, Gemini, Qwen/local models (`litellm-config.yaml`).
- **Tiers:** TRIAL $0/15 days (all features) → FREE forever (5 workspaces, agents, built-in skills) → PRO $19/mo → TEAMS $49/seat/mo → ENTERPRISE (KVARK, consultative). Memory + Harvest free forever. (`packages/shared/src/tiers.ts`)
- **Sovereignty:** data local by default; Memory Center provenance ("view original source") + Art.17 erasure that survives re-import; audit trail; injection scanning on external input.
- **Breadth:** 22 personas (8 universal modes + 14 specialists), 15 workspace templates, skills marketplace, connectors, MCP catalog, Loops (report-only + approval queue), launcher/hooks for external AI dev tools (7-tool cohort), WaggleDance team signals.

**Do-not-claim list (current site violates some):** SOC 2, priority sync across devices, 48h email SLA, dedicated account manager, "14-day trial" (it's 15), user counts, "advanced graph queries" as a paid gate, uptime, customers/testimonials. The full verified fact sheet from repo exploration is appended in §9 before implementation of copy.

## 2. Audience & jobs

1. **Knowledge-work professional** (consultant, analyst, founder, PM): wants an AI that stops forgetting; cares about their data staying theirs. Primary CTA: Download / Start free.
2. **Technically sophisticated evaluator** (developer, CISO-adjacent, OSS-curious): wants proof, architecture honesty, reproducibility, license. Secondary paths: Methodology, GitHub, EU-AI-Act page.
3. **Team lead in regulated industry:** shared memory without cloud exposure; Teams tier; KVARK escalation path.

## 3. Messaging architecture

**Category line:** *The AI workspace that remembers.*

**Narrative spine (landing page order):**

1. **Hero** — name the wound + the promise. Headline direction: "AI that starts from zero is a tool. AI that remembers you is a colleague." → committed form decided in copy pass; one headline, no A/B variants rendered (keep resolver infra dormant). Sub: memory persists across models and sessions, on your machine. CTAs: Download (OS-aware) + "Read the benchmark" (proof-forward secondary). Microline: Local-first · Model-agnostic · Apache-2.0 substrate.
2. **Problem → Turn** ("Every other AI starts from zero") — 3 tight beats of the reset tax: re-explaining context, re-pasting docs, losing decisions. Then the turn: your context is an asset; it should compound.
3. **How it works** — 3 steps grounded in real product: (1) Bring your history (Harvest imports from ChatGPT/Claude/Gemini + files), (2) Work in workspaces (personas, skills, any model underneath), (3) It compounds (memory graph grows; provenance + erasure controls). Each step gets a small product-true visual.
4. **Memory, shown** — the signature visual: memory substrate diagram (frames → hybrid search → knowledge graph → any model). This is the "what's actually different" section for the technical reader; terminology from the real architecture.
5. **Proof band** — LoCoMo 86.49% with the honest protocol sentence + link to /docs/methodology + GitHub. Numbers restrained, no chart-junk: one comparison bar (86.49 vs 81.95 vs 73.96) with sources.
6. **Feature grid** — 6 cards, each a real subsystem: Personas (22), Harvest, Multi-model routing, Loops & approvals, Skills & connectors + MCP, Memory Center (provenance/erasure). Terse, concrete, no adjectives.
7. **Sovereignty band** — local-first SQLite, what leaves the machine (only model calls you configure), EU AI Act posture (Art. 17 erasure, audit), open substrate. Trust through specificity.
8. **Personas strip** — the bee-mascot brand moment (assets exist), reframed with correct count (22 personas).
9. **Open source section** — hive-mind: Apache-2.0, npm, reproduce-the-benchmark instructions in a code block (`git clone … node recount.mjs`). Developer-credibility anchor.
10. **Pricing** — Free / Pro $19 / Teams $49-seat + KVARK enterprise line. Bullets rewritten from `tiers.ts` capabilities only. Trial framing: "15-day full trial, then free forever tier" per tiers.ts.
11. **Final CTA** — echo hero promise, Download + GitHub.
12. **Footer** — product/research/company/legal columns (keep, tidy).

**Voice:** plain, confident, specific; short sentences; zero hype adjectives ("revolutionary", "supercharge" banned). Claims carry their evidence inline or link to it. British-neutral English, sentence case everywhere (Linear/Anthropic idiom).

## 4. Visual language

- **Keep warm-Hive identity** (tokens already in `globals.css`, product-matching): hive graphite scale + honey accent + Hanken Grotesk/JetBrains Mono. This is a *refinement*, not a rebrand.
- **Elevation moves:** consistent 8-pt spacing rhythm; type scale via CSS custom properties (`--text-display` clamp(40,6vw,72) down to `--text-xs`); max-width 1120–1200 container; generous section padding (96–160px); honey used only for accents/CTAs/moments of proof (≤10% of any viewport); mono font for "machine truth" (paths, numbers, protocol lines) — a signature device.
- **Texture:** existing honeycomb SVG pattern at ≤5% opacity in hero + final CTA only. Subtle radial honey glow behind hero visual. No parallax.
- **Motion:** IntersectionObserver reveal (translateY 12px + fade, 500ms, stagger 60ms) via a tiny client `<Reveal>` component; `prefers-reduced-motion` disables all. Hero visual gets one slow ambient animation (pulse along graph edges). Nothing autoplays aggressively.
- **Illustration:** bee mascots (public/brand) confined to the Personas strip; hero uses an abstract product-true "memory graph/terminal" composition (SVG, hand-built, no screenshots since none exist marketing-grade — verify in audit; if real app screenshots exist, prefer one in a framed window).

## 5. Frontend architecture

- **Stack unchanged:** Next.js 15 app router, next-intl (copy stays in `messages/en.json`, fully rewritten), Clerk, Stripe. No Tailwind (repo decision) — but **replace inline CSSProperties objects with CSS Modules** per component + shared primitives in `globals.css` (buttons, container, section, eyebrow, card). Media queries live in CSS, killing the `<style>{responsiveCss}</style>` + `!important` hacks.
- **Components:** rebuild `_components/` as: `Navbar`, `Hero`, `ProblemTurn`, `HowItWorks`, `MemoryDiagram`, `ProofBand`, `FeatureGrid`, `SovereigntyBand`, `PersonasStrip`, `OpenSource`, `Pricing`, `FinalCTA`, `Footer`, plus primitives `Reveal` (client), `Button`, `SectionHeading`. Server components by default; client only for Navbar scroll state, pricing toggle, Reveal, hero ambient animation.
- **Keep intact:** `api/stripe/*`, `account`, `sign-in`, `sign-up`, `(legal)/*`, `docs/methodology` (restyle header/nav link only), `middleware.ts`, `sitemap.ts` (extend), hero A/B resolver infra (dormant), `DownloadCTA` OS detection + event taxonomy (`_lib/`).
- **Tests:** update `__tests__` to new structure; keep vitest green.

## 6. SEO / a11y / perf

- Metadata: keep dual head strategy; new OG image (1200×630, brand-built, replaces logo.jpeg); JSON-LD `SoftwareApplication` + `Organization`; sitemap covers all public routes; descriptive titles per page.
- A11y: one `h1`; landmark structure (`header/main/section[aria-labelledby]/footer`); focus-visible styles; 4.5:1 contrast for body text (hive-300 on hive-950 passes; verify hive-400 usages); skip-to-content link; reduced-motion.
- Perf: no new deps; system-loaded Google fonts already via `next/font`; hero visual pure SVG; images via `next/image` where raster; static generation for all marketing routes.

## 7. Verification criteria (done =)

1. `npm run build` (apps/www) clean; `npm run test` (apps/www vitest) green; `next lint` clean.
2. Every factual claim on the page traceable to §1/§9 sources; do-not-claim list absent.
3. Self-review pass (fresh-eyes + adversarial: copy honesty, visual rhythm, mobile at 375px, keyboard nav) with fixes applied.
4. No regressions to checkout/auth flows (routes untouched; smoke via build + route presence).

## 8. Rejected alternatives

- **Full rebrand / new visual identity** — rejected: product ships warm-Hive; site-product coherence beats novelty.
- **Multi-page marketing site (separate /features, /memory, /pricing pages)** — rejected for now: content volume doesn't justify it; single narrative page + methodology doc is the strongest shape at this stage. Anchors + navbar cover navigation.
- **Tailwind migration** — rejected: repo explicitly chose vanilla CSS for this app; CSS Modules give the same maintainability without a new build dependency.

## 9. Appendix — verified fact sheet

*(Filled from the product-truth exploration before copy implementation; see `docs/superpowers/specs/2026-07-03-www-fact-sheet.md`.)*
