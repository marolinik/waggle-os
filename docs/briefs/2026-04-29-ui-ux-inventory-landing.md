# Waggle UI/UX Component Inventory — Marketing Landing (`apps/www`)

**Date:** 2026-04-29
**Surface:** Marketing landing site (waggle-os.ai)
**Repo path:** `D:/Projects/waggle-os/apps/www`
**Sibling inventory:** OS shell (`apps/web`) lives in `briefs/2026-04-29-ui-ux-inventory-os-shell.md`. The two surfaces share **only the token vocabulary**; chrome paradigms, tech stacks, and component models diverge.

**Purpose:** Brief Claude Design (explore + research mode) on the current landing-page UI/UX state so it can produce a polish pass without re-discovering the surface area.

**Reading order for Claude Design:**
1. §1 — Tech stack and entry point
2. §2 — Component inventory (mounted, orphan, missing)
3. §3 — Design tokens (canonical `globals.css`)
4. §4 — Brand assets and usage rules
5. §5 — Anti-patterns (binding rejects)
6. §6 — Drift and polish opportunities
7. §7 — Source artifacts to read
8. §8 — Suggested polish-pass briefing shape

---

## §1. Tech stack — actual

- **Build:** Vite + React 19
- **Styling:** Pure CSS with custom properties (`apps/www/src/styles/globals.css`, 96 lines). **Tailwind is NOT installed in `apps/www`** despite v2.3 spec calling for Tailwind 4. The file's own header says "No Tailwind — pure CSS with custom properties for this static site."
- **Icons:** `lucide-react`
- **Entry:** `apps/www/src/main.tsx` → `src/App.tsx`
- **Tests:** `apps/www/__tests__/BrandPersonasCard.test.tsx` (single test file)
- **Data:** `apps/www/src/data/personas.ts` (13-bee shape per LOCKED 2026-04-22 IA)

**Drift to flag:** v2.3 ship spec (`briefs/2026-04-28-claude-design-landing-v2.3-prompt.md` §5) prescribes Tailwind 4 utilities. Polish must reconcile — either keep pure CSS for substrate independence and amend the spec, or migrate. Mixed approach will rot.

---

## §2. Components

### §2.1 Currently mounted in `App.tsx` (9 components, in order)

```tsx
// apps/www/src/App.tsx
const App = () => (
  <div className="min-h-screen" style={{ background: 'var(--hive-950)' }}>
    <Navbar />
    <Hero />
    <Features />
    <CrownJewels />
    <HowItWorks />
    <Pricing />
    <Enterprise />
    <BetaSignup />
    <Footer />
  </div>
);
```

| # | Component | File | LOC | Notes |
|---|---|---|---|---|
| 1 | `Navbar` | `components/Navbar.tsx` | 77 | Implemented |
| 2 | `Hero` | `components/Hero.tsx` | 50 | Mounts `bee-orchestrator-dark.png` 176px center — **violates v2.3 anti-pattern** (bees footer-mark only on primary landing). Copy is legacy "Your AI Operating System / AI Agents That Remember"; v2.3 wants variant A "Your AI doesn't reset. Your work doesn't either." or variant B "AI workspace that satisfies your CISO." |
| 3 | `Features` | `components/Features.tsx` | 58 | Implemented |
| 4 | `CrownJewels` | `components/CrownJewels.tsx` | 93 | Legacy "Crown Jewels" framing — not in v2.3 spec; replacement candidate by Proof/SOTA band (5 cards) |
| 5 | `HowItWorks` | `components/HowItWorks.tsx` | 51 | Likely 3-step or 5-step legacy. v1.1 wireframe LOCKS 5 steps (Capture/Encode/Retrieve/Reason/Audit); v2.3 collapses to 3 steps (Install once / Work normally / Compound). Reconcile. |
| 6 | `Pricing` | `components/Pricing.tsx` | 134 | Verify tier count: v1.1 wireframe = 3 tiers (Solo/Pro/Teams) + KVARK in Enterprise card; v2.3 ship = **4 tiers** (Free/Pro/Teams/Enterprise). PM trail favors v2.3 4-tier. |
| 7 | `Enterprise` | `components/Enterprise.tsx` | 34 | KVARK bridge implementation |
| 8 | `BetaSignup` | `components/BetaSignup.tsx` | 62 | Legacy beta CTA; **v2.3 spec removes BetaSignup entirely** — Download is the only conversion. Retire. |
| 9 | `Footer` | `components/Footer.tsx` | 26 | Tiny — v2.3 §3 SECTION 10 requires 5-column rebuild (Product / Research / OSS / Company / Legal) with Egzakta attribution and optional small monochrome bee mark |

