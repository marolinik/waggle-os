# CC Sprint 10 — Task Brief

**Datum:** 2026-04-21
**Preceded by:** Sprint 9 final briefing (`sessions/2026-04-21-sprint-9-final-briefing.md`) · Stage 0 final close-out (`sessions/2026-04-21-stage-0-final-close-out.md`)
**Scope LOCKED memory:** `.auto-memory/project_sprint_10_scope_locked.md`
**Wall-clock ceiling:** 12–16 dana
**Cost ceiling:** $140 hard stop (Sprint 10 total, across svih tasks)

---

## 0. Šta se menja u odnosu na Sprint 9

Sprint 9 se završio sa jednim klinički čistim rezultatom (10/10 Opus calibration) i jednim operativnim dugom od tri stavke. Sprint 10 ne širi scope narativno — namerno NE ulazi u landing copy, brand narrative, ili launch assets pre LoCoMo gate-a. Umesto toga, **zatvara ceo operativni queue** da Stage 2 LoCoMo full-run može krenuti bez ijedne produkcione nepoznate.

Četiri paralelne vektorske linije — svaka sa jasnim acceptance kriterijumom, svaka nezavisno od ostalih commit-able.

---

## 1. Vector 1 — Operativni queue (Sprint 9 §5.2 + §3.2, full-resolve)

### Task 1.1 — Qwen3.6 thinking-mode stability matrix

**Spec referenca:** `waggle-os/docs/plans/STAGE-2-PREP-BACKLOG.md` (commit `813a4eb`)
**Budget:** $5 hard ceiling
**Effort estimate:** 4–6h

**Šta radi:** Izvršava 2 × 4 × 5 test matrix (thinking on/off × max_tokens {8K, 16K, 32K, 64K} × prompt shape {direct, multi-anchor, chain-of-anchor, temporal-scope, null-result-tolerant}). Svaku ćeliju klasifikuje kao: `converged` / `loop` / `truncated` / `empty-reasoning-only`.

**Deliverable:**
- CSV heat-map: `waggle-os/benchmarks/harness/data/qwen-stability-matrix-2026-04-XX.csv`
- Markdown summary: `waggle-os/docs/reports/qwen-thinking-stability-2026-04-XX.md`
- Explicit flag lista "Stage-2-unsafe cells" sa obrazloženjem za svaku ne-converged ćeliju.

**Acceptance:**
- Sve 40 ćelija izvršene, zero empty cells.
- Svaka ćelija klasifikovana u jedan od četiri outcome bucket-a.
- Safety matrica: koje (thinking, max_tokens) kombinacije su pouzdane za Stage 2 LoCoMo scale.
- Spend ≤ $5.

**Exit criterion:** ako bilo koja od (thinking-off, max_tokens ≥ 16K) konfiguracija konvergira 100% across svih 5 prompt shapes — Stage 2 primary config LOCKED na taj config; ako ne, eskalira u PM za re-scoping.

---

### Task 1.2 — Sonnet route repair

**Budget:** $0 (config edit + regression)
**Effort estimate:** 30min

**Šta radi:** `litellm-config.yaml` alias `claude-sonnet-4-6` trenutno pokazuje na decommissioned `claude-sonnet-4-6-20250514`. Repair: mapirati na trenutno živi Sonnet slug (verifikuj na `https://docs.anthropic.com/en/docs/about-claude/models/overview`). Ako nema direktnog zamenika, PR sa privremenim promote-om na `claude-opus-4-7` i dokumentovana migraciona nota u `waggle-os/ops/litellm/README.md`.

**Acceptance:**
- `litellm-config.yaml` izmenjen, regression test na judge-client `invokeJudge({ model: "claude-sonnet-4-6", ... })` prolazi bez `model_not_found` greške.
- PR sa commit message referencirajući ovaj brief.
- Marko ratifikuje mapping pre merge-a (PM review gate).

---

### Task 1.3 — Sonnet calibration re-run posle Task 1.2

**Depends on:** Task 1.2 CLOSED.
**Budget:** $0.50 (10 calibration pairs × Opus baseline + Sonnet diff)
**Effort estimate:** 1h

**Šta radi:** Izvršava Task 4 calibration re-run (istih 10 ground-truth triples iz `f9b98aa` calibration artifact) na Sonnet ruti. Rezultat upisuje u isti calibration artifact format.

