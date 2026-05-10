# CC Sesija D — Apps/www Next.js Port v3.2 AMENDMENT

**Date:** 2026-05-02
**Status:** AMENDMENT to `briefs/2026-04-25-cc1-apps-www-nextjs-port-brief.md` (original still authoritative for stack, folder structure, i18n contract, Stripe wiring, theme toggle, GDPR cookie banner, vitest setup)
**Authored by:** PM (post landing v3.2 closure)
**Trigger:** Landing v3.2 copy ratification CLOSED 2026-05-02 (per `memory/project_landing_v32_2026_05_02.md`); 7 surgical edits shipped on Claude Design project 019dd47b "Waggle Landing — v1"; ready for apps/www port implementation
**Cost cap:** $10 hard / $8 halt — port je mostly mechanical (component structure + copy paste from prototype + i18n extraction); no eval, no LLM-heavy operations

> ## ⚠️ POST-§0 PM RESCISSION — Edit 5 (Sovereign tile) DROPPED 2026-05-02
>
> CC Sesija D §0 preflight evidence dump otkrio konflikt sa locked persona card (`decisions/2026-04-22-personas-card-copy-locked.md`): Architect persona već postoji na poziciji #5 sa bee-architect-dark.png; Sovereign 13. tile bi bio asset duplicate + 14-tile grid restructure + lock violation. **Edit 5 (Sleeping → Sovereign sa Architect bee) je RESCINDED.** Personas card ostaje per LOCK 2026-04-22: 13 tiles uključujući Sleeping #13.
>
> Sovereign positioning već dovoljno čuje na 3 locked mesta: (i) Final CTA subhead "KVARK for sovereign deployments" (Edit 3 stays), (ii) KVARK bridge sentence + CTA, (iii) Trust Band Egzakta backing. Dodatna persona tile bila je P1 polish, ne strateški must.
>
> **Implementation impact:**
> - apps/www port: ignore §1.4 entirely; keep 13 personas as-is per existing personas.ts
> - Claude Design 019dd47b prototype: Edit 5 reverted in separate ~2-min CC iteration tako da prototype source-of-truth ostane konzistentan sa apps/www port output-om
> - Acceptance criterion #8 u §3: REMOVED ("13th persona tile = Sovereign sa bee-architect-dark.png" više ne važi); replaced sa "13 personas as-is per LOCK 2026-04-22 (Sleeping #13)"
>
> **Why:** Treba šira hijerarhija LOCK-ova. Persona card LOCK (2026-04-22) je strateška decision-record-protected odluka; v3.2 amendment je tactical polish. Tactical ne sme da overwrite-uje strateški LOCK bez explicit re-ratification kroz decision memo. Lekcija za sledeće amendmente: pre nego što PM authora copy edit koji dotiče locked artefakt, mora explicit ratification check vs odgovarajući LOCK file u decisions/.

---

## §0 — Why this amendment

Original 2026-04-25 brief je bilo napisano pre nego što je Claude Design landing prototype-ovan. Brief je definisao stack i target structure ali bez final copy reference. Sada (2026-05-02) Claude Design landing v3.2 je copy-locked i ready za port. Ovaj amendment popunjava copy gap + lockuje 7 specifičnih izmena koje moraju biti respektovane tokom port-a.

**Important — koji prototype je canonical:**
- ✅ **Project 019dd47b "Waggle Landing — v1"** sa final copy v3.2 = canonical source. CC mora referencirati ovaj prototype za sve layout/SVG/animation odluke.
- ❌ Project 019dd700 sa color rebrand = deprecated. Ne koristiti.
- ✅ **Project ea934a60 "Waggle Design System"** = canonical DS source za sve token vrednosti (Hive scale, Honey accent, Type, Spacing, Components). Published + Default ON.

---

## §1 — Final copy locks (v3.2 ratified, 2026-05-02)

CC mora poštovati ove copy stringove tačno (1:1 match sa prototype). Ne menjaj jezičke nijanse, ne re-paraphrase. Ako neki string nije u listi ispod, default je ono što je u prototype-u Claude Design 019dd47b.

### §1.1 Hero (Variant A Marcus default + 4 ostalih variants)

Sva 5 variants (A Marcus / B Klaudia / C Yuki / D Sasha / E Petra) ostaju verbatim per prototype. Variant resolver lib `apps/www/src/lib/hero-headline-resolver.ts` mapira:
- `?p=compliance` ili `utm_source=egzakta` → B
- `utm_source=hn` ili `?p=founder` → C
- `utm_source=github` ili `?p=developer` → D
- `utm_source=legal-tech` → E
- default → A

**Hero microcopy strip (UPDATED v3.2):** `"17 AI platforms · Local-first · Apache 2.0 · EU AI Act ready"` (replaces prethodno "Free for individuals · Local-first · Apache 2.0 substrate · EU AI Act ready"). Apply to all 5 variants.