### §2.2 Orphan / unmounted components

| Component | File | LOC | State |
|---|---|---|---|
| `BrandPersonasCard` | `components/BrandPersonasCard.tsx` | **419** | **Implemented but NOT imported into `App.tsx` — orphan.** Has its own test (`__tests__/BrandPersonasCard.test.tsx`). Per v1.1 LOCKED wireframe + LOCKED 2026-04-22 personas decisions, this is the canonical 13-bee `6+6+1` personas grid. v2.3 evolved away from this toward a 17-agent-persona `4×4 + Coordinator sidebar` model. Polish must decide: restore the 13-bee grid, rebuild as 17-agent grid, or replace. |

### §2.3 Specified in v2.3 but not yet implemented

Per `briefs/2026-04-28-claude-design-landing-v2.3-prompt.md` §3 + §5, the v2.3 ship version requires these components which do **not** exist in `apps/www/src/components/`:

| Spec'd component | Spec section | Notes |
|---|---|---|
| `<Hero variant="A\|B">` with variant resolver | §3 SECTION 1 | Hero exists but not as variant component; `lib/hero-headline-resolver.ts` not present |
| `<ProofPointsBand>` (5-card elastic grid) | §3 SECTION 2 | Not implemented; replaces `CrownJewels` semantically. Cards in order: PROVENANCE, SOURCE (Apache 2.0), NETWORK (Zero cloud), COMPLIANCE, BREADTH (11 sources) |
| `<HarvestBand>` | §3 SECTION 3 | 11 logo tiles (4×3 / 3×4 / 2×6) + 2 sync-mode callouts (Local continuous, Cloud on-demand) + 3-claim feature stripe |
| `<MultiAgentRoom>` | §3 SECTION 4 | Window mockup (researcher/writer/analyst/coordinator tiles with violet pulse + mint done) + message bus visualization + 3 feature points + JetBrains Mono code snippet |
| `<HowItWorks>` 3-step | §3 SECTION 5 | Existing `HowItWorks` is 5-step from v1.1 — v2.3 simplified to 3 steps |
| `<PersonasGrid>` 4×4 + Coordinator sidebar | §3 SECTION 6 | 16 agent personas in 4×4 grid + 17th (Coordinator) as sidebar callout. Tile = name + 1-line role only (no tool counts, no model badges) |
| `<PricingTiers>` 4-tier + billing toggle + collapsible compare | §3 SECTION 7 | Free $0 / Pro $19 ($189/yr) / Teams $49/seat ($489/yr, 3-seat min) / Enterprise (consultative, KVARK). Trial is a CTA inside Pro card, not a separate tier. |
| `<TrustBand>` | §3 SECTION 8 | 5 trust signals (Sovereign → Compliance → OSS → Methodology → Egzakta) + Egzakta spine + hex-texture-dark.png at 8–12% soft-light + MCP one-line callout |
| `<FinalCTA>` + KVARK bridge | §3 SECTION 9 | Headline "Stop pasting context. Start using AI that remembers." + 3 CTAs (Download / Compare tiers / KVARK) |
| Updated `<Footer>` 5-column | §3 SECTION 10 | Product / Research / OSS / Company / Legal columns with footnote line + optional small bee mark |
| `lib/hero-headline-resolver.ts` | §5 | Variant gate for `?p=` / `utm_source` heuristic |
| `data/proof-points.ts` | §5 | 5 entries, ordered |
| `data/harvest-adapters.ts` | §5 | 11 entries (ChatGPT, Claude, Claude Code, Claude Desktop, Gemini, Perplexity, Cursor, Notion, Markdown, Plaintext, PDF, URL+Universal) |
| `data/pricing.ts` | §5 | 4 tiers |
| Event taxonomy stub (`landing.*` events) | §5 | `page_view`, `section_visible`, `cta_click`, `pricing.billing_toggle.changed`, `harvest.adapter_clicked`, `multi_agent.workflow_clicked` |