**Acceptance:**
- Calibration match rate zabeležen (očekivano 8–10/10 na osnovu Haiku 5/10 + Opus 10/10 tier pozicioniranja).
- Ako Sonnet ≥ 9/10 → Sonnet postaje Stage 2 primary default (brief konfiguraciju).
- Ako Sonnet 7–8/10 borderline → **triggeruj Task 5 Fleiss' kappa ensemble** (Sprint 9 brief conditional) na ensemble MULTI-VENDOR iz Vector 2, ne Claude-only.
- Ako Sonnet < 7/10 → stick with Opus, flag za PM review.

---

### Task 1.4 — DashScope provisioning (paralelni track)

**Budget:** $0 (account provisioning)
**Effort estimate:** Marko-side account work + CC-side config (30min CC effort kad key stigne)

**Šta radi:** DashScope direct key provisioning za `qwen3.6-35b-a3b` canonical slug (LiteLLM upstream). OpenRouter route ostaje bridge/failover.

**Acceptance:**
- `litellm-config.yaml` sadrži oba route-a: `qwen3.6-35b-a3b` (DashScope direct) + `qwen3.6-35b-a3b-via-openrouter` (bridge).
- Failover policy dokumentovan: DashScope primary, OpenRouter retry-on-rate-limit fallback.
- Regression test pokriva oba route-a sa istim probe prompt-om i pokazuje byte-equivalent inference output.

**Napomena:** Ovaj task ne blokira Stage 2 kickoff. OpenRouter route je dovoljan za 200+ Qwen calls per 4-cell batch. DashScope je on-prem parity hedge, ne critical path.

---

### Task 1.5 — Harvest Claude artifacts adapter (hive-mind)

**Spec referenca:** `hive-mind/BACKLOG.md` (commit `b3348fb`) — tri source-path opcije u priority order
**Budget:** $0 (adapter development + regression, no paid inference)
**Effort estimate:** 6–10h

**Šta radi:** Implementira Opcija 1 (current export bundles artifacts dir) kao primary. Opcija 2 (Claude.ai API listing) i Opcija 3 (Computer Use scraping) ostaju kao backlog hedge ako Opcija 1 pokaže gap-ove.

**Deliverable:**
- `hive-mind/packages/cli/src/commands/harvest-claude-artifacts.ts` (nova datoteka)
- UniversalImportItem sa `type: "artifact"`, `parent_conversation_id`, inherited timestamp
- Regression tests: 2 scenario-level cases (artifact sa valid parent, artifact bez parent fallback)

**Acceptance:**
- Re-harvest Marko personal corpus na fresh export bundle (Marko daje): artifacts se pojavljuju kao frames sa type-annotation.
- Dogfood probe: frame 421 (januar 2026) i njeni artifacts (MASTER_PLAN_REVIZIJE.md + drugi) svi accessibil u chat-text substrate.
- Zero regresija na postojeće 305 tests.
- tsc clean.

**Non-goal:** Ovaj task NE pokriva LoCoMo (LoCoMo je chat-text-only by construction). Adapter služi za buduće dogfood cikluse na real korpus, i za launch narrative o completeness-u substrate layer-a.

---

## 2. Vector 2 — Multi-vendor ensemble setup LOCKED

### Zašto NE Claude-only trio (rejection rationale u memoriji)

Predlog "Sonnet + Opus + Haiku" kao tri-judge ensemble je **eksplicitno odbijen**. Razlog:

> Tri modela iz iste organizacije, iste training distribucije, deljenih bias-a ne čine legitimni inter-rater agreement. Fleiss' kappa na toj konfiguraciji meri unutar-Claude konzistenciju, ne independent judgment agreement. Defensibility claim koji se oslanja na tu statistiku rizikuje trivijalnu kritiku "sva tri su Claude" od bilo kog spoljnog reviewer-a — akademskog ili komercijalnog.

Referenca: `.auto-memory/project_sprint_10_scope_locked.md`

### Task 2.1 — Tri-vendor API integracije

**Budget:** $5 (integration probe + smoke tests across sva tri)
**Effort estimate:** 6–8h

**Vendori (latest frontier per vendor — namerno biran):**
1. **Anthropic Opus 4.7** — već integrisan (Sprint 9 Task 4 production)
2. **OpenAI GPT-5.4** — nova integracija (latest, ne GPT-5 baseline)
3. **Google Gemini 3.1** — nova integracija (latest, ne Gemini 3 Pro baseline)

**Napomena:** Ako bilo koji od tri latest model-a nije provisionable kroz OpenAI/Google API-je u trenutku Task 2.1 kickoff-a (npr. waitlist, regionalne restrikcije, pricing nepotvrđen), CC dokumentuje blocker + predloži najbliži available tier u fallback listi. PM ratifikuje fallback pre nastavka — ne unilateralno padati na stariji tier.