**Hero diagram bottom stats (UPDATED v3.2):** `"12,847 EDGES · 17 PROVIDERS · 42ms P99 RECALL · 0 CLOUD CALLS"` (replaces prethodno "4 PROVIDERS"). 4 LLM chips u central diagram-u ostaju kao illustrative samples; 17 reflects actual harvest scope iz Memory app Pass 7 verifikacija (ChatGPT/Claude/Claude Code/Claude Desktop/Gemini/AI Studio/Perplexity/Grok/Cursor/Manus/GenSpark/Qwen/MiniMax/z.ai/Other + 2 more = 17 total).

### §1.2 Proof / SOTA Band (5 cards) — REORDERED

**New card order (v3.2):**
1. **GEPA evaluation** / Stat: "+12.5pp" / Name: "Claude smarter on held-out" / Description: "Independently validated cognitive uplift from the Waggle memory layer. Production-wired today. Methodology in arxiv preprint."
2. **LoCoMo substrate** / Stat: "74%" / Name: "Beats Mem0 paper claim (66.9%)" / Description: "Substrate beats Mem0 paper by 7.1 points on LoCoMo." (REWORDED)
3. **Substrate** / Stat: "Apache 2.0" / Name: "Open source, fork it" / Description unchanged
4. **Network** / Stat: "Zero cloud" / Name: "Local-first by default" / Description unchanged
5. **EU AI Act** / Stat: "Article 12" / Name: "Audit reports built-in" / Description unchanged

Trio-strict 33.5% card je DROPPED (pilot fail-ovi h2=1/3 h3=0/3 h4=0/3 = conditional finding, ne shipping evidence; replaced sa GEPA Faza 1 +12.5pp koji je production-validated).

### §1.3 How It Works — Step 02

Step 02 description ends sa: `"...persists across providers, sessions, and machines, automatically."` (REWORDED, replaces prethodno "...without you doing a thing.")

### §1.4 Personas — 13th tile

13th solo bottom tile je **"Sovereign"** (replaces "Sleeping"):
- Tile name: `"Sovereign"`
- One-line JTBD: `"Local-first, regulator-ready, vendor-independent."`
- **Bee illustration:** `bee-architect-dark.png` (CC-recommended u Claude Design v3.2 sesiji za "regal/system-designer gestalt"). Verifikacija: ako asset bee-architect-dark.png postoji u apps/www/public/brand/, koristi ga; ako ne, javi PM da odluči alternativu (kandidati: bee-orchestrator, bee-architect, bee-builder po queen-bee-adjacent semantici).

Plus Architect persona u 6+6 grid (tile 5) ne smije biti duplicate-ovana — ako apps/www personas data trenutno ima Architect i u glavnom 12-tile-u i u 13. solo tile-u, drop Architect iz glavnog 12 (replaced ranije sa nečim drugim) ili pick alternative bee illustration za 13. (npr. bee-orchestrator-dark.png). HALT-and-PM ako postoji konflikt između 12-tile + 13-tile asset usage.

### §1.5 Final CTA — subhead

Subhead REWORDED: `"Free for individuals. Pro for power users. Teams for organizations. KVARK for sovereign deployments."` (replaces prethodno "Sovereign for enterprises") — ujednačava 4. tier promise sa KVARK bridge sentence direktno ispod ("Need it on your organization's sovereign infrastructure? Talk to KVARK team →").

### §1.6 Sve ostalo — verbatim per prototype

Top Navigation, Pricing (Solo $0 / Pro $19/mo / Teams $49/seat/mo + comparison table + monthly/annual toggle), Trust Band (Egzakta DACH/CEE/UK since 2010, 5 trust signals), Footer (4 link columns + base line) — sve copy je locked verbatim per Claude Design 019dd47b prototype text dump (već documentovan u session transcript 2026-05-02).

---

## §2 — Implementation deltas vs original 2026-04-25 brief

### §2.1 Component additions

Original brief je listao 10 client/server components. v3.2 dodaje:
- **`components/ProofPointsBand.tsx`** — server component, render 5 cards from `data/proof-points.ts` (NEW data file). 5 cards per §1.2 order.
- **`data/proof-points.ts`** — NEW file sa 5 proof point objects (caption / stat / name / description). PM-locked content per §1.2.
- **`components/HeroVisual.tsx`** — client component (potreban za variant tabs interactivity + hive pulse animation sa prefers-reduced-motion suppression). Port direktno iz prototype HTML.
- **`lib/hero-headline-resolver.ts`** — NEW server-side helper. URL param + utm_source heuristic → variant A-E. Default A.
- **`lib/event-taxonomy.ts`** — NEW. Stub za landing.* events (page_view, section_visible, cta_click, pricing.billing_toggle.changed). Console.log u dev, no-op u prod do prave analytics (Phase 2).

### §2.2 i18n extraction (188-key contract)

Per prototype caveat note: "Copy is in JSX, not yet extracted to landing.* i18n keys (188-key contract)". CC mora extract-ovati sve copy iz JSX u `messages/en.json` pod `landing.*` namespace, jedan key po user-visible string. Variants A-E hero copy ide pod `landing.hero.variant_a.headline`, `landing.hero.variant_a.subhead` itd.

