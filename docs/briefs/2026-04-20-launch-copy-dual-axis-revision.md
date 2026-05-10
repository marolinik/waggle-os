# Waggle Launch Copy — Dual-Axis Revision (Multiplier Framing)

**Datum:** 2026-04-20
**Autor:** PM layer (Cowork session)
**Svrha:** Revizija single-axis varijanti iz `2026-04-19-launch-copy-variants.md`. Marko je 2026-04-20 ispravio framing: Waggle nije "Qwen stigao SOTA" nego "cognitive layer multiplikuje bilo koji LLM". To je dvoosna priča — Sovereignty axis × Performance axis — i zahteva copy koja prikazuje oba proof venue-a istovremeno, a ne bira jedan.
**Status:** Ovaj dokument je sada **primarni launch copy source**. Varijante A/B/C iz 2026-04-19 fajla su sačuvane kao fallback za single-model scenarije, ali default launch ide sa Varijantom M (Multiplier) opisanom dole.
**Jezik:** Engleski za copy. Interni rationale srpski CxO.

---

## Korekcija framing-a — šta sam propustio u prvom draftu

Prvi set varijanti (A/B/C) organizovan je oko jednog broja iz jednog run-a: Qwen 3.6 35B + Waggle na LoCoMo vs Mem0 91.6%. To je suzilo narativ na horse race "Qwen dovoljan da pobedi frontier memory wrapper". Taj frame je istovremeno previše ranjiv (ako broj nije čist, cela priča se meri) i previše skroman (ne koristi činjenicu da isti sloj multiplikuje i Opus, i GPT-5, i bilo koji drugi model).

Marko je 2026-04-20 formulisao ispravnu tezu u jednoj rečenici: **"Qwen 3.6 lokalno daje ti sve besplatno. Ako koristiš Opus preko API-a, Waggle ga čini još boljim od Opus-a bez Waggle-a."** To je dvostruko tvrđenje koje se ne svodi na jedan broj. Dvoosni multiplier kaže:

- **Sovereignty zone:** Qwen 3.6 35B (Apache-2.0, lokalno, nula API troška) + Waggle ≈ frontier API + proprietary memory wrapper. Poenta: sovereignty više nije ustupak u performansi.
- **Performance zone:** Frontier model (Opus 4.6, GPT-5, Gemini 3.1) + Waggle > isti model bez Waggle-a. Poenta: cognitive layer nije kompenzacija za slabost modela — on je multiplier na najjačima.

Obe zone istovremeno ruše dva različita prigovora. "Vi samo maskirate slab model" pada čim pokažemo lift nad frontier-om. "Qwen nije ozbiljan" pada čim Qwen + Waggle hvata frontier baseline. Ova konfiguracija proof-a je strukturno jača od bilo koje single-axis priče, i core thesis memory entry (`project_core_thesis.md`) već zabranjuje "small beats big" — dvoosni framing je zapravo konzistentniji sa postojećom kanonskom formulacijom.

---

## Posledica za Track 2 benchmark scope

Current H-42 plan (Qwen + Waggle vs Mem0 SOTA) pokriva samo sovereignty proof. Da bi dvoosna priča bila empirijski branjiva, potreban je paired run. Moja preporuka za Claude Code Track 2:

**H-42a (postojeći):** LoCoMo sa Qwen3.6-35B-A3B + Waggle cognitive layer. Ground truth, metodologija, 4-model judge ensemble (gemini-3.1-pro-preview, gpt-5, grok-4.20, MiniMax-M2.7) — sve ostaje kako je spec'd u `track-b-benchmarks-brief-2026-04-19.md`. Cilj: 91.6% Mem0 SOTA ± safety margin.

**H-42b (novi):** Identičan LoCoMo run, isti judge ensemble, ista ground truth — ali inference sloj je Opus 4.6 preko Anthropic API-a + Waggle cognitive layer. Baseline za poređenje je **Opus 4.6 bare** (tj. Opus bez Waggle memory/retrieval/wiki sloja, samo LoCoMo turn sequences direktno). Cilj: izmeriti lift (delta_pp = Opus+Waggle - Opus_bare). Ako lift ≥ +5pp, imamo clean multiplier proof.

**Zašto ovo ima smisla u istom sprint-u:**

- Judge ensemble run je zajednički — jedan set judge API poziva skorira oba inference run-a paralelno. Marginalni judge trošak je praktično nula.
- Inference cost paired setup-a: Opus 4.6 API trošak za LoCoMo cross-session Q/A (sličan budžet kao PA v5 test) — par stotina USD maksimalno za full run. Ne drama.
- Wall-clock: paralelne inference queue-e, ukupno vreme = max(Qwen_run, Opus_run) ≈ Qwen_run (Opus preko API je sporiji ali paralelizabilan). Dodatak tebi zero hours, dodatak timu možda +4h setup-a.
- Reproducibility bundle je minimalan dodatak — CONFIG.json ima dve inference grane umesto jedne.

