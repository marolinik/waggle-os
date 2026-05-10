# Current State Master — Single Source of Truth

**Datum:** 2026-05-05
**Author:** PM
**Status:** AUTHORITATIVE (supersedes fragmenti rasuti po brief-ovima, memorijama i master backlog-u 2026-04-18)
**Day 0 ETA window:** 2026-05-08 do 2026-05-12 (6-10 dana od ovog datuma)
**Cilj dokumenta:** Jedan fajl koji čitaš u 5-10 min i znaš tačno gde stojimo, šta sledi, i ko vodi šta.

**Predecessors koji su ovde konsolidovani:**
- `docs/plans/BACKLOG-MASTER-2026-04-18.md` (waggle-os repo, 919 linija, 121 stavka u 3 tier-a) — STILL CANONICAL za detaljne sub-tasks ali updated status reflektovan ovde
- `decisions/2026-04-30-pre-launch-sprint-consolidation-LOCKED.md`
- `handoffs/2026-05-02-day-0-readiness-checklist.md` (9 paralelnih track-ova)
- `D:\Projects\waggle-os\docs\DAY-2-BACKLOG-2026-05-01.md` (CC Day-2 zapisnik, addiction features 4 talasa)
- `D:\Projects\waggle-os\docs\ONBOARDING-DAY-2-BACKLOG-2026-04-30.md` (CC onboarding polish 3 stavke)
- `briefs/2026-05-05-day-0-minus-1-runbook.md` (v2 sa NPM republish amendmentom)
- `briefs/2026-05-05-claude-md-amendment-invariants.md`
- 4 retroaktivna decision memo-a od 2026-05-05
- CC PM-sync survey output 2026-05-05 (5 nalaza, top 3 značajna)
- Memorija pre-launch sprint 2026-04-30 + execution state 2026-05-04

---

## §1 — Status snapshot u jednoj rečenici

Pet od devet pre-launch track-ova zatvoreno, tri u letu (Track D landing port, Track G persona testing, Track I Stripe+Legal), jedan svesno odložen za posle Day 0 (Gaia 2 sweep). Day 0 deliverables zavise od **šest Marko-side ulaza** u sledećih 3-5 dana, plus jedan dan-pre-launch CC sesija od 75-110 min. Posle Day 0 sledi 12-nedeljni post-launch program podeljen u tri bloka (marketing 1-3, Gaia 2 4-8, τ³-bench + KVARK 8-12).

---

## §2 — Šta je gotovo (ne dirati osim ako se nešto pokvari)

**Dokazni temelj.** LoCoMo paper claim #1 LOCKED 2026-04-25 (substrate self-judge 74% > Mem0 paper 66.9%). GEPA Faza 1 CLOSED 2026-04-29 sa dva deployment-authorized kandidata (claude::gen1-v1 + qwen-thinking::gen1-v1, qwen 35B na nivou Opus parnosti na out-of-distribution validaciji). Phase 5 production runtime LIVE od 2026-04-30 sa `WAGGLE_PROMPT_ASSEMBLER=1` flag-om u apps/web backend-u. Cumulative LLM spend ~$50 ukupno u dve nedelje koje su izgradile dokazni temelj.