---

## §3. Design tokens — canonical `apps/www/src/styles/globals.css`

This file is the **single source of truth** for landing tokens. Mirror these into Claude Design's token panel before iterating. The OS shell uses the same vocabulary but composes via Tailwind utilities.

### §3.1 Color

```css
:root {
  /* Hive neutral ladder — 12 stops */
  --hive-50:  #f0f2f7;
  --hive-100: #dce0eb;
  --hive-200: #b0b7cc;
  --hive-300: #7d869e;
  --hive-400: #5a6380;
  --hive-500: #3d4560;
  --hive-600: #2a3044;
  --hive-700: #1f2433;
  --hive-800: #171b26;
  --hive-850: #11141c;
  --hive-900: #0c0e14;
  --hive-950: #08090c;   /* canonical dark ground */

  /* Honey accent ladder — 4 stops + 2 glow tokens */
  --honey-300: #fcd34d;
  --honey-400: #f5b731;
  --honey-500: #e5a000;   /* primary CTA fill */
  --honey-600: #b87a00;
  --honey-glow:  rgba(229, 160, 0, 0.12);
  --honey-pulse: rgba(229, 160, 0, 0.06);

  /* Status accents (sparingly) */
  --status-ai:      #a78bfa;   /* violet — synthesis / AI activity */
  --status-healthy: #34d399;   /* mint — done / healthy */

  /* Elevation */
  --shadow-honey:    0 0 24px rgba(229,160,0,0.12), 0 0 4px rgba(229,160,0,0.08);
  --shadow-elevated: 0 4px 16px rgba(0,0,0,0.5),    0 2px 4px rgba(0,0,0,0.3);
}
```

**Locked palette:** honey + violet + mint. **NO blue** — explicit anti-pattern in v2.3.

### §3.2 Typography

- Primary: `Inter` variable, 400–700, system-ui fallback
- Code: `JetBrains Mono` (rare on landing — only Multi-Agent Room code snippet)
- `-webkit-font-smoothing: antialiased`
- Selection: `rgba(229, 160, 0, 0.3)` on `--hive-50`
- Headline scale (per v2.3): hero 48–64px / section 36–48px / subhead 24–32px
- Body: 16–18px / caption: 14px
- Letter-spacing on display weights: `-0.02em`

### §3.3 Motion

Defined directly in `globals.css`:

- `@keyframes float` — translateY ±8px, 3s ease-in-out infinite
- `@keyframes honey-pulse` — opacity 0.4↔0.8 + scale 1↔1.05, 3s
- `@keyframes card-enter` — opacity + 20px translateY, 0.6s ease-out
- Stagger classes: `.card-enter-1` through `.card-enter-4` (0.1s steps)
- Hover affordance: `.card-lift` (translateY -2px + shadow-honey + honey-500 border)
- Active feedback: `.btn-press` (scale 0.97)

**Anti-pattern (v2.3):** NO scroll-triggered storytelling motion. Hover micro-interactions only.

### §3.4 Background pattern

- `.honeycomb-bg` — inline SVG hex pattern at `#1f2433` 15% opacity (subtle on hero)
- `hex-texture-dark.png` — heavier honeycomb texture for trust band only at 8–12% opacity, soft-light blend

### §3.5 Breakpoints

Per v1.1 wireframe spec: `sm` 640 / `md` 768 / `lg` 1024 / `xl` 1280. Desktop-first; every section must collapse cleanly at `sm`.