**Šta ovo menja u postojećim briefima:**

- **Pre-mortem:** T-02 (score below noise) više nije launch-blocking sam po sebi. Novi T-02' je "oba proof venue-a padaju istovremeno" — verovatnoća dramatično niža. T-08 (narrative drift) se slabi jer imamo dva sidra umesto jednog. Memory entry `project_sota_benchmark_governance.md` treba addendum.
- **Audit-readiness brief:** 14-stavka pre-flight checklist se proširuje na 16 — dodaju se 2 stavke za H-42b (paired inference reproducibility + Opus API ledger separat od Qwen local ledger-a).
- **Headline safety margin:** +3pp beats / +5pp leads (iz pre-mortem-a) ostaje za Qwen run kao SOTA beats claim. Za Opus run, safety margin je strukturno drugačiji — lift ≥ +5pp (Opus+Waggle vs Opus_bare) je "multiplier proves" threshold, bez direktnog SOTA-comparison-a.

LongMemEval (H-43) i SWE-ContextBench (H-44) za sada ostaju single-model (Qwen + Waggle). Ekspanzija na paired mode za njih može da ide u sledeći ciklus ako H-42b metodologija proradi čisto.

---

## Varijanta M — Multiplier (novi default)

**Aktivira se:** H-42a (Qwen sovereignty run) hvata ≥89% LoCoMo **I** H-42b (Opus paired run) pokazuje lift ≥+5pp nad Opus_bare. Oba proof venue-a moraju biti zelena da bi Varijanta M bila default.
**Confidence level:** high when both greens, medium when one green + one neutral.
**Tone:** Calm-confident. Dvoosni proof govori sam za sebe; copy ga prevodi u jezik operacionih posledica.

### M.1 Hero — landing page

**Headline option M1 (multiplier-forward):**
> The cognitive layer that makes your AI better. Whatever AI you pick.

**Headline option M2 (dual-proof):**
> Frontier-grade memory, on the model you choose. Local or cloud.

**Headline option M3 (capability + sovereignty):**
> Better Opus. Free Qwen. Same cognitive layer.

**Sub-headline (three-way universal):**
> Waggle's open-source cognitive layer — memory, retrieval, and a living wiki — gives any LLM the continuity it doesn't have on its own. Run frontier models for maximum capability, or run Qwen 3.6 35B locally for zero-cost sovereignty. Either way, your AI keeps getting better across sessions.

**Hero body (~85 words):**
> Most AI forgets every time you close the tab. Waggle doesn't. A local cognitive layer — memory that persists, retrieval that compounds, a wiki that writes itself — keeps your AI continuous across sessions, projects, and weeks. We benchmarked it two ways: open-source Qwen 3.6 35B with Waggle matches frontier API memory systems on LoCoMo, running entirely on your laptop. Frontier Opus 4.6 with Waggle beats Opus 4.6 alone by [X] points. The layer works on whatever you run. You just stop forgetting.

**Primary CTA:** `Start free → Solo forever`
**Secondary CTA:** `See both benchmarks →` (jedan link na combined research doc sa H-42a + H-42b rezultatima paralelno)

### M.2 Announcement opener

**Thread lead (X / LinkedIn):**
> For 18 months the pitch has been "bigger model, more cloud, more lock-in." We went sideways. Today Waggle ships two proofs in one: open-source Qwen 3.6 35B + our cognitive layer matches Mem0 on LoCoMo — running local, Apache-2.0, zero API. And frontier Opus 4.6 + our cognitive layer beats Opus 4.6 alone by [X] points. Same layer. Different AI. Better either way.

**Follow-up 5-post skeleton:**
> 2/ The thesis: cognitive layer (memory + retrieval + wiki) multiplies whatever LLM runs underneath. It's not a wrapper around one model — it's a substrate any model plugs into.
>
> 3/ Proof one — sovereignty: LoCoMo [X]% on Qwen 3.6 35B (Apache-2.0, 35B/3B MoE) running locally. Matches Mem0 SOTA 91.6% within [Y] percentage points. Zero API dependency. Zero per-query cost. Your laptop is enough.
>
> 4/ Proof two — multiplier: LoCoMo with Opus 4.6 + Waggle vs Opus 4.6 alone. Waggle adds [Z] points over bare Opus. The cognitive layer isn't compensation for model weakness — it's amplification on the strongest models we tested.
>
> 5/ Methodology: 4-model judge ensemble (Gemini 3.1 Pro, GPT-5, Grok 4.20, MiniMax M2.7) — no Anthropic in the loop, no self-grading. Evaluator ported from Mem0 upstream. CONFIG.json, commit SHAs, reproducibility bundle in the research doc.
>
> 6/ Launch: Solo free forever. Pro $19/mo. Teams $49/seat. Desktop app (Tauri 2.0, Mac/Win/Linux). hive-mind OSS memory core on npm today, Apache-2.0. Works with Qwen, Opus, GPT-5, Gemini, or whatever you bring.

