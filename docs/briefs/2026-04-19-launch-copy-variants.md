# Waggle Launch Copy — Three Variants (A/B/C)

**Datum:** 2026-04-19
**Autor:** PM layer (Cowork session)
**Svrha:** Pre-draftovane launch copy varijante koje pre-mortem (isti datum) zahteva da budu spremne **pre** nego što Track 2 benchmark broj padne. Svaka varijanta aktivira se specifičnom zonom benchmark rezultata. Nijedna od tri nije finalna polished copy — sve tri su workable drafts koji omogućavaju da, u roku od 24-48h od merge-a FINAL_SCORE.json fajla, možemo da aktiviramo tačnu varijantu bez panike-draft-a u realnom vremenu.
**Jezik:** Copy je na engleskom (landing i18n policy: English first, locale-ready infra). Interna analiza i decision rationale na srpskom CxO-tonu.
**Skupa čitati sa:** `2026-04-19-sota-benchmark-pre-mortem.md`, `2026-04-19-sota-benchmark-audit-readiness.md`, `decisions/2026-04-19-target-model-qwen35b-locked.md`.

---

## Kada se koja varijanta aktivira

Decision point nastaje kad LoCoMo FINAL_SCORE.json padne na main. Tri zone:

**Zona A — Beats.** LoCoMo ≥ **94.6%** (Mem0 SOTA 91.6% + 3pp safety margin), i 95% CI gornja granica ne preklapa se sa Mem0 CI donjom granicom. Headline može nositi "beats SOTA" formulaciju bez stretch-a. Launch ide kao što je planirano, sa confidence-forward pozicioniranjem.

**Zona B — Matches.** LoCoMo između **89% i 94.5%** (statistički paritet ili marginalna prednost/deficit unutar noise-a), ili broj iznad 94.6% ali sa CI overlap-om koji sprečava čist "beats" jezik. Narrative se pomera od leaderboard dominance-a ka capability multiplier pozicioniranju. Launch ide, ali centralna priča nije o brojci.

**Zona C — Below.** LoCoMo ispod **89%** (značajno pod SOTA noise-om). Po LOCKED SOTA-gated decision-u 2026-04-18, **launch se ne pokreće u planiranom prozoru**; ili idemo u v3 GEPA iteraciju (1-2 nedelje), ili launch-copy se re-framuje ka kategoriji u kojoj brojka nije primarni proof point. Varijanta C ispod ne pretpostavlja automatski launch — pretpostavlja da, ako posle rekalibracije idemo u "launch bez headline benchmark-a", kako to izgleda.

Analogne zone važe za H-43 LongMemEval i H-44 SWE-ContextBench. Jedan sub-SOTA benchmark ne degradira celu zonu; dva ili tri čiste ispod uzrokuje zonu C.

---

## Zajednički messaging pillars (ne menjaju se ni jednoj varijanti)

Pet crta koje su kanonske za Waggle, bez obzira na broj:

**1. Local-first, zero cloud by design.** Desktop app (Tauri 2.0), memorija čuva na korisnikovom disku, nema telemetrije podataka van user opt-in-a. Ovo je proizvodni fakt, ne messaging choice — i drži se u svakoj varijanti.

**2. Model-agnostic cognitive layer.** Waggle radi sa bilo kojim LLM-om — default Qwen3.6-35B-A3B kroz API ili self-hosted, ali API sloj podržava bilo koji MCP-compatible endpoint. Lock-in na proprietary model nije uslov.

**3. Memory that persists across sessions.** Core differentiation. Bitemporal KG + hybrid retrieval + wiki compilation. Ne "memory" u generičkom smislu nego structured long-term continuity sa audit trail-om.

**4. Apache-2.0 foundation.** hive-mind OSS core je Apache 2.0. Korisnik može da fork-uje, audit-uje, self-host-uje. Ovo je bridge ka KVARK enterprise narrativu i osnova kredibiliteta.