---

## §4. Brand assets

| Asset | Location | Usage rule (v2.3 LOCKED) |
|---|---|---|
| `waggle-logo.svg` | `apps/www/public/brand/` | Header + footer ONLY |
| 13 × `bee-*-dark.png` (orchestrator, hunter, researcher, analyst, connector, architect, builder, writer, marketer, team, celebrating, confused, sleeping) | `apps/www/public/brand/` + reference renders in `D:/Projects/PM-Waggle-OS/_generated/bee-assets/` | **Landing-restricted.** v2.3 says: NOT in primary sections; reserved for loading skeletons, 404 page, optional small monochrome footer mark next to wordmark. |
| `hex-texture-dark.png` honeycomb pattern | `apps/www/public/brand/` | Trust band background ONLY at 8–12% opacity, soft-light blend |
| `bee-builder-dark-v1.png` + 2k variant | `D:/Projects/PM-Waggle-OS/_generated/bee-assets/` | Reference renders from 2026-04-21 builder-bee regen |

**Active conflict:** `Hero.tsx` line 16 mounts `bee-orchestrator-dark.png` at 176×176 in hero center — directly contradicts v2.3 binding rule "bee illustrations: NOT in primary sections." Polish must remove or relocate.

---

## §5. Anti-patterns (v2.3 binding — surface to Claude Design)

Generation will fail pre-launch review if any of these are present.

**Correctness-binding:**
- NO blue accent — locked palette is honey + violet + mint
- NO LoCoMo / Opus / SOTA performance numbers (held until benchmark publishes)
- NO competitor names (Cowork, Mem0, Letta, Notion AI, Cursor as competitor, Hermes, Mastra, CrewAI, ChatGPT Teams, Glean, Dust.tt, Microsoft Copilot Studio, Salesforce Agentforce, etc.)
- NO bee mascot grid as primary section; bees footer-mark only
- NO "mind" as user-facing vocabulary — use "memory" or "knowledge graph"
- NO `github.com` URL until repo migrates to egzakta org
- NO arxiv preprint links until publish
- NO 5-tier pricing — exactly 4 tiers (Free / Pro / Teams / Enterprise)
- NO 5 hero variants — only A and B in v2.3 (C/D/E reserved for v3)
- NO specific EU AI Act article numbers (12, 14, 19, 26, 50) until verified against final 2024/1689 text
- NO "independent" without a named third-party reviewer
- NO claims about cohort behavior pre-launch ("median user", "30-day pattern")
- NO specific marketplace counts (use generic descriptors)
- NO "Dedicated account manager" — use "Named customer success contact"
- NO "Email support 48h SLA" — use "Email support, 72h response target"
- NO specific quarter dates for unshipped adapters (Cursor / Notion = "coming soon")
- NO "review queue" UI promise on launch (use "ambiguous matches handled in next release")
- NO bee names as UI command aliases or section labels
- NO fake-precise illustrative numbers ("12,847 EDGES" → "12k+ EDGES")

**Voice / positioning:**
- NO "AI does everything" aspirational copy
- NO KVARK pitch beyond one sentence + one CTA in Final CTA AND one Enterprise tier card
- NO "cognitive layer" jargon in first three scroll viewports
- NO light-mode design (dark-first locked through v2.x)
- NO 15+ bullet feature-count pricing tiers — 6–8 bullets max per tier
- "Backed by Egzakta" must say "Built by Egzakta Group"

**Hygiene:**
- NO SaaS landing clichés: centered hero with feature icon grid, "trusted by [logos]" carousel, CEO quote carousel
- NO trust-logos carousel ("As seen in...")
- NO cookie banner blocker, modal overlay popups, exit-intent popups
- NO scroll-triggered storytelling motion (hover micro-interactions only)

Full anti-pattern list with rationale: `briefs/2026-04-28-claude-design-landing-v2.3-prompt.md` §4.

---

## §6. Drift and polish opportunities (landing-only)

### §6.1 Critical drift (ship-blocking)