### M.3 Proof points (for press-style post)

- **Sovereignty proof:** LoCoMo [X]% with Qwen 3.6 35B + Waggle, running locally on consumer hardware. Statistical parity with Mem0 91.6% SOTA. Zero API dependency.
- **Multiplier proof:** LoCoMo [Y]% with Opus 4.6 + Waggle vs [Y-Z]% with Opus 4.6 alone. Lift of [Z] points attributable to cognitive layer. Both runs scored by the same judge ensemble.
- **Methodology transparency:** 4-model judge ensemble (no Anthropic in the loop). Evaluator ported directly from Mem0 upstream with diff documented. CONFIG.json, commit SHAs, reproducibility bundle public.
- **Model-agnostic architecture:** Same Waggle cognitive layer used for both runs. Inference plane plugs into any MCP-compatible LLM endpoint. Qwen 3.6 local, Anthropic API, OpenAI API, Google API — same substrate underneath.
- **Privacy posture (sovereign run):** Memory database stays on user's machine. Zero telemetry by default. Cloud calls (if any, for frontier model inference) are explicit user choice, not product default.
- **Open foundation:** hive-mind OSS memory core, Apache-2.0, on npm today. 282/282 tests. Audit, fork, self-host.

### M.4 Key differentiators (copy-ready)

> **Multiplier, not wrapper.** Waggle's cognitive layer amplifies whatever LLM runs underneath. Qwen gets closer to frontier. Frontier models get better than they are alone. One substrate, any inference plane.
>
> **Sovereignty without the ceiling.** Qwen 3.6 35B locally + Waggle hits frontier-grade long-term memory. You don't trade capability for control — you get both.
>
> **Multiplier without the markup.** Use frontier models when maximum capability matters, and Waggle makes them measurably better. Not a replacement; an amplifier.
>
> **Local by default, open by design.** Your memory database stays on your disk. hive-mind memory core is Apache-2.0 on npm. Audit it, fork it, self-host it.
>
> **Audit-ready.** EU AI Act audit triggers, GDPR Art. 17/19 retention, and full interaction provenance — built in from day one, not bolted on for compliance theater.

### M.5 Do / Don't for Variant M

**Do:**
- Lead with duality. Both proof venues need to appear in the first paragraph of any long-form asset. That is the whole point.
- Name models explicitly when space allows (Qwen 3.6 35B on one side, Opus 4.6 on the other). Concrete names make the dual-axis story credible.
- Use the word "multiplier" or "amplifier" deliberately. Avoid "wrapper" — it flattens the architecture claim.
- Show numbers from both runs. If you cite one without the other, you've collapsed to single-axis and lost the main proof.
- Preserve the choice framing — the user picks the inference plane, Waggle does the rest.

**Don't:**
- Say "small beats big." Reflection 70B cautionary tale. Qwen 3.6 35B is efficient, not small. Frontier + Waggle > frontier alone is the bigger claim anyway.
- Imply Waggle replaces the model. "The cognitive layer does the heavy lifting" collapses into wrapper framing. Waggle and the model are both load-bearing.
- Cherry-pick one proof venue for one audience. The duality is the product story, not a positioning tactic.
- Use superlatives uncovered by both proof runs ("the best AI memory" — no; "state-of-the-art long-term memory across both open-source and frontier inference" — defensible but wordy).
- Bury H-42b in a footnote. The multiplier proof on frontier model is as important as the sovereignty proof on Qwen.

---

## Ažurirana decision matrix (paired benchmark)

Tabela se sada čita po dve dimenzije istovremeno. H-42a je red, H-42b je kolona.

| H-42a (Qwen+Waggle vs Mem0) ↓ / H-42b (Opus+Waggle vs Opus_bare) → | Lift ≥ +5pp (strong) | Lift +2-5pp (moderate) | Lift <+2pp (weak) |
|---|---|---|---|
| ≥ 94.6% (beats SOTA clean) | **M-strong:** "beats SOTA and multiplies frontier" | **M:** dual proof, multiplier nuanced | **A:** drop to single-axis SOTA beat |
| 89-94.5% (parity) | **M:** "sovereignty parity + clean multiplier" — default | **M-nuanced:** parity + moderate lift | **B:** drop to trade-off single-axis |
| < 89% (below) | **M-performance-only:** multiplier proof carries, sovereignty softened | **B':** multiplier-centric, sovereignty deprioritized | **C:** category + delay |