**5. Compliance trail built in.** EU AI Act audit triggers, DSGVO Art. 17/19 retention logic, append-only interaction log. Ne moramo ovo glasno da izgovaramo u svakoj varijanti — ali jeste odbrana u regulisanim industrijama i u enterprise pitching-u.

Pricing (Solo free / Pro $19 / Teams $49) je LOCKED 2026-04-18 i ulazi u svaku varijantu kao stabilan element.

---

## Varijanta A — Beats SOTA

**Aktivira se:** LoCoMo ≥ 94.6%, čist CI separation.
**Confidence level:** high. Headline direct, proof-forward.
**Tone:** Assertive but not triumphalist. Numbers do the talking; we provide context.

### A.1 Hero — landing page (apps/www)

**Headline option A1:**
> Your local AI, now state of the art.

**Headline option A2 (numbers-forward):**
> We beat the leaderboard. With your data on your machine.

**Sub-headline (both):**
> Waggle's cognitive layer pushes open-source Qwen3.6-35B-A3B past Mem0's long-term memory benchmark — running entirely on your laptop, on your license, with a full audit trail.

**Hero body (~60 words):**
> Most AI forgets the moment you close the tab. Waggle doesn't. A local cognitive layer — memory, retrieval, and a living wiki of what you've worked on — keeps your AI continuous across sessions, across weeks, across projects. This week, we proved it beats the state of the art on LoCoMo (94.6% vs Mem0's 91.6%) without a single API call leaving your machine.

**Primary CTA:** `Start free → Solo forever`
**Secondary CTA:** `See the benchmark →` (linkuje na benchmark-proof research doc)

### A.2 Announcement opener (thread / post lead)

**Twitter / LinkedIn thread lead:**
> For 18 months the story has been "bigger model, more cloud, more lock-in." We went the other way. Today Waggle beats Mem0 on LoCoMo long-term memory — 94.6% vs 91.6% SOTA — running local, open-source, Apache-2.0 under the hood. Thread on how we got here and what the benchmark actually measured.

**Follow-up posts (3-tweet skeleton):**
> 2/ The setup: Qwen3.6-35B-A3B (35B/3B MoE, Apache-2.0) + our cognitive layer. Four-model judge ensemble, no Anthropic in the loop (we're not grading ourselves). Full config, commit SHA, and reproducibility bundle in the research doc below.
>
> 3/ What it means: state-of-the-art long-term conversational memory doesn't require a cloud API, a frontier model, or a lock-in contract. It requires the right memory architecture under whatever model you're running.
>
> 4/ Launch: Solo free forever. Pro $19/mo. Teams $49/seat. Desktop app (Tauri 2.0, Mac/Win/Linux). hive-mind OSS core on npm today.

### A.3 Proof points (for press-style post)

- **Benchmark headline:** LoCoMo 94.6% (Mem0 SOTA 91.6%). 95% CI separation documented.
- **Methodology transparency:** Four-model judge ensemble (Gemini 3.1 Pro, GPT-5, Grok 4.20, MiniMax M2.7) — no Anthropic in the loop. Evaluator ported directly from Mem0 upstream; diff documented.
- **Reproducibility:** Public CONFIG.json, commit SHA pinned, dataset checksum verified. `pnpm run benchmark:locomo` reproduces ±2%.
- **Model context:** Qwen3.6-35B-A3B is Apache-2.0, already competitive at the standalone level (SWE-bench Verified 73.4, AIME 92.7). Waggle's cognitive layer doesn't replace the model — it gives the model continuity.
- **Privacy posture:** Zero telemetry by default. Memory database stays on user's machine. Optional cloud sync requires explicit opt-in.

### A.4 Key differentiators (copy-ready)

> **Continuity, not magic.** Waggle's cognitive layer gives any LLM — Qwen today, whatever's next tomorrow — the memory and structure it doesn't have on its own.
>
> **Local by default, forever.** Your memory database stays on your disk. Not "end-to-end encrypted in our cloud." On your disk.
>
> **Open foundation.** hive-mind, our memory core, is Apache-2.0 on npm. Fork it, audit it, self-host it, build on it.
>
> **Audit-ready.** EU AI Act triggers, GDPR retention logic, and full interaction provenance — built in from day one, not bolted on for compliance theater.

### A.5 Do / Don't for Variant A

**Do:**
- Lead with the benchmark number in the first 20 words of any launch asset.
- Name the judge ensemble explicitly when space allows (builds credibility).
- Name the model (Qwen3.6-35B-A3B) — it anchors the "open source is enough" narrative.
- Use the phrase "state of the art" but immediately qualify with the specific benchmark (LoCoMo long-term memory, not "AI benchmarks" broadly).

**Don't:**
- Say "small beats big." Reflection 70B presedan is cautionary tale, and Qwen3.6-35B-A3B is not small — it's efficient.
- Imply we beat SOTA on tasks we didn't benchmark (code generation, multimodal reasoning, etc.).
- Use superlatives that aren't directly backed by the FINAL_SCORE.json numbers.
- Claim "first" without a qualifier. "First local AI to beat Mem0 on LoCoMo" is defensible; "first local AI, period" is not.

---

## Varijanta B — Matches + Trade-off

**Aktivira se:** LoCoMo 89-94.5%, ili ≥94.6% sa CI overlap. Paritet ili marginalna prednost unutar noise-a.
**Confidence level:** medium. Headline pomeren sa leaderboard domena ka capability multiplier-u.
**Tone:** Mature, not defensive. "We match the state of the art — and here's what we traded for your benefit."

### B.1 Hero — landing page

**Headline option B1:**
> State of the art. On your machine. On your license.

**Headline option B2 (trade-off forward):**
> Top-of-leaderboard memory. Without the cloud, the contract, or the lock-in.

**Sub-headline (both):**
> Waggle matches Mem0's long-term memory benchmark on LoCoMo — running local, open-source, Apache-2.0 — with continuity that spans sessions, projects, and weeks.

**Hero body (~70 words):**
> Open-source AI caught up. Today, Waggle's cognitive layer reaches state-of-the-art long-term memory performance on LoCoMo (within the 91.6% SOTA band) — without a single byte leaving your machine. The trade we made: no cloud dependency, no proprietary model, no usage-based contract. Your AI runs on your laptop, remembers what you've worked on, and passes regulator audits. We didn't move the leaderboard. We moved where it can run.

**Primary CTA:** `Start free → Solo forever`
**Secondary CTA:** `How we got here →` (link to research doc)

### B.2 Announcement opener

**Thread lead:**
> For 18 months the story has been "you need the frontier cloud model for real long-term memory." We ran the benchmark. Today Waggle matches Mem0's state of the art on LoCoMo — local, open-source, Apache-2.0. The benchmark tells you we caught up. The architecture tells you why you'd rather run this than the cloud version.

**Follow-up 3-post skeleton:**
> 2/ The numbers: LoCoMo [X]% vs Mem0 SOTA 91.6%, statistical parity. Full methodology, judge ensemble, and reproducibility bundle in the research doc. Peer review welcome — we published the config.
>
> 3/ The trade: same capability, zero cloud calls, Apache-2.0 memory core, EU AI Act compliance trail built in. Runs on Qwen3.6-35B-A3B — open-source model, Apache license, 35B/3B MoE efficient.
>
> 4/ The point: when open-source catches up to SOTA, the question isn't "which is better" — it's "which do you want running on your machine, under your policies, on your data."

### B.3 Proof points

- **Benchmark:** LoCoMo [X]% — statistical parity with Mem0 SOTA 91.6%. CI and methodology documented.
- **Reproducibility:** Same as Variant A — CONFIG.json, commit SHA, ±2% band.
- **Trade-off thesis:** We didn't grow parameters. Didn't phone a frontier lab. Didn't add usage-metered contracts. Same capability, different operating model.
- **What parity means here:** Long-term conversational memory, the specific capability LoCoMo measures, runs at SOTA level on a laptop under your control. If you were choosing infrastructure for that capability, the choice is now about operating model, not capability ceiling.
- **Compliance dividend:** EU AI Act audit triggers, GDPR retention handling, append-only interaction log — things that became features, not blockers.

### B.4 Key differentiators

> **The trade-off you get.** State-of-the-art long-term memory that runs on your machine, under your license, with a full audit trail — for $0 forever on Solo, $19 on Pro.
>
> **Continuity is the multiplier.** The benchmark measures what Waggle does over 200 turns. What you actually get is what Waggle does over 200 days — memory that compounds, search that gets richer, a wiki that writes itself.
>
> **Your architecture, your policy.** Memory on your disk. Model you choose. Export path you control. No vendor can rescope your access.

### B.5 Do / Don't for Variant B

**Do:**
- Lead with the trade-off, not the headline number. Opening with the number invites "but you didn't beat it" — opening with the trade-off makes the number adequate.
- Use the word "parity" or "match" deliberately. "Match the state of the art" is defensible and mature; "nearly beats" is defensive and weak.
- Name what we *didn't* spend: parameters, proprietary models, cloud contracts.
- Lean on operating-model advantages (local, Apache, audit-ready). These don't depend on winning a leaderboard.

**Don't:**
- Wave the number around. If we have parity, the number is a supporting fact, not a headline.
- Apologize for not beating SOTA. We didn't try to beat it with bigger model — we tried to match it locally. That's the story.
- Compare ourselves favorably on tasks not benchmarked.
- Retreat into "we'll beat it next version." That's a roadmap conversation, not a launch conversation.

---

## Varijanta C — Below / Category Redefinition

**Aktivira se:** LoCoMo < 89% nakon što je rekalibracija iscrpljena ili procenjena kao neracionalna za launch window. Po LOCKED SOTA-gate iz 2026-04-18, automatski launch ne ide — ovo je copy za scenario gde tim svesno donosi odluku da lansira kategorijski (ne benchmark-based) zbog momentum-a ili drugog strateškog razloga.
**Confidence level:** calm, confident on different ground. Benchmark se ne pominje u headline-u; priča je o kategoriji.
**Tone:** Mature, principle-forward. "We're not playing that game. Here's the game we're playing."
**Upozorenje:** Ovu varijantu ne koristi automatski. Zahteva eksplicitnu diskusiju sa Markom pre aktivacije — to nije default ispod-SOTA copy, to je rebranding moment.

### C.1 Hero — landing page

**Headline option C1:**
> Your AI. Your data. Your receipts.

**Headline option C2 (sovereignty-forward):**
> Sovereign AI for people who can't afford to forget, leak, or explain.

**Headline option C3 (practical-forward):**
> The AI that remembers, runs locally, and passes audits.

**Sub-headline (all three):**
> Waggle is an open-source cognitive layer for AI that lives on your machine, under your license, with continuity that spans every session — and a compliance trail ready for any auditor.

**Hero body (~80 words):**
> We didn't build Waggle to climb a leaderboard. We built it so that the AI you depend on — for research, for code, for decisions — stops forgetting, stops calling home, and stops making claims you can't explain. Open-source memory core under Apache-2.0. Local-first by construction. EU AI Act audit triggers built in from day one. Desktop app, no cloud login required. Pick the model you trust. Run it on the laptop you own. Keep every receipt.

**Primary CTA:** `Start free → Solo forever`
**Secondary CTA:** `How the memory works →` (link to hive-mind OSS repo + cognitive layer explainer)

### C.2 Announcement opener

**Thread lead:**
> Most AI launches this year led with a benchmark number. We're leading with a principle. Waggle is a cognitive layer for AI that runs on your machine, under your license, with a compliance trail built in. hive-mind OSS core is Apache-2.0 on npm today. Here's why that matters more than a leaderboard.

**Follow-up 3-post skeleton:**
> 2/ The thesis: LLMs forget. Agent harnesses forget. That's a product problem, not a model problem. The fix is a cognitive layer — memory, retrieval, a wiki of what you've worked on — that lives with you, not with the vendor.
>
> 3/ The architecture: Apache-2.0 memory core (hive-mind, on npm today), bitemporal knowledge graph, local SQLite + vector index, four-layer compliance trail. Model-agnostic — Qwen3.6-35B-A3B by default, any MCP-compatible endpoint works.
>
> 4/ The positioning: if you can't afford to forget (research), leak (regulated industry), or make claims you can't explain (audit, legal, compliance), you need an AI that is continuous, local, and accountable. That's the category Waggle is in.

### C.3 Proof points

- **Category framing:** "Sovereign cognitive layer" — not competing directly with cloud memory systems on leaderboard, competing on what category of product this is.
- **Open foundation:** hive-mind on npm, Apache-2.0, 282/282 tests. Users can audit, fork, or self-host the memory core independently of the Waggle app.
- **Compliance posture:** EU AI Act audit trigger architecture (built in, not bolted on), GDPR Art. 17/19 retention handling, append-only interaction log with DDL-level enforcement.
- **Architecture principles:** bitemporal KG, SCD-Type-2 temporal validity, MPEG-4 I/P/B frame memory, write-path contradiction detection, 11 harvest adapters for ingesting existing conversation history (ChatGPT, Claude, Perplexity, etc.).
- **Benchmark reference (not headline):** If asked, we cite LoCoMo performance honestly with context — competitive in the SOTA band, with the trade-off that we don't require cloud infrastructure or a proprietary model. No spin.

### C.4 Key differentiators

> **The cognitive layer you own.** hive-mind — our memory core — is Apache-2.0. It's on npm. It works with any model, any agent, any workflow. Waggle is the polished desktop app; hive-mind is the foundation anyone can build on.
>
> **Continuity is a product, not a feature.** Most AI interactions start from zero every time. Waggle builds, compiles, and structures your context continuously — so the 200th conversation starts where the 199th ended.
>
> **Compliance was design, not retrofit.** EU AI Act audit triggers, GDPR retention logic, and full provenance tracking were part of the schema, not added to win a deal.
>
> **Your AI, your policy.** The memory stays on your machine. The model stays under your choice. The export path stays under your control.

### C.5 Do / Don't for Variant C

**Do:**
- Lead with principle, not with performance. This variant exists precisely because performance isn't the headline.
- Be honest about benchmarks when asked. "We're in the SOTA band; we optimize for a different operating model" is defensible. Evading the question isn't.
- Anchor in concrete architectural differentiators (bitemporal KG, Apache-2.0 core, audit triggers). These are objectively defensible without benchmark comparison.
- Make the sovereignty case tangible: name use cases (researchers with sensitive data, developers in regulated industries, teams with legal review over AI access).

**Don't:**
- Disparage benchmarks as a category. "Leaderboards don't matter" is a cope and readers smell it. "We measure differently" is a principled stance.
- Hide the benchmark number. If someone asks and the number is sub-SOTA, say so, explain the trade, and move on. Evasion compounds.
- Lean heavily on KVARK enterprise positioning in consumer launch copy. Waggle → KVARK demand generation is the sequencing (LOCKED); don't jump the fence.
- Overuse "sovereign." Once or twice per asset is signal; more is noise.

---

## Diferencijalna matrica

| Element | Variant A (Beats) | Variant B (Matches) | Variant C (Below / Category) |
|---|---|---|---|
| Headline anchor | Benchmark number | Trade-off + parity | Principle + sovereignty |
| Opening word | "We beat..." / "State of the art" | "Match" / "Parity" | "Your AI" / "Sovereign" |
| Benchmark in hero? | Yes, lead | Mentioned, supporting | No, in FAQ only |
| Confidence register | Assertive | Mature, confident | Principled, calm |
| Central proof | LoCoMo 94.6%+ | Trade-off logic | Architecture + Apache-2.0 |
| Risk of overclaim | Medium (verify CI) | Low | Low (claims are structural) |
| Rollback difficulty | High (public claim) | Medium | Low (no benchmark claim) |

---

## Tone calibration

Waggle glas kroz sve tri varijante ostaje isti po pet konstanti:

Stranim ili korporativnim rečima izbegavamo — "leverage", "solutions", "seamless", "unlock". Umesto toga: konkretno-imenovane capability-je ("memory that persists across sessions", "audit trail you can show a regulator"). Ovo važi u svakoj varijanti.

Prvo lice množine ("we") umereno, prvenstveno u announcement posts i research doc kontekstu. Landing copy ide u drugom licu ("your AI", "your data") jer je direktnije i daje veću ownership notion korisniku.

Developer register, ali ne developer-insider. "Apache-2.0" i "MCP-compatible" se pominju gde mesto čini razliku (technical audience, press release); u landing hero-u se zamenjuje sa "open source" i "works with any model". Copy može biti dvoslojan — outer layer razumljiv svakome u ICP-u, inner layer (methodology sections, technical posts) pokriva developer/researcher segmenta.

Narativ je "onošto smo dodali" (a cognitive layer), ne "onošto smo maknuli" (cloud, lock-in). Pozitivan frame gradi, negativan defanzivno objašnjava. Jedini moment gde negativan frame ima mesto je u Variant B i C gde trade-off ili principle zahteva imenovanje onoga što ne radimo.

Srpski interni paralel (ne za spoljni copy): "Vaš AI, vaš podatak, vaša mašina." Ako se ikada bude tražila srpska lokalizacija landing-a, ovaj anchor drži.

---

## Asset deployment sequencing (posle odluke koju varijantu koristiti)

Kad benchmark broj padne i Marko + PM donesu go-decision za varijantu, asset se aktivira sledećim redosledom:

Prvi dan (T+0): landing page hero (apps/www) se ažurira sa odgovarajućim headline + sub + hero copy. Research doc (benchmark-proof) je već javan na docs domenu. Link-ovi iz landing-a na research doc aktivni.

Drugi dan (T+1): announcement thread objavljen na primary channel (Twitter ili LinkedIn, preferred Marko-vođen). hive-mind OSS npm announce paralelno ako još nije javno. HN post timed.

Treći dan (T+2): press-style post na company blog (ako postoji) ili Medium kao direct output. Direct outreach ka 5-10 hand-picked tech journalists/analysts (pre-briefed under embargo 48h ranije idealno).

Prvi-drugi nedelja (T+7 do T+14): community outreach — Discord, Reddit relevant communities, HN pokušaji, podcast pitching.

Ovaj sequencing važi za svih A/B/C varijanti — razlika je isključivo u copy content-u, ne u kanalima ili tempu.

---

## Decision point: koji broj aktivira koju varijantu

Sledeća tabela je decision gate koja se aktivira čim LoCoMo FINAL_SCORE.json padne. Marko + PM čitaju broj, konsultuju tabelu, potvrđuju varijantu. 30 minuta od broja do decision. Ne duže.

| LoCoMo rezultat | 95% CI overlap sa Mem0? | Varijanta | Akcija |
|---|---|---|---|
| ≥ 96.6% | Nema | A (strong) | Lead sa "leads SOTA", 5pp margin |
| 94.6–96.5% | Nema | A | Lead sa "beats SOTA", 3pp margin |
| 92.0–94.5% | Delimičan | B | Lead sa "parity + trade-off" |
| 89.0–91.9% | Potpun | B | Isto, ali trade-off harder-forward |
| 85.0–88.9% | Ispod | C (ili rekalibracija) | Marko + PM decision: v3 GEPA ili C |
| < 85.0% | Ispod | Rekalibracija, launch delay | SOTA-gate halts default path |

H-43 LongMemEval i H-44 SWE-ContextBench imaju analogne zone ali ne menjaju primary variant selection ako je LoCoMo dominantan signal. Ako H-42 kaže A a H-44 je katastrofa, moguć je split: varijanta A zadrži LoCoMo proof, ali SWE-ContextBench se ne uključi u headline, ostaje u research doc sa honest context-om (variant A-minus sa poznatim ograničenjem).

---

## Next actions

Ovo je PM draft. Radi finalizacije potrebno je:

**Marko validation** — da pregleda sve tri varijante i potvrdi da tone i pozicioniranje odgovaraju njegovoj slici Waggle-a za launch. 30 min razgovor, ili async feedback u ovom fajlu sa komentarima na konkretne varijante.

**Copy polish** — ako budžet dozvoljava, prolaz kroz profesionalnog copywriter-a (eksterni) za Variant A i Variant B (one koje najverovatnije idu u produkciju). PM layer može sam da odradi Variant C ako je to fallback. Polish se radi na svim varijantama istovremeno, ne tek kad broj padne.

**Design asset prep** — landing page hero zahteva vizualni asset koji odgovara varijanti. Za A: confident, numbers-forward, možda stylized benchmark chart. Za B: balance imagery, local-vs-cloud compare. Za C: sovereignty visual, architecture diagram, compliance iconography. Design owner (ili Claude design system) treba da pripremi tri verzije pre Track 2 okončanja.

**Announcement channel prep** — Twitter/LinkedIn thread drafts, HN submission text, blog post skeleton. Sve tri varijante, sve u ovom fajlu ili u companion fajlovima `briefs/launch-copy-variant-{a,b,c}/`.

**Legal copy review** — bilo koja tvrdnja o "state of the art", "beats", "leads" zahteva legal sign-off ako budemo u regulisanoj jurisdikciji. Za EU AI launch, "beats SOTA" nije problem ali treba provera. Pre-mortem Elephant E-03 već liste ovu proveru kao launch-blocking.

---

## Appendix — Headline alternatives (longlist za svaku varijantu)

**Variant A pool (pick top 2 after Marko review):**
- Your local AI, now state of the art.
- We beat the leaderboard. With your data on your machine.
- State of the art memory, on the machine you own.
- Waggle: benchmarked. Beat the cloud. Kept your data.
- The first local cognitive layer to beat Mem0.
- Open source, local-first, and now SOTA on long-term memory.

**Variant B pool:**
- State of the art. On your machine. On your license.
- Top-of-leaderboard memory. Without the cloud, the contract, or the lock-in.
- Open source caught up to SOTA. Running locally. Running on your terms.
- Match the state of the art. Skip the cloud. Keep the receipts.
- Parity with Mem0. Plus everything the cloud doesn't give you.
- Your AI doesn't need the cloud to keep up.

**Variant C pool:**
- Your AI. Your data. Your receipts.
- Sovereign AI for people who can't afford to forget, leak, or explain.
- The AI that remembers, runs locally, and passes audits.
- Because your AI shouldn't forget, phone home, or make claims it can't prove.
- A cognitive layer for AI you actually own.
- Memory, continuity, and compliance — under your control.

---

## Appendix — Tagline (ultra-short, for app splash, social avatar bio, conference one-liner)

**Variant A:** "Local AI, state of the art."
**Variant B:** "SOTA memory. Your machine."
**Variant C:** "Your AI. Your data. Your receipts."

---

## Appendix — Decision references

- **LOCKED 2026-04-18** `decisions/2026-04-18-launch-timing.md` — SOTA-gated launch (aktivira zonu C + potencijalna rekalibracija)
- **LOCKED 2026-04-18** `decisions/2026-04-18-stripe-pricing.md` — pricing u svim varijantama
- **LOCKED 2026-04-19** `decisions/2026-04-19-target-model-qwen35b-locked.md` — model u svim varijantama
- **Memory** `project_core_thesis.md` — thesis formulacija (ne "small beats big", DA "cognitive layer")
- **Memory** `feedback_i18n_landing_policy.md` — English first, locale-ready

## Appendix — Komplementarni dokumenti

- `briefs/2026-04-19-sota-benchmark-pre-mortem.md` — definiše zone A/B/C
- `briefs/2026-04-19-sota-benchmark-audit-readiness.md` — gate policy za broj koji ulazi u copy
