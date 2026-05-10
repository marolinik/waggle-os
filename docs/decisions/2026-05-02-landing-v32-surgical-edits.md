# LOCKED Decision — Landing v3.2 (10 Surgical Copy Edits, Claude Design 019dd47b)

**Date:** 2026-05-02
**Status:** LOCKED
**Author:** PM (decision memo authored retroactively 2026-05-05 to close decisions/ folder gap iz consolidation 2026-05-04)
**Ratified by:** Marko (delegirao steering 2026-05-02 "sve ti, vec toliko znas o celoj prici"; ratifikacija ovih 10 odluka kao copy ship version; explicit "uradi to sve" 2026-05-05 to author missing decision memos)
**Binds:** Landing v3.2 ship copy, Track D apps/www Next.js port scope, Trust Band Card 4 link target gating
**Cross-references:**
- `strategy/landing/2026-04-30-landing-v3-draft.md` (predecessor v3 base)
- `strategy/landing/2026-04-30-landing-v3.1-refreshed-overnight.md` (predecessor v3.1)
- `strategy/landing/landing-wireframe-spec-v1.1-LOCKED-2026-04-22.md` (canonical wireframe binding)
- `strategy/landing/persona-research-2026-04-18-rev1.md` (persona inputs za 5 hero variants)
- `decisions/2026-04-30-pre-launch-sprint-consolidation-LOCKED.md` (binds Track D as Day 0 gate)
- Memory entry `project_landing_v32_2026_05_02.md` (point-in-time observation, primary source)
- Claude Design project `019dd47b` "Waggle Landing — v1" (CC implementation surface)
- Claude Design project `019dd700` (deprecated baseline sa color rebrand, preserved kao backup)
- Canonical Waggle Design System project `ea934a60` (DS authority — Honey amber #e5a000 + Hive #08090c + 8% accent ceiling)

---

## §1 — Pivot history

Sesija je započeta na Claude Design project `019dd700` sa color rebrand-om (overnight CC izabrao warm cream-orange paletu out-of-DS, PM identifikovao mismatch kroz canonical Waggle Design System). Color rebrand uspešan na `019dd700` (CC report: "Zero warm-cream surfaces remain", honey footprint 1.0-1.2% well under 8% rule).

Marko zatim ratifikovao novi base — project `019dd47b` "Waggle Landing — v1" — kao "ovaj dizajn je dobar, animacije i SVG-ovi su dobri, treba da se sredi copy". `019dd700` rad postaje deprecated (preserved kao backup ali ne shipping).

---

## §2 — v1 base feature set (locked, not modified u v3.2)

9-section IA (Top Nav + Hero + Proof + How + Personas + Pricing + Trust + Final CTA + Footer). 5 hero variants: A Marcus default, B Klaudia compliance, C Yuki founder, D Sasha developer, E Petra legal-tech, sa URL `?p=` + `utm_source` resolver. macOS-window hero visual SVG (4 LLM provider chips + central hexagon + 5 personas). Hive pulse animation sa `prefers-reduced-motion` suppression. Lucide inline SVG-ovi throughout. OS detection na "Download for {os}" CTA. KVARK bridge u final CTA only (one sentence, one CTA, locked). 188-key i18n contract (currently u JSX, not yet extracted). Već DS-canonical: `hive-950` background, honey-amber accents, Inter typography.

---

## §3 — 10 ratifikovanih copy odluka

### P0 priority (3 odluke)

**Odluka 1 — Drop Trio-strict 33.5% Card 2 → replace sa GEPA "+12.5pp Claude smarter on held-out" Card.** Reorder Proof Band cards: GEPA / LoCoMo / Apache 2.0 / Zero cloud / EU AI Act. **Razlog:** pilot N=12 FAIL h2=1/3 h3=0/3 h4=0/3 (per `project_pilot_2026_04_26_result`); 33.5% trio-strict je conditional finding NE shipping evidence; GEPA Faza 1 +12.5pp je production-wired (Pass 7 + Block C) i defenzivnije za peer review.

**Odluka 2 — Final CTA subhead "Sovereign for enterprises" → "KVARK for sovereign deployments".** Ujednačava 4. tier promise sa KVARK bridge sentence direktno ispod.

**Odluka 3 — Hero subhead ostaje as-is.** Clean, memorable. Proof brojevi idu u Proof Band Card 1 GEPA replacement.

### P1 priority (5 odluka)

**Odluka 4 — LoCoMo card description tighter.** "Substrate beats Mem0 paper by 7.1 points on LoCoMo" (74 - 66.9 = 7.1pp explicit, paper claim #1 reference).

**Odluka 5 — Step 02 voice tighter.** "without you doing a thing" → "automatically" (voice professional + sovereign per voice anchor).

**Odluka 6 — Sleeping persona 13th tile → Sovereign sa JTBD "Local-first, regulator-ready, vendor-independent."** Bee illustration: **Architect bee** (regal/system-designer gestalt, fits "regulator-ready, vendor-independent" message). PM-elected, can be revisited ako Marko predlaže drugu illustraciju.

**Odluka 7 — Pro tier 14-day trial KEEP.** $19/mo low enough da trial je low-friction conversion driver, ne potrebno menjati.

**Odluka 8 — Trust Band "Backed since 2010" KEEP.** Consistent kroz 7+ briefova, zadržava Egzakta heritage signal.

### P2 priority (2 odluke)

**Odluka 9 — Hero microcopy strip + diagram bottom stat.** Strip: "Free for individuals · Local-first · Apache 2.0 substrate · EU AI Act ready" → **"17 AI platforms · Local-first · Apache 2.0 · EU AI Act ready"**. Diagram bottom stat: "4 PROVIDERS" → **"17 PROVIDERS"**. Ties Pass 7 utisak (Memory app harvest scope = 17 platformi: ChatGPT, Claude, Claude Code, Claude Desktop, Gemini, AI Studio, Perplexity, Grok, Cursor, Manus, GenSpark, Qwen, MiniMax, z.ai, Other + 2 more) na hero claim — *collector positioning* koju je Marko ranije pomenuo ("postajemo collector — all my AI on one place").

**Odluka 10 — Continuity-by-design line iz Pass 7 SKIPPED.** Suviše granular za marketing landing. Stays out v3.2.

---

## §4 — CC delivery confirmation

Per `get_page_text` transcript od CC: *"Picking the Architect bee for Sovereign — regal/independent gestalt, system-designer connotation fits 'regulator-ready, vendor-independent.' [Editing ×6, Searching] All 7 edits landed. Taking the screenshot."* CC u finalnoj verifier loop fazi sa fork-ovan agent. Cost ~$0 (text-only surgical edits, well under $25 cap).

**Napomena o broju edits:** Decision lista nosi 10 ratifikovanih, ali "shipping edits" CC je delivered 7 (Odluke 3, 7, 8, 10 su zadržane stavke ili skip-ovi koji ne menjaju canvas). Razlog za tu asimetriju: P0/P1 koje *menjaju copy* su 7, P0/P1/P2 koje *ratifikuju zatečeno stanje* su 3 (4. tier CTA ratified-as-renamed, Pro trial keep, Trust Band keep, Continuity-by-design skip). Ratifikacija "ne diraj" je takođe LOCKED odluka jer štiti od slučajnog kasnijeg menjanja.

---

## §5 — Posledice za pre-launch sprint

1. Track D status na 🟢 §1+§2 done 2026-05-02; §3 i18n+Stripe+Lighthouse u toku. Per memorija `project_pre_launch_sprint_2026_04_30.md` 2026-05-02 sprint progress refresh.
2. Track D apps/www Next.js port (CC sesija D §3) može da kreće sa locked copy referencom — ne čeka dodatne ratifikacije.
3. Trust Band Card 4 link target rezultira open question za Day 0 — public-accessible URL gde je methodology doc. Resolved kroz Track E Path D fallback (methodology.md u OSS repo); vidi `decisions/2026-05-02-track-e-arxiv-7-decisions.md`.
4. Layout, SVG, animacije, copy svi locked. Sledeći downstream je apps/www Next.js port implementation, ne dodatni copy revs.
5. Baseline `019dd700` sa color rebrand preserved kao deprecated-but-retainable u Claude Design — može se vratiti ako v3.2 implementation otkriva structural problem koji nije copy-related.

---

## §6 — Authoring trace

Ova decision memo je autorizovana **retroactively 2026-05-05** kao deo pop-up-a četiri-fajla decisions/ folder gap-a koji je flagovan u `project_execution_state.md` snapshot 2026-05-04. Sadržaj reflektuje point-in-time observation iz `project_landing_v32_2026_05_02.md` memorije, plus reference na canonical wireframe spec.

Razlog za retroaktivnu autorizaciju: per CLAUDE.md decision memo discipline, svaka LOCKED odluka mora imati matching `decisions/<date>-<topic>.md` fajl. Memorija postoji ali memorija nije auditable artifact (živi u Cowork space-u, nije u git-u).

**END DECISION MEMO.**
