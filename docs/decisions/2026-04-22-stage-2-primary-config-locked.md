# Stage 2 Primary Config — LOCKED

**Datum:** 2026-04-22
**Ratified by:** Marko (2026-04-22)
**Author:** PM
**Source memo:** `strategy/2026-04-22-stage-2-qwen-config-ratification-memo.md`
**Sprint 11 track:** B1 CLOSED
**Status:** LOCKED — sve Stage 2 batch execution mora koristiti ratified config eksplicitno

---

## 1. Ratified config

**`thinking=on, max_tokens=64000`** (safe config #1 iz Task 1.1 stability matrix pool-a)

Route: `qwen3.6-35b-a3b-via-openrouter` (OpenRouter bridge, canonical slug per `project_target_model_qwen_35b.md`).

---

## 2. Marko rationale

> *"JA bih on/64k thinking nam je u v05 dao dobre rezultate tako da bih ja obavezno radio sa thinking on"*

V05 kontekst: prethodni interni eval gde thinking=on pokazao bolju performansu na LoCoMo-like task-ovima. Marko ne želi da recovery risk od thinking-off eliminaciji reasoning surface-a izvan zone gde on/64K je demonstratibly stabilan.

**Operativno:** thinking=on je default kroz ceo Stage 2 stack (mikro-eval, 4-cell mini, full-run). Thinking=off ostaje rezervisan kao contingency ako budući signal pokaže da reasoning ne doprinosi (ne pre Sprint 12 retrospektive).

---

## 3. PM preporuka odbijena sa razlogom

PM predlog bio je `thinking=off, max_tokens=16000` zbog cost-per-call minimizacije i manjeg audit observability surface-a. Marko je prihvatio cost tradeoff u korist performance evidence-a iz v05 eval-a. Ova odluka je Marko-level strategic call i nadilazi PM cost-optimization heuristiku.

PM obaveze koje ulaze u igru zbog ovog izbora:
- **Budget re-projection** (§4 ovog dokumenta) — Stage 2 troškovi materijalno viši.
- **H-AUDIT-1 scope extension** (§5) — reasoning_content mora biti eksplicitno adresiran u design doc-u.
- **Latency expectation** (§6) — paradoksalno, `on/64K` je brži od PM-ove preporuke (17.9s vs 27.6s avg), tako da latency impact je pozitivan.

---

## 4. Budget re-projection

| Scenario | Per-call cost estimate | 4-cell mini (200 calls) | Full-run (2000 calls) |
|---|---|---|---|
| PM preporuka `off/16K` | $0.005-0.010 | ~$1.60-2.00 | ~$16-20 |
| **Ratified `on/64K`** | **$0.015-0.025** | **~$3-5** | **~$30-50** |
| Delta | ~2.5x | +$1.50-3.00 | +$14-30 |

**Per-task budget update:**

| Task | Prior projection | Updated projection |
|---|---|---|
| B1 (config apply + smoke test) | $0.05 | $0.05 (unchanged) |
| C2 (Stage 1 mikro-eval) | $5-10 | $8-15 |
| C3 (Stage 2 4-cell mini) | $4-6 expected / $134 cap | $8-14 expected / $134 cap |

Cap-ovi ostaju nepromenjeni; samo expected values ažurirane. Sprint 11 total ceiling ostaje ~$150. H-42a/b Stage 2 full-run envelope ($1500-2600) apsorbuje ~$14-30 razliku bez impacta na gate odluku.

**Judge cost-i (Sonnet 4.6) ostaju isti** — tie-break policy i judge sampling unchanged.

---

## 5. H-AUDIT-1 scope extension (impact on Track A A1)

Thinking=on generiše `reasoning_content` polje u response-u. Za audit-grade reproducibility (Sprint 11 Track A exit criterion), svaki token surface mora biti rekonstruktabilan iz turnId-a. CC-1 Task A1 design doc mora eksplicitno pokrivati:

- **Reasoning_content persistence rule:** gde se reasoning_content persista u trace store-u (da li pod istim turnId ili u poseban slot).
- **Reasoning_content retention policy:** koliko dugo, gde se storuje, da li je deo audit export-a.
- **Reasoning_content exclusion rule:** gde ne-ulazi (npr. ne-smie u user-facing output log-ove ako trace ima public visibility).

Ovo je dodatak design doc-u, ne izmena scope lock-a (design doc je već Track A A1, extension je internal stavka).

CC-1 brief `briefs/2026-04-22-cc-sprint-11-kickoff.md` §3 Task A1 dobija add-on bullet za reasoning_content handling. Update u followup message-u.

---

## 6. Latency expectation

Task 1.1 data: avg 17.9s per call na `on/64K` vs 27.6s na `off/16K`. Razlog: `on/64K` konvergira brže jer model ne truncira razmišljanje.

Stage 2 wall-clock implications:
- 4-cell mini 200 poziva × 17.9s avg = ~60 min sekvencijalno (ili manje ako parallelizable).
- Full-run 2000 poziva × 17.9s = ~9.9h sekvencijalno, staje u 1 radni dan sa parallel batch-ovima.

Net pozitiv vs PM preporuka na wall-clock.

---

## 7. CC-1 apply akcija (Task B1 execution)

Čim ovaj decision dokument landuje, CC-1 u Task B1:

1. Ažurira LiteLLM default config za Stage 2 batch runs:
   ```
   thinking: true (ili ekvivalent parameter naziv u harness-u)
   max_tokens: 64000
   model: qwen3.6-35b-a3b-via-openrouter
   ```
2. Verifikuje da C2 i C3 harness koristi taj config eksplicitno, ne nasleđeno iz drugog lokala.
3. Smoke test 1 poziv. Log cost, latency, reasoning_content size.
4. Posti exit ping u `sessions/2026-04-XX-sprint-11-b1-config-applied.md`.

B1 CLOSE gate za Track B.

---

## 8. Anti-pattern note

Stage 2 ne menja config tokom run-a. Ako C3 faila sa 3 attempts na `on/64K`, HARD STOP i PM review — ne automatska reformulacija na `off/16K` sredinom sprinta (anti-pattern #4 iz Workflow Reality Check + re-run policy iz `project_preflight_gate.md`).

Thinking=off je legitimana contingency samo ako PM retrospective posle Sprint 11 ili Sprint 12 full-run-a identifikuje specifičan shape gde thinking=on sistematski ne daje lift. Do tada — config je LOCKED na `on/64K`.

---

## 9. Related

- `strategy/2026-04-22-stage-2-qwen-config-ratification-memo.md` — source memo (5 safe configs side-by-side)
- `sessions/2026-04-22-sprint-10-task-1-1-exit.md` — Task 1.1 stability matrix PASS, 5 safe configs
- `decisions/2026-04-22-sprint-11-scope-locked.md` — Sprint 11 scope authority
- `briefs/2026-04-22-cc-sprint-11-kickoff.md` — CC-1 execution brief (B1 task opis, dobija reasoning_content add-on)
- `decisions/2026-04-20-preflight-stage2-4cell-amendment.md` — 4-cell ablation struktura
- `.auto-memory/project_target_model_qwen_35b.md` — Qwen3.6-35B-A3B kanonski engine
- `.auto-memory/project_preflight_gate.md` — 3-stage gate struktura
- `.auto-memory/project_h_audit_1_not_implemented.md` — turnId implementacija context (reasoning_content handling extension)

---

**Stage 2 primary config LOCKED na `thinking=on, max_tokens=64000`. CC-1 Task B1 unblocked.**