Čitanje tabele: Varijanta M je default u 6 od 9 ćelija (svi slučajevi gde makar jedan proof venue drži vodu). Varijanta M-strong je kada oba gađaju čisto iznad pragova. Varijante A/B/C iz 2026-04-19 fajla se aktiviraju samo u "weak × below" uglovima — i dalje su korisne kao fallback, ali defaultovi se promenili u korist dvoosnog framing-a.

**Decision time:** kad FINAL_SCORE.json padne za **oba** run-a (H-42a i H-42b), čitaš tabelu, potvrđuješ ćeliju, biraš varijantu. 30 min od broja do decision-a. Pravilo ostaje.

---

## Šta ostaje iz 2026-04-19 fajla

Originalne varijante A (Beats), B (Matches), C (Below) zadržavaju vrednost u tri slučaja:

Prvo, ako H-42b iz bilo kog razloga ne prođe audit-readiness gate (npr. Anthropic API flaky u run window-u, ili judge ensemble ne skorira oba inference run-a istovremeno), pada se na single-axis framing. U tom slučaju A/B/C su odmah spremne i ne trebaju novi draft.

Drugo, tone calibration, asset deployment sequencing, headline longlists i legal copy review note-ovi iz 2026-04-19 fajla važe za sve varijante uključujući M. Ne dupliram ih ovde.

Treće, Do/Don't liste varijanti A/B/C ostaju reference za situational messaging — recimo, u enterprise pitching-u za regulated industry, Varijanta C sovereignty language može biti prikladniji od Varijante M opsegom audience-a.

---

## Next actions

**Marko validation (najvažnije):** da pregleda Varijantu M i potvrdi da multiplier framing odgovara slici koju želi za launch. Ako M headline "Better Opus. Free Qwen. Same cognitive layer." pogađa ton, idemo s tim. Ako je previše blaguje ili previše tehničko, pick iz M.1 longlist-a u appendix-u ili novi headline pass.

**Claude Code handoff za H-42b:** ako validiraš multi-model expansion, treba mi green light da napišem handoff brief za H-42b (paired Opus run). Format identičan `track-b-benchmarks-brief-2026-04-19.md`, sa spec-om za Opus 4.6 API integraciju + Opus_bare baseline + paired reproducibility bundle.

**Audit-readiness + pre-mortem addendum:** pisaću kratki addendum fajl koji prošireuje 14-stavka checklist na 16 i revidira T-02/T-08 rizike za paired scenario. Ne diram originalne fajlove — addendum je separate, linked iz oba.

**Copy polish (ako budžet dozvoljava):** Varijanta M ide u eksterni copywriter pass paralelno sa A/B. Design asset prep za M: dvoosni vizual (frontier axis × sovereignty axis sa Waggle kao crossing point), ili dva paralelna benchmark chart-a side-by-side.

**Legal copy review:** "multiplies" i "amplifier" nisu striktno comparative claim-ovi ali "makes Opus better than Opus alone" jeste. Pre-mortem Elephant E-03 (legal) je već flagovan — sada pokriva i Opus comparative claim. Verifikovati pre headline-a.

---

## Appendix — Headline M pool (pick top 2 after Marko review)

- The cognitive layer that makes your AI better. Whatever AI you pick.
- Frontier-grade memory, on the model you choose. Local or cloud.
- Better Opus. Free Qwen. Same cognitive layer.
- Your AI gets better. The model stays yours.
- One memory layer. Any model. Better either way.
- Sovereign when you need to. Frontier when you want to. Continuous either way.
- The layer under your AI. Whatever AI that is.

## Appendix — Tagline M (ultra-short)

- "Any AI. Better."
- "Your layer. Any model."
- "Continuous. Sovereign. Or frontier."

---

## Appendix — Decision references

- **LOCKED 2026-04-18** `decisions/2026-04-18-launch-timing.md` — SOTA-gated launch (dvoosni proof olakšava gate)
- **LOCKED 2026-04-19** `decisions/2026-04-19-target-model-qwen35b-locked.md` — Qwen ostaje default u sovereignty zone
- **Memory** `project_core_thesis.md` — multiplier framing je konzistentan sa "cognitive layer spojen sa bilo kojim LLM-om"
- **Memory** `project_multiplier_thesis.md` (novi, 2026-04-20) — dvoosni proof kao kanonski framing

## Appendix — Komplementarni dokumenti

- `briefs/2026-04-19-launch-copy-variants.md` — single-axis A/B/C varijante (fallback)
- `briefs/2026-04-19-sota-benchmark-pre-mortem.md` — risk register (addendum dolazi za paired scenario)
- `briefs/2026-04-19-sota-benchmark-audit-readiness.md` — gate policy (addendum dolazi za H-42b)
- `briefs/track-b-benchmarks-brief-2026-04-19.md` — Track 2 operational brief (verzija 2 dolazi za paired setup)