Acceptance: 188-key count je ciljni, ne strict. Ako CC dobije 175 ili 195, ok. Strict je: svaki user-visible string MORA biti u en.json, no string literal u JSX after extraction.

### §2.3 Comparison table — keep `<details>` collapsible

Per prototype caveat: "Comparison table renders inside `<details>`; if your IA Faza 2 wants it always-visible, swap the `<details>` for a plain `<section>`." **PM odluka:** keep `<details>` collapsible. Reason: tier comparison je heavy (10+ rows), default-collapsed reduces above-fold density. User klikom na "Compare tiers in detail" expand-uje.

### §2.4 MPEG-4 hero loop placeholder

Per prototype caveat: "MPEG-4 hero loop is a static diagram for now — drop the .mp4 into assets/ and swap the `<HeroVisual>` body when ready." **PM odluka:** ostaje static diagram za v3.2 port. MPEG-4 loop = post-launch enhancement (Phase 2 fast-follow), ne blokira Day 0. CC ne treba da kreira placeholder za .mp4 file. HeroVisual component renderuje samo SVG diagram.

### §2.5 v1.5 light-mode

Per prototype caveat: "v1.5 light-mode swap is intentionally absent (locked dark-first)." **PM odluka:** keep dark-first locked. Light mode je v1.5 stretch ne v1 launch. Original brief §2.1 globals.css augmentation za light tokens — DEFERRED post-launch. CC ne dodaje `[data-theme="light"]` block, ne dodaje ThemeToggle component, ne dodaje theme persistence lib u v3.2 port. Skip those entire sections.

### §2.6 GDPR cookie banner — keep

Original brief §1.3 lists CookieBanner. **PM odluka:** keep. EU launch readiness implies cookie consent flow.

---

## §3 — Acceptance criteria

CC port shipping když:
1. ✅ Sve 7 sections u locked order (Hero → Proof → How → Personas → Pricing → Trust → Final CTA → Footer)
2. ✅ Sve 5 hero variants resolvable kroz URL ?p= + utm_source param
3. ✅ Hero microcopy "17 AI platforms..." (NE "Free for individuals...")
4. ✅ Hero diagram bottom stat "17 PROVIDERS" (NE "4 PROVIDERS")
5. ✅ Proof Card 1 = GEPA +12.5pp (NE Trio-strict 33.5%)
6. ✅ Proof Card 2 description = "Substrate beats Mem0 paper by 7.1 points on LoCoMo."
7. ✅ Step 02 ends sa "...automatically." (NE "...without you doing a thing.")
8. ✅ 13th persona tile = Sovereign sa bee-architect-dark.png (ili PM-decided alternative)
9. ✅ Final CTA subhead = "...KVARK for sovereign deployments." (NE "...Sovereign for enterprises.")
10. ✅ KVARK bridge u Final CTA: one sentence + one CTA (per LOCK)
11. ✅ All copy extracted u messages/en.json pod landing.* namespace
12. ✅ Stripe checkout integration radi (use API route /api/stripe/checkout, ne external cloud.waggle-os.ai)
13. ✅ OS detection wired na Hero primary CTA + Solo tier CTA + Final CTA primary
14. ✅ Hive pulse animation sa prefers-reduced-motion suppression
15. ✅ Build clean: `npm run build` passes; `npm run lint` clean; vitest 100% green
16. ✅ Lighthouse audit: Performance ≥85, Accessibility ≥95, SEO ≥95 (PM Pass post-build)

---

## §4 — Halt triggers

CC HALT-uje i poziva PM ratifikaciju ako:

- Asset `bee-architect-dark.png` ne postoji u apps/www/public/brand/ → halt + alternativa pick
- Existing apps/www personas data ima conflict sa Sovereign tile addition → halt + scope decision
- Stripe API endpoint cloud.waggle-os.ai migration breaks production payment flow → halt + revert
- 188-key i18n extraction ne može biti completed unutar 60 min CC time → halt + scope reduce
- Build break > 30 min retry loop → halt + diagnostic
- Cumulative spend > $8 (halt threshold) → halt + report
- Any new feature beyond §1+§2 scope → halt-and-PM

---

## §5 — Out of scope (eksplicitno)

CC ne radi:
- ThemeToggle / light mode / [data-theme="light"] block (v1.5 deferred)
- MPEG-4 hero loop placeholder (post-launch fast-follow)
- A/B testing framework (post-launch)
- Server-side rendering of hero variants (variant resolver radi client-side fine za v1)
- Marketing email integration (BetaSignup ide na /api/waitlist endpoint, no email fan-out)
- Analytics provider integration (event taxonomy stub only, console.log u dev)
- Cookie banner cookie value persistence beyond consent flag (no cross-domain tracking)

---

**End of amendment. Use sa originalnim 2026-04-25 brief side-by-side.**