1. **Section sequence mismatch.** `App.tsx` mounts a 9-section legacy layout (Navbar / Hero / Features / CrownJewels / HowItWorks / Pricing / Enterprise / BetaSignup / Footer). v2.3 ship spec requires (Navbar / Hero / Proof / Harvest / MultiAgent / How / Personas / Pricing / Trust / FinalCTA / Footer). Five new sections must land; two legacy sections (`CrownJewels`, `BetaSignup`) must be retired or reframed.
2. **Personas grid model conflict.** v1.1 LOCKED wireframe (2026-04-22) ships **13 brand bees in `6+6+1`** geometry via `BrandPersonasCard` (orphan in code). v2.3 ship brief (2026-04-28) replaces with **17 agent personas in `4×4 + Coordinator sidebar`** (text-only tiles, no bee mascots). PM ratification trail favors v2.3. Polish must pick one — `BrandPersonasCard.tsx` either rebuilds or retires.
3. **Hero copy + art-direction.** Current `Hero.tsx` shows "Your AI Operating System" / "AI Agents That Remember" with bee-orchestrator center. v2.3 requires variant A (Marcus default) "Your AI doesn't reset. Your work doesn't either." OR variant B (Klaudia/regulated) "AI workspace that satisfies your CISO." with NO bee in primary content. Hero variant resolver also missing.
4. **Pricing tier count.** v2.3 mandates **4 tiers** (Free / Pro / Teams / Enterprise). Verify `Pricing.tsx` matches; v1.1 specified 3 tiers. PM trail favors v2.3 4-tier.

### §6.2 Important drift (polish-grade)

5. **Tailwind absent on landing.** v2.3 §5 prescribes Tailwind 4 utilities; reality is inline styles + CSS custom properties. Decide and align.
6. **Bee-on-hero violation.** `Hero.tsx` line 16 mounts a 176px bee illustration centrally — directly contradicts v2.3 binding rule "bee illustrations: NOT in primary sections."
7. **`HowItWorks` step count.** v1.1 = 5 steps (Capture/Encode/Retrieve/Reason/Audit). v2.3 = 3 steps (Install once / Work normally / Compound). Decide and align.
8. **Footer too thin.** Existing 26-LOC `Footer.tsx` likely needs full rebuild to meet v2.3 5-column shape.
9. **Trust band missing.** No `TrustBand` component exists; hex-texture-dark.png at 8–12% soft-light not yet implemented.
10. **Pricing billing toggle.** Verify Monthly / Annual toggle (~17% save) is wired in `Pricing.tsx`; v1.1 §6 + v2.3 §7 both require it.

### §6.3 Polish-only (no architectural change)