**Aplikacija (Track A apps/web).** Pass 7 walkthrough verdict PASS 9/9 zatvoren 2026-05-01. Block C state restore izvršen, production data 205 MB sa frameCount 9, embedding coverage 100%. Twelve commits u single CC sesiji 2026-05-01 (Block A friction batch 5 + Block B Phase 1 features 2 + design docs + Day-2 backlog 3 + FR#33 final 2). 25 od 25 friction reports closed across PM walkthroughs Pass 1-7. Tour Replay + Imports Reminder Phase 1 features shipped. Tri P2/P3 friction notes deferred to Day-2 backlog (FR Pass7-A/B/C). Grana `feature/apps-web-integration` na `447f5ac`, ne mergeuje se u main, dobija freeze tag `v0.1.0-track-a-rc1` na Day 0 minus 1.

**Hive-mind monorepo.** Sesija B CLOSED 2026-04-30, 8 faza, $0 LLM spend. Branch `feature/hive-mind-monorepo-migration` na `a10867c` sa 5949/31/145 zero regression. OSS subtree split skripte rade. Grana je pushed na origin, čeka samo Day 0 minus 1 push gate za 12 OSS export grana + version bump.

**Hive-mind javni repo.** `marolinik/hive-mind` postoji javno od 18. aprila, default branch `master`, Apache 2.0 licenca, Egzakta Group d.o.o. copyright 2026. Četiri NPM paketa published (`@hive-mind/core`, `wiki-compiler`, `mcp-server`, `cli`) sa CI badge-ovima. README pokriva 21 MCP alat, 11 harvest adaptera, Quick Start za Claude Code, Claude Desktop, Codex, Hermes klijente, arhitekturu, I/P/B frame model, hibridni FTS5+vector search. Ono što fali za Day 0 je **republish u v0.2.0** sa Wave-1 sadržajem koji je 8-11 dana ispred trenutnog v0.1.0 — to je razlog za §2.5 amendment u Day 0 minus 1 runbook-u.

**Landing v3.2.** 10 ratifikovanih copy odluka 2026-05-02 (P0×3 + P1×5 + P2×2). Architect bee Sovereign tile, GEPA +12.5pp Card 1, KVARK rename u Final CTA, "17 AI platforms" collector positioning, LoCoMo 7.1pp tighter framing. Track D §1+§2+§3+§4 svi DONE 2026-05-03 (commit `04745b7` plus 13 paralelnih, Lighthouse Perf 96 / A11y 96 / SEO 100). Methodology doc live na `/docs/methodology` route + sitemap. Path D fallback Trust Band Card 4 link target rešen.

**Arxiv preprint priprema.** Track E 7-decision RATIFIED CLOSED 2026-05-02. Title "Apples-to-Apples on LoCoMo: A Bitemporal Local-First Memory Substrate and a +27.35-Point Methodology Gap." 3-author roster (Marko + Pavlukhin + Barać). Path A primary (Pavlukhin EVOLVESCHEMA standalone arxiv submission) + Path D fallback (methodology.md u OSS repo) — Day 0 ne blokiran arxiv timing-om.

**Hermes konkurentska intel.** Track H CLOSED 2026-05-02. 6 surgical edits u canonical competitive doc, Hermes Agent (Nous Research, 25. februar 2026, 110K stars) integrisan kao §1.11. Day 0 messaging pokriva 6 differentijatora (bitemporal graph, I/P/B framing, MPEG-4 compression, modular npm packages, EU AI Act audit triggers, peer-reviewed benchmark portfolio). Marketing communication discipline LOCKED — no Twitter/HN engagement sa Hermes maintainers, lead sa positive Waggle positioning.

**UI/UX Pass 1+2.** Done. Dock global position fix overnight 2026-04-30. Multi-window paradigma + tier toggle behavior verified.

**Sesija E §5.0+§5.1+§5.2+§5.3.** CLOSED 2026-05-03. Clerk integration commit `d281a86`, Stripe linkage 3 commits (`0147d6c`, `a087cf6`, `4365897`), 4 prices sa lookup_keys, sign-up stalls RESOLVED. Clerk dark theme legibility fixes pushed na origin (`73886f8` + `ceeb601`).

**Decisions/ folder gap zatvoren 2026-05-05.** 4 retroaktivna decision memo-a autorizovana (Pass 7 + Block C close, Landing v3.2, Track E arxiv, Track H Hermes). Memorije se sad mapiraju na git-tracked decision papers.

**Briefs gotovi 2026-05-05.** Day 0 minus 1 runbook v2 (sa NPM republish §2.5) + CLAUDE.md amendment brief sa 10 git workflow invariants.

---

## §3 — Pre-launch preostalo (in-flight + blokeri)

### 3a. Marko-side blokeri (sva tri moraju biti rešena pre Day 0)

**Stripe live keys.** Finance ekipa generiše `sk_live_*` u Stripe dashboard live mode-u, paste u CC sesiju koja apdejtuje `apps/www/.env.local`. Pet do petnaest minuta.

**Egzakta legal pages content.** Privacy policy, ToS, cookies, EU AI Act statement. Layout placeholder-i sa noindex tag-om već stand-by u `apps/www/app/(legal)/`. Ako Egzakta legal dostavi tekstove, paste u CC sesiju u 4 bloka. Ako ne — ostavlja se placeholder + noindex i ide u Day-2 post-launch backlog. Wall-clock je email Egzakti + sat-dva čekanja.

**Pavlukhin EVOLVESCHEMA arxiv submission.** Path A primary za endorsement chain. Marko piše email Pavlukhinu sa molbom da podnese standalone preprint (4-6 strana, cs.AI). Pavlukhin posle arxiv approval (~24h) endorse-uje Markov paper kao već-publikovan-arxiv-autor. Timeline 5-6 dana to endorsement-ready. Ako Pavlukhin ne reaguje za 48-72h, Path D fallback (methodology.md u OSS repo) već stoji. Email: 5-10 minuta.

### 3b. Marko-side blokeri iz CC PM-sync survey (3 dodatna otkrivena 2026-05-05)

**Clerk sk_test_* key rotacija.** CC survey flagovao da `.env.local` sadrži leaked test mode key uprkos prethodnoj indikaciji "rotation done". Marko otvara Clerk dashboard, klikne Rotate na test mode secret key, paste-uje novi `sk_test_*` u CC sesiju koja apdejtuje `.env.local`. Pet minuta.

**Stripe webhook secret.** `STRIPE_WEBHOOK_SECRET` je trenutno `REPLACE_AFTER_WEBHOOK_REGISTERED` placeholder. CC pokušava `stripe listen --print-secret` ako je Stripe CLI auth-ovan na mašini, inače Marko generiše kroz Stripe dashboard webhook page i paste-uje. Pet do deset minuta.

**Phase E full smoke test §5.3.** Stripe Checkout end-to-end + webhook 200 + Clerk publicMetadata write nikad nije captured kao verified. CC izvršava kroz Playwright + local backend, koristi test cards (4242...) sa privremeno-revertovanim `sk_test_*` u env, vraća `sk_live_*` posle smoke-a. Petnaest do trideset minuta.

**Status pet od ovih blokera:** CC sesija je startovala 2026-05-05 i čeka na credentials za Item 1 (Stripe live key), Item 3 (Clerk new key), Item 2 content decision. Tim radi na sva tri u trenutku autoring-a ovog dokumenta — aktivni feedback od Marka 2026-05-05 ~12:00 CET.

### 3c. PM-side preostalo

Niko nije aktivno blokiran van ovog konsolidacionog dokumenta. Sledeći PM rad posle Day 0 minus 1 push gate-a je launch killer story review (interaktivni 30-45 min razgovor) i — paralelno — autoring of arxiv full draft (7-9 dana) ako Path A endorsement krene.

### 3d. CC-side preostalo

Track D apps/www Next.js port je već CLOSED 2026-05-03 sa svim §1-§4. Sesija E §5.4+§5.5+§5.6 ostaje za Stripe live mode aktivaciju + finance + legal batch — to je sad sjedinjeno u trenutnoj CC sesiji 2026-05-05 koja izvršava 5 security/billing item-a.

---

## §4 — Day 0 sequencing (3 paralelne fudbalske utakmice u jednom danu)

**Day 0 minus 1 (75-110 min CC sesija):** OSS push gate per `briefs/2026-05-05-day-0-minus-1-runbook.md` v2. Push 1 monorepo grana + 12 OSS export grana → NPM version bump v0.1.0 → v0.2.0 → republish 12 paketa → tag `v0.1.0-track-a-rc1` na 447f5ac → tag `v0.1.0-day-0` na hive-mind master → 5-stage verification battery + rollback drill pre §1. CC ima paste-ready playbook, halt-and-PM ima 8 strukturalnih trigera.

**Day 0 sam (5 paralelnih akcija u jednom prozoru od nekoliko sati):**
1. Tauri build instaler za Windows i Mac postaje preuzimljiv sa landing-a (ili waiting list ako je build još u flux-u)
2. Stripe se aktivira da prima prave uplate (production env vars stupaju u snagu)
3. Arxiv preprint live (ako Path A endorsement gotov) ili Path D landing copy swap "Open methodology — github docs" + post-launch arxiv link kasnije
4. Hive-mind GitHub repo dobija prvi javni signal — Hacker News post, LinkedIn objava od Marka, X thread, MCP zajednica notifikacija
5. Landing dobija prvi production traffic, analytika počinje da meri

Day 0 sam je 4-6 sati orkestrirovanog rada. PM (ja) vodi sequencing, Marko vodi javne objave, CC u standby ako nešto pukne.

**Halt-and-PM signali na Day 0:** bilo koji javni signal koji dovodi korisnike na stale verziju (pre-republish), bilo koji error u Stripe webhook chain, bilo koji crash na first-run install na čistom Win/Mac VM-u (ako Marko ima vremena za smoke).

---

## §5 — Post-launch 12-week sequencing

### 5a. Nedelje 1-3 — Marketing rollout + first-user feedback

Bez kod-rada osim sitnih friction fix-ova kako stignu. Glavni napori su content i community: Marko-LinkedIn objava nedeljno (3 posta sequence per draft `M-32` u master backlog-u — "Why we built Waggle" T-14d, "What's about to drop" T-3d, "It's live" Day 0), blog tekstovi koji raspakuju 6 differentijatora protiv Hermes Agent-a, X threadovi, podcast intervjui, MCP zajednica engagement. Demo video skripta 90s + 5min postoji u backlog-u kao M-31 ali još nije snimljena — to bi bila prva produkcijska content stavka post-launch.

Paralelno se prikuplja first-user feedback iz Solo $19 tier sign-up-ova (ako Stripe live keys radi i landing CTA hvata realne korisnike). FR Pass7-A/B/C iz Day-2 backlog-a postaju aktivne (replay tour resets onboarding bug, window state persistuje preko reload-a, Memory window cascade offset). Tih 3 stavke su sat-dva CC rada svaka.

Plus: **`allowedSources` provenance metadata** počinje paralelno sa marketing-om jer je 6-9 nedelja senior engineer rada i mora biti gotov pre prvog ozbiljnog KVARK enterprise security review-a (videi §6 KVARK Prep).

### 5b. Nedelje 4-8 — Gaia 2 Phase 4 sprint + MemAgents Workshop submission

Phase 3 priprema je 85% gotova: adapter (656 linija), config, dry-run skripta, schema fixes, 4-invocation probe na pravom Gaia2 schema, GEPA shape routing OOD activation vidljiva u partial responses. Phase 4 ostaje:

- **Host odluka** — Docker (preporučeno iz Phase 3 closure memo-a), WSL2, Linux runner. Marko ratifikuje pre Week 4.
- **WaggleAgent Python wrapper** — custom integration sa ARE benchmark harness-om koji bypass-uje narrow-proxy bulk-retrieval (~160× input-volume reduction). 2-3 dana CC sesije.
- **N=40 real sweep** — sa novom arhitekturom koja ne pati od Phase 3 cost driver-a. Procena $200-400 budget.
- **Analiza + memo** — 3-5 dana PM autoring + Marko review.
- **MemAgents Workshop submission** — drugi peer-reviewed paper sa ovim brojevima, target prozor je late juni / rani jul.

Plus: **arxiv full draft** koji je startovao Week 1-2 ide u review tokom ovog prozora.

### 5c. Nedelje 8-12 — τ³-bench banking_knowledge + KVARK pitch deck + first enterprise razgovor

τ³-bench banking_knowledge je strateški benchmark za enterprise prodaju jer hvata banking-specifičan use case scenario (kompleksni regulisani domeni). Slična mehanika kao Gaia 2 Phase 4: setup, sweep, analiza, submit na taubench.com leaderboard.

Paralelno se piše KVARK pitch deck koristeći tri peer-reviewed broja (LoCoMo + Gaia 2 + τ³-bench) plus svežu arxiv preprint plus jaku OSS metriku (GitHub stars za prvih 60 dana, NPM downloads, broj integrisanih MCP klijenata, broj forkova). 1-2 nedelje copy + design.

Prvi razgovor sa bankom ili fintech prospect-om dolazi prirodno iz tog materijala — Egzakta network ima banking relationships koje Marko može aktivirati odmah po dobijanju peer-reviewed dokaza. KVARK enterprise demand ide kao **downstream** Waggle launch-a (per `feedback_waggle_primary_framing` memorija), ne kao paralelan kanal.

### 5d. Cross-cutting kroz svih 12 nedelja — App polish iz CC Day-2 backlog-a

CC je u svom Day-2 backlog-u zapisao 4 talasa addiction features (~18-20h ukupno) plus onboarding polish (~1-2 dana) plus 3 friction fixe iz Pass 7. Svaki talas je nezavisan, ne čeka prethodni:

- **Talas 1 (~6h):** cross-decision §1.1 weighted counting helper (shared infra), cross-decision §1.4 OverlayQueue controller, Memory Growth Chart u Memory aplikaciji (zameniva streak counter sa neutral framing-om), FR #30 persona-picker indicator opcija B (najmanje invazivna).
- **Talas 2 (~4-5h):** Continuity Banner ("evo gde si stao"), Today's Brief Dashboard kartica (zamenjuje sistem notifikacije sa persistent kartica paradigmom).
- **Talas 3 (~3h):** Milestone Toast/Card split (toast za 1. i 10. zapis, full-screen card sa konfetama za 100. i 1000.).
- **Talas 4 (~5-6h):** Weekly Wins Digest sa HybridSearch recall instrumentation.

Plus onboarding polish iz drugog Day-2 dokumenta:
- **A3 smarter heuristic** — `frameCount > 0` test umesto samo `workspaces.length > 0` (10 LOC + 4 tests, ~1h).
- **Reset Onboarding button** u Settings → Advanced → "Reset onboarding wizard" (80 LOC + admin route + 1 test, ~3-4h).
- **User docs za onboarding behavior** — 30 min writing.

Plus 3 friction fixe iz Pass 7:
- **FR Pass7-A** Replay tour resets onboarding kad wizard incomplete (~5 LOC + 1 test, Talas 1).
- **FR Pass7-B** Window state persistuje preko reload-a (~30 LOC, Talas 2).
- **FR Pass7-C** Memory window cascade offset bug (~10 LOC, Talas 1 paired sa Pass7-A).

Routine `trig_01JK3YuVe6bAsJvcMBbKfUJ4` armed za 2026-05-08T07:00:00Z (Phase 1 health check + Wave priority recommendation) — proaktivno trigger-uje sledeću PM sesiju u Day 0 prozoru.

---

## §6 — KVARK enterprise prep (paralelan stream, kritično za nedelje 8+)

### 6a. allowedSources provenance metadata (6-9 nedelja senior engineer)

Identifikovano kao "big gap if you are selling to regulated industries" u nečijem code review-u 2026-05-05. Trenutni agent loop ima governance polje `allowedSources` ali ne forsira ga jer nema source-provenance metadata. To znači:

- Ne može se sertifikovati za EU AI Act audit trail (Article 13 transparency, Article 17 quality management)
- GDPR Article 30 + 32 compliance je labav (obrade-podataka mapiranje nije rekonstruisivo)
- SOC 2 CC6 + ISO 27001 A.5.15 controlled access kontrole padaju
- DORA / NIST 800-53 SR third-party risk management nije pokriven

Tri faze implementacije:
1. **Spec dizajn (1-2 nedelje):** vendor ID, registry origin, version, signature (Sigstore ili sopstveni PKI), capability declaration. Senior engineering review.
2. **Wire-up u tool registry (3-4 nedelje):** svaki MCP server, plugin, alat prolazi kroz validaciju metadata-e pre register-a. Postojeći alati dobijaju retroaktivno-dodeljenu metadata-u.
3. **Enforcement u agent loop (1-2 nedelje):** `allowedSources` field forsira proveru pre svakog tool call-a, audit trail beleži provenance ID.

Ovo NE blokira Waggle Day 0 jer Waggle ide consumer-side. Blokira **prvi ozbiljan KVARK enterprise pregovor** kad krene security review. Tajming je krene paralelno sa Gaia 2 sprintom (Week 4-8) tako da je gotovo do prvog enterprise razgovora (Week 8-12).

### 6b. KVARK model strategy doc (M-49, 2h)

Dokumentuj **Qwen3-30B-A3B-Thinking** kao KVARK analytical default (per PA v5 data: +26.7pp na compare-type tasks sa PA enabled). **Opus 4.7** kao reserved tier za multilingual / high-accuracy. PA v5 cost-performance prednost (60×). File: `docs/KVARK-MODEL-STRATEGY.md`.

### 6c. Cognitive layer thesis doc (M-50, 3-4h, posle H-42 numbers)

Canonical 600-800 reči thesis dokument koji guard-uje protiv marketing drift-a. "Cognitive layer" (architectural category) NOT "conscious agent" (philosophical claim). Tri pillara: arhitektura (frame model + bitemporal KG + hybrid search + compliance-by-default), empirical validation (PA v5 + LoCoMo + GEPA Faza 1), real-world test (dogfood by team).

### 6d. KVARK pitch deck (Week 8-12)

Slide 3 Related Work koristi 6 differentijatora od Hermes Agent canonical doc-a kao two-column comparison. Slides 1-2 hero positioning. Slides 4-7 tehnička arhitektura sa peer-reviewed brojevima. Slides 8-10 case study layout (čeka prvi pilot).

---

## §7 — Šta NE radimo (svesno odložene stavke)

Iz BACKLOG-MASTER-a, sledeće stavke su parkirane sve dok ne bude novog signala:

- **L-15 Remove old `app/` frontend** — dead code cleanup, ne blokira ništa, post-launch maintenance.
- **L-19 TeamStorageProvider real S3/MinIO impl** — Teams tier feature, čeka prvi Teams customer.
- **M-29 MS Graph OAuth connector** — kalendar/email/files harvest, čeka demand signal.
- **M-13 Notion structured export** — wiki compiler adapter, čeka user request.
- **M-15..17 Ollama bundled installer** — alternativa LiteLLM-u za fully local LLM, čeka Solo tier feedback da li je trenutni LLM cost cap dovoljan.
- **L-22 Memory bragging window** — engagement feature, post-Wave-4 ako adoption-driven prioritization to potvrdi.
- **`H-43 LongMemEval`** — drugi peer-reviewed benchmark koji je u BACKLOG-MASTER-u kao "LAUNCH GATING" ali je zatvoren kao ne-launch-blocker pošto LoCoMo paper claim #1 nosi launch narrativ. Može se uraditi paralelno sa Gaia 2 Phase 4 ako CC bandwidth dozvoli.
- **`H-44 SWE-ContextBench`** — strateški diferencijator za coding-agent positioning, ne-launch-blocker, post-launch ako tržišni signal traži.

Gaia 2 Phase 4 je jedini "scheduled" odlaganje (Week 4-8 explicit), sve gore navedene stavke su "kad budemo imali signal".

---

## §8 — Rizici i mitigations

**R1 — OSS export sync drift (CC nalaz #1 2026-05-05).** Day 0 javni signal upućuje na `npm install @hive-mind/core` koji vraća stale v0.1.0 umesto post-Wave-1 v0.2.0. **Mitigation:** §2.5 amendment u Day 0 minus 1 runbook-u sa NPM republish gate-om pre tag ceremony.

**R2 — Marko-side credential leak.** Tri pasta vrednosti (Stripe live, Clerk rotated, webhook secret) putuju kroz CC chat → .env.local. .env.local je gitignored ali chat content može biti kopiran negde. **Mitigation:** brief eksplicitno traži test mode rotacije gde god je moguće (Item 3 Clerk je test mode, ne live), live mode keys su minimalni surface (samo sk_live_*, ne pk_live_* per Flag 1 odluka).

**R3 — 30 pre-existing test failures (CC nalaz #5).** Ako Day 0 marketing copy negde tvrdi "100% tests green" ili "all tests passing", neko sa GitHub Actions tab-om otvorenim demantuje za 30 sekundi. **Mitigation:** marketing copy review koristi konzervativno formulisanje — "production code paths covered" ili konkretne brojeve "5949/31/145" iz Sesija B. PM lectir copy review pre Day 0.

**R4 — Pavlukhin response delay.** Path A endorsement chain pretpostavlja 5-6 dana to endorsement-ready. Ako Pavlukhin ne reaguje za 48-72h, pomak Day 0 od arxiv reference-e na methodology.md fallback. **Mitigation:** Path D je već implementiran (Trust Band Card 4 link target je `/docs/methodology` route, već live na origin commit `87b1637`). Day 0 nije blokiran arxiv timing-om.

**R5 — Hacker News "isn't this just Hermes Agent?" comment.** Prvi javni signal Day 0 je verovatno HN post; prva sumnja je narrative overlap sa Hermes Agent (110K stars Februar 2026). **Mitigation:** Track H pre-empted sa 6 differentijatorima, marketing communication discipline (no engagement sa Hermes maintainers, lead pozitivnim narativom). Prvi PM/Marko response u HN thread-u već treba da bude u draft formi pre Day 0.

**R6 — Track A asimetrija memory-vs-git.** Memorija kaže "shipping-ready" ali grana nije mergeovana niti tagovana. **Mitigation:** Day 0 minus 1 runbook §3 freeze tag `v0.1.0-track-a-rc1` na `447f5ac`. Posle Day 0, grana ostaje izolovana — Tauri build pipeline uzima svoj input iz tag-a, ne iz main-a.

**R7 — Marko bandwidth pre Day 0.** 6 Marko-side stavki (Stripe live, Egzakta legal, Pavlukhin email, Clerk rotation, webhook secret, Phase E smoke ratifikacija) plus killer story review plus dan-pre push gate ratify. Realno je 4-6 sati raspodeljenog rada u 3-5 dana, ali ako padne na jedan dan može da gušti. **Mitigation:** ovaj dokument koji omogućava da Marko vidi celu sliku u 5-10 min i raspodeli rad samostalno.

**R8 — Gaia 2 Phase 4 nije gotov pre prvog enterprise razgovora.** Ako banking prospect dođe pre Week 8-12 prozora, KVARK pitch deck nema treći peer-reviewed broj. **Mitigation:** ako razgovor zakaže pre prozora, pomak je razgovor kao "preview" sa LoCoMo + GEPA samo, sa eksplicitnim "Gaia 2 + τ³-bench rezultati u juli-avgust" framing-om. To nije idealno ali nije lansiranje-blokirajuće.

**R9 — `allowedSources` enforcement gap blokira KVARK security review.** 6-9 nedelja senior engineer rada nije pokrenuto, prvi enterprise security review će ga otkriti, pregovor klizi 2-3 meseca. **Mitigation:** stream pokreće Week 1 paralelno sa marketing rollout-om. Ako se nađe senior engineer (interno ili external), fond za to.

---

## §9 — Marko-side queue (refresh 2026-05-05)

Sledećih 3-5 dana, redom prioriteta:

1. **Stripe live keys** (sa finance) — 10 min na Stripe dashboard, paste u CC sesiju koja je u toku
2. **Clerk test mode rotation** — 5 min u Clerk dashboard, paste u CC sesiju
3. **Stripe webhook secret** — 5-10 min ili u CLI ili dashboard, paste u CC sesiju
4. **Phase E smoke ratifikacija** — pasivno čekanje, CC izvršava i javlja rezultat
5. **Egzakta legal email + chase** — 5 min email, 24-72h čekanje, paste tekstove ili "leave placeholders" u CC
6. **Pavlukhin email** — 5 min draft, 24-72h čekanje na odgovor (Path A pokušaj)
7. **Day 0 minus 1 runbook ratify + paste u CC sesiju** — 5 min ratify, 75-110 min CC izvršenje pasivno
8. **Killer story review (sa PM)** — 30-45 min interaktivni razgovor
9. **Day 0 sequencing dan sam** — 4-6 sati orkestrirovanog rada (Marko vodi javne objave)

Plus dva legacy item-a koji nisu blokeri ali bi se trebali zatvoriti u nekom prozoru:

10. **PAT renewal reminder 2026-07-15** za WAGGLE_OS_SYNC_TOKEN + HIVE_MIND_SYNC_TOKEN (90-day expiry)
11. **Tier 1 harness fixes formalna decision memo** — flag iz consolidation 2026-04-27, postoji brief ali nije LOCKED u decisions/

Plus Marko može da uradi **G-stack adversarial review** ovog dokumenta paralelno sa CC sesijama — paste-uje ovaj fajl u Gemini ili GPT i pita za adversarial perspective ("šta je slabo u ovoj slici, šta promašujemo, šta bi neko sa strane prvi izneo kao zamerku"). Vraća sažetak za killer story review.

---

## §10 — Audit trail i decision references

Svaka LOCKED odluka ima matching decision memo u `D:\Projects\PM-Waggle-OS\decisions\`:

- `2026-04-30-pre-launch-sprint-consolidation-LOCKED.md` (kanonski sprint scope)
- `2026-04-30-branch-architecture-opcija-c.md` (binds OSS subtree split)
- `2026-04-30-phase-5-cost-amendment-LOCKED.md` (cost cap revision)
- `2026-04-30-wave-1-memory-install-cleanup-LOCKED.md` (memory install scope)
- `2026-04-30-phase-5-1-5-pm-signoff-canary-authorize.md` (Phase 5 wiring)
- `2026-04-29-gepa-faza1-results.md` (GEPA Faza 1 closure 568 linija)
- `2026-04-29-phase-5-scope-LOCKED.md`
- `2026-04-29-phase-5-brief-LOCKED.md`
- `2026-05-01-pass-7-block-c-close.md` (RETROACTIVE 2026-05-05)
- `2026-05-02-landing-v32-surgical-edits.md` (RETROACTIVE 2026-05-05)
- `2026-05-02-track-e-arxiv-7-decisions.md` (RETROACTIVE 2026-05-05)
- `2026-05-02-track-h-hermes-canonical-integration.md` (RETROACTIVE 2026-05-05)

Svaki paste-ready brief za CC u `D:\Projects\PM-Waggle-OS\briefs\`:

- `2026-04-30-cc-sesija-A-waggle-apps-web-integration.md` (CLOSED 2026-05-01)
- `2026-04-30-cc-sesija-B-hive-mind-monorepo-migration.md` (CLOSED 2026-04-30)
- `2026-04-30-cc-sesija-C-gaia2-setup-dry-verification.md` (CLOSED Phase 3 2026-04-30)
- `2026-04-30-cc-sesija-C-gaia2-setup-evidence.md`
- `2026-05-01-cc-sesija-D-apps-web-ui-alignment.md` (CLOSED 2026-05-02)
- `2026-05-01-cc-e2e-support-build-and-fix.md`
- `2026-05-02-cc-sesija-D-apps-www-port-v3.2-amendment.md` (CLOSED 2026-05-03)
- `2026-05-03-cc-sesija-E-clerk-stripe-linkage-logo-fix.md` (CLOSED Sesija §5.3)
- `2026-05-05-day-0-minus-1-runbook.md` v2 (READY, čeka Day 0 minus 1)
- `2026-05-05-claude-md-amendment-invariants.md` (READY)

Memorije Cowork space-a su index-ovane u `MEMORY.md` koja se učita na startu svake PM sesije. CC sesije ne nose tu memoriju — moraju dobiti context kroz brief paste ili kroz `waggle-os/CLAUDE.md` koji je commit-ovan.

---

## §11 — Šta je SUPERSEDED (ne čitati kao autoritativno)

- `docs/plans/POLISH-SPRINT-2026-04-18.md` (waggle-os) — phased polish, absorbed
- `docs/plans/BACKLOG-CONSOLIDATED-2026-04-17.md` (waggle-os) — absorbed
- `docs/plans/PDF-E2E-ISSUES-2026-04-17.md` (waggle-os) — absorbed
- `docs/plans/BACKLOG-FULL-2026-04-18.md` (waggle-os) — intermediate consolidation, absorbed
- `docs/REMAINING-BACKLOG-2026-04-16.md` (waggle-os) — pre-04-18 snapshot
- `project_launch_plan_14_step_2026_04_27.md` (memory) — SUPERSEDED 2026-04-30 by Pre-Launch Sprint 9-track structure
- `project_phase_5_scope_locked_2026_04_29.md` (memory) — SUPERSEDED 2026-04-30 evening (canary semantika dropped, infrastructure preserved)
- `project_pa_v5_results.md` (memory) — SUPERSEDED 2026-04-29 by GEPA Faza 1 + N=400 LoCoMo
- `project_h_audit_1_not_implemented.md` (memory) — SUPERSEDED 2026-04-22

`docs/plans/BACKLOG-MASTER-2026-04-18.md` (waggle-os) **ostaje canonical** za detaljne sub-task specifikacije svake stavke (npr. specifični LOC procene, file paths, test gates). Ali realistic status reflektovan u ovom dokumentu (§2 Closed, §3 Preostalo, §5 Post-launch waves) supersede master backlog "OPEN" označavanja.

---

## §12 — Šta sad

Posle Marko ratifikacije ovog dokumenta i CC sesije završetka (current u toku 2026-05-05), redosled je:

1. **Marko legaye-side queue** — 6 paste-pasta + 2 emaila u sledećih 3-5 dana (§9 lista)
2. **Killer story review (PM ↔ Marko)** — 30-45 min interaktivno (kad Marko ima slot)
3. **G-stack adversarial review** — paste ovog dokumenta u Gemini/GPT (Marko pasivno paralelno)
4. **Day 0 minus 1 runbook izvršenje** — 75-110 min CC (kad bude T-1 dan)
5. **Day 0 orkestracija** — 4-6 sati (kad bude T)
6. **Post-launch sprint Week 1-3 marketing rollout** + paralelno `allowedSources` provenance metadata sprint pokreće
7. **Gaia 2 Phase 4** Week 4-8
8. **τ³-bench + KVARK pitch** Week 8-12

---

**END MASTER.** Ovaj dokument je living — kad neki track menja status, ažuriraj direktno ovde, ne pravi novi paralelni dokument koji onda postaje source-of-confusion.