**Šta radi:**
- LiteLLM config: tri route-a sa provider-specific parameter normalizacijom (temperature, max_tokens, reasoning_effort, structured output schema per vendor).
- Judge-client (packages/harness ili gde je trenutno) proširen sa vendor-agnostic `invokeJudge()` koji normalizuje prompt, parsuje response, i nosi vendor-specific retry policy.
- Failure handling: vendor A timeout ne blokira vendor B/C; aggregator sakuplja N-of-3 where N ≥ 2 je operable ensemble.

**Deliverable:**
- Updated `litellm-config.yaml` sa svim tri route-a
- `invokeJudgeEnsemble()` metoda sa policy "minimum 2-of-3 required, fail-open on 3rd vendor"
- Smoke test suite: 5 ground-truth triples × 3 vendora = 15 invocations, verdict logging, cost logging
- `docs/reports/multi-vendor-ensemble-baseline-2026-04-XX.md` — per-vendor match rate vs PM ground truth

**Acceptance:**
- Sva tri vendora vraćaju parsable verdict sa istog prompt shape-a.
- Per-vendor match rate zabeležen. Očekivano: Opus 10/10 (iz Sprint 9), GPT-5.4 ~8-10/10, Gemini 3.1 ~7-10/10.
- Ensemble Fleiss' kappa izračunat na 10 triples minimum pre pravog Stage 2 run-a.

---

### Task 2.2 — Fleiss' kappa ensemble baseline

**Depends on:** Task 2.1 CLOSED.
**Budget:** $3
**Effort estimate:** 2h

**Šta radi:** Na 15 ground-truth triples (10 iz Sprint 9 calibration + 5 novih koje PM sastavlja za pokrivenost multi-category), izvršava full ensemble i računa Fleiss' kappa.

**Pre-registered interpretation bands:**
- κ ≥ 0.80 → **strong agreement** — ensemble ready for Stage 2 full-run, ensemble verdict primary
- 0.60 ≤ κ < 0.80 → **substantial agreement** — ensemble ready, ali dodaje tie-breaker policy dokumentovana
- 0.40 ≤ κ < 0.60 → **moderate** — flagged za PM review pre Stage 2 kickoff-a
- κ < 0.40 → **fair ili worse** → go/no-go review; scope pivot ka single-judge Opus + rubric refinement

**Deliverable:**
- `docs/reports/multi-vendor-kappa-baseline-2026-04-XX.md` sa per-pair kappa (A-B, A-C, B-C), aggregate Fleiss' kappa, interpretation band, i recommended Stage 2 policy.

**Acceptance:**
- Kappa izračunat, interpretation band pristiman, preporuka za Stage 2 jasna.
- PM review gate pre Stage 2 kickoff-a ako band je "moderate" ili niže.

---

## 3. Vector 3 — Launch prep SPLIT (narrative-agnostic only)

**Ovaj vector NE ide kroz ovog CC. Ide paralelno kroz posebnu CC sesiju koju PM (Claude Opus 4.7 u Cowork mode) koordiniše.**

Reason za split: ovaj brief je za CC koji drži tehnički execution i nema kontekst za brand voice, persona, i visual identity rad. Launch prep koji NE zavisi od LoCoMo rezultata pokriva:

- Persona research deep dives (nastavak `project_persona_research_scope.md`, 10 persona)
- Brand asset inventory (audit apps/www/public/brand + konsolidacija)
- Visual identity konsolidacija (extend Hive DS sa honeycomb motif, review globals.css tokens)
- Stripe/billing polish (ne-funkcionalni copy polish, legal review hooks)
- Legal/licensing prep (Apache 2.0 compliance audit hive-mind)
- i18n policy finalizacija (`feedback_i18n_landing_policy.md` — engleski first, locale-ready infra)

**Eksplicitno DEFEROVANO u Sprint 11:**
- Landing copy (zavisi od LoCoMo brojke)
- Brand narrative sync (zavisi od LoCoMo brojke)

---

## 4. Vector 4 — Harvest artifacts adapter

Pokriveno u Task 1.5 (Vector 1). Reprized ovde kao paralelna linija jer je CC može započeti bez čekanja Vector 1.1–1.4.

---

## 5. Pre-registered LoCoMo acceptance thresholds (informativna sekcija, CC ne mora da ih implementira, ali mora da ih poštuje u agregator output-u)