11. Hero MPEG-4 loop placeholder: ≤800KB, 7s duration, `prefers-reduced-motion` suppression mandatory, static poster always-loaded first. Ensure not LCP candidate.
12. Card-lift hover affordance is in `globals.css` but verify all card-shaped components (Pricing tiles, Proof cards, Persona tiles) opt into `.card-lift`.
13. Honey-pulse halo behind hero CTA already exists (`Hero.tsx` lines 8–12) — preserve in any iteration.
14. Floating bee animation (`.float`) currently used in Hero — relocate to footer mark only per v2.3.
15. Selection color (`::selection`) honey-tinted — preserve.
16. `prefers-reduced-motion` audit across all motion utilities (currently not respected in CSS — only spec'd as enforced at component level for hero loop).

---

## §7. Source artifacts for Claude Design (priority-ranked)

### §7.1 Canonical (read in full)

1. `D:/Projects/PM-Waggle-OS/strategy/landing/landing-wireframe-spec-v1.1-LOCKED-2026-04-22.md` — 65KB, 7-section landing wireframe with locked component contracts, copy keys, measurability, anti-patterns. Authoritative for any section v2.3 hasn't changed.
2. `D:/Projects/PM-Waggle-OS/briefs/2026-04-28-claude-design-landing-v2.3-prompt.md` — 36KB, **ship version** for landing v2 generation. Contains the 9-section + footer brief, palette lock, anti-patterns, 22 PASS/FAIL signals, Marko override windows.

### §7.2 Supporting (skim or query)

3. `D:/Projects/PM-Waggle-OS/strategy/landing/information-architecture-2026-04-19.md` — 50KB master IA (9 sections; v1.1 simplified to 7; v2.3 evolved back to 9).
4. `D:/Projects/PM-Waggle-OS/strategy/landing/persona-research-2026-04-18-rev1.md` — 84KB persona research, 7 archetypes for v2.3 hero variant gating.
5. `D:/Projects/PM-Waggle-OS/briefs/2026-04-28-landing-copy-v4-waggle-product.md` — 31KB latest landing copy v4.
6. `D:/Projects/PM-Waggle-OS/briefs/2026-04-22-claude-design-landing-brief.md` — original Claude Design landing brief (audit trail; superseded by v2.3).
7. `D:/Projects/PM-Waggle-OS/briefs/2026-04-22-brand-bee-personas-card-spec.md` — 6.6KB, 13-bee persona card component spec.
8. `D:/Projects/PM-Waggle-OS/briefs/2026-04-22-cc-personas-card-component-parallel.md` — 11KB parallel implementation brief that produced `BrandPersonasCard.tsx`.
9. `D:/Projects/PM-Waggle-OS/briefs/2026-04-22-personas-card-copy-refinement.md` — 9.9KB locked persona copy.
10. v2.0 / v2.1 / v2.2 prompt history under `briefs/` — audit trail for how v2.3 evolved (do not reuse).

### §7.3 Repo references (verify against)

- `D:/Projects/waggle-os/apps/www/src/styles/globals.css` — canonical token source.
- `D:/Projects/waggle-os/apps/www/src/components/*.tsx` — current 10 components (1,003 LOC total).
- `D:/Projects/waggle-os/apps/www/src/data/personas.ts` — persona data (13-bee shape).
- `D:/Projects/waggle-os/apps/www/__tests__/BrandPersonasCard.test.tsx` — only existing test.
- `D:/Projects/waggle-os/CLAUDE.md` + `docs/ARCHITECTURE.md` — package + persona canonical lists.
- `D:/Projects/waggle-os/docs/research/06-waggle-os-product-overview.md` — TL;DR three-sentence pitch.
- `D:/Projects/waggle-os/docs/research/03-memory-harvesting-strategy.md` — 11 adapters list.

### §7.4 Brand asset references

- `D:/Projects/waggle-os/apps/www/public/brand/` — `waggle-logo.svg`, 13 × `bee-*-dark.png`, `hex-texture-dark.png`.
- `D:/Projects/PM-Waggle-OS/_generated/bee-assets/` — latest builder-bee renders (v1, 2k variant).

---

## §8. Polish-pass instruction shape (suggested briefing for Claude Design)

> Audit Waggle's marketing landing (`D:/Projects/waggle-os/apps/www`) against the v1.1 wireframe LOCK and the v2.3 ship brief. Reconcile drift between the 9 currently mounted components and the 10 v2.3-spec'd sections. Produce: (a) a polish backlog grouped by severity, (b) targeted claude.ai/design iterations for the top 5 highest-leverage gaps (suggested order: Hero variant rebuild + bee removal, ProofPointsBand 5-card grid, PersonasGrid 4×4+1 reconciliation, TrustBand new build, FinalCTA + Footer 5-column rebuild), (c) decision recommendation on Tailwind migration vs pure-CSS retention. Honor the locked palette (honey + violet + mint, NO blue), the bee-usage rules (footer-mark only on primary landing), the dark-first ground at `--hive-950` `#08090c`, hover-only motion (no scroll-triggered storytelling), and the v2.3 anti-pattern list in §5 of this inventory.

---

**End of landing inventory.**

Generated 2026-04-29 from read-only scan. Sibling: `briefs/2026-04-29-ui-ux-inventory-os-shell.md`.