Pre Stage 2 full-run, Stage 2 aggregator mora emitovati eksplicitni banner na osnovu finalnog LoCoMo score-a:

| Score | Banner | Consequence |
|---|---|---|
| **≥ 91.6%** | `NEW_SOTA` | Full launch narrative (Opus-class multiplier claim) |
| **85.0–91.5%** | `SOTA_IN_LOCAL_FIRST` | Narrower launch framing (sovereignty vs cloud-revenue positioning) |
| **< 85.0%** | `GO_NOGO_REVIEW` | Auto-halt, kompletna scope reklasifikacija sa PM pre bilo kakve javne komunikacije |

Banner ulazi u agregator markdown report `##` header. NEMA post-hoc narrative shifting. Ako rezultat padne ispod 91.6% — threshold bands se NE pomeraju. Workflow Reality Check anti-pattern #4 je na snazi.

---

## 6. Sequencing i zavisnosti

```
Task 1.1 (Qwen stability)  ─────┐
Task 1.2 (Sonnet route) → Task 1.3 (Sonnet calibration) ─┐
Task 1.4 (DashScope)  ───────────┤                        ├→ Gate: Stage 2 kickoff ready
Task 1.5 (Artifacts adapter) ────┤                        │
Task 2.1 (Tri-vendor setup) → Task 2.2 (Kappa baseline) ──┘
```

Task 1.1, 1.4, 1.5, 2.1 mogu krenuti paralelno dan-1. 1.2 → 1.3 je sekvencijalno. 2.2 zavisi od 2.1.

**Stage 2 kickoff gate:** sve od 1.1, 1.3, 2.2 mora biti CLOSED sa acceptance band na ili iznad minimuma (1.1 → bar jedna safe config; 1.3 → bar 7/10; 2.2 → bar moderate kappa).

---

## 7. Cost ceiling i governance

| Task | Budget | Running total |
|---|---|---|
| 1.1 | $5 | $5 |
| 1.2 | $0 | $5 |
| 1.3 | $0.50 | $5.50 |
| 1.4 | $0 (Marko provisioning) | $5.50 |
| 1.5 | $0 | $5.50 |
| 2.1 | $5 | $10.50 |
| 2.2 | $3 | $13.50 |
| **Stage 2 projected (not Sprint 10 scope, informativno)** | $90–130 | — |

**Sprint 10 hard stop: $15 across svih tasks.** Ako task prelazi budget, HARD STOP, PM review pre nastavka.

**Stage 2 projekcija ($90–130) je van Sprint 10 ceiling-a.** Kickoff Stage 2 full-run ide kao zaseban PM go-ahead nakon Sprint 10 close-a.

---

## 8. Reporting cadence

- **Dan-1 EOD:** kratka update nota u `sessions/2026-04-22-sprint-10-day-1-status.md` — koje task-ove si pokrenuo, koji commit-i su prošli.
- **Mid-sprint:** kada je 3 task-a CLOSED — update nota + preliminary findings.
- **Sprint 10 close:** `sessions/2026-04-XX-sprint-10-final-briefing.md` po istom template-u kao Sprint 9 final briefing.
- **Anti-pattern check:** ako u toku task-a identifikuješ novi substrate failure mode, `feedback_workflow_reality_check.md` anti-pattern #4 remains hard rule — document the mode, open backlog ticket, **ne reformulisati gate ili acceptance threshold post-hoc**.

---

## 9. Shta NE raditi u Sprint 10

- Ne pisati landing copy.
- Ne dirati brand narrative dokumente.
- Ne pokretati Stage 1 ili Stage 2 full-run dok gate uslovi iz §6 nisu ispunjeni.
- Ne širiti judge ensemble van tri-vendor konfiguracije LOCKED u Vector 2 (ne dodavati 4., 5. vendor "just in case").
- Ne lock-ovati Stage 2 primary judge na osnovu Task 1.3 single-vendor Sonnet result-a — tek posle Task 2.2 ensemble kappa.

---

## 10. Sprint 10 close criteria

Sprint 10 se zatvara kada:

1. Sve task-ove iz Vector 1 i Vector 2 CLOSED sa acceptance band ili iznad.
2. Sprint 10 final briefing napisan + PM ratifikovan.
3. Stage 2 kickoff memo (poseban brief) napisan i PM-ratified za narednu CC sesiju.
4. Zero test regressions, tsc clean, sve commit-e pushed.

Launch copy / brand narrative / Stage 2 full-run izvršenje → Sprint 11 scope, ne ovde.

---

**End of Sprint 10 brief. Awaiting CC execution.**
