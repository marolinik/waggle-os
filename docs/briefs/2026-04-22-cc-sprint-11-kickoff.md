# CC-1 Sprint 11 Kickoff Brief — Pre-flight Readiness Sprint

**Sprint ID:** 11
**Sprint type:** Pre-flight Readiness
**Datum brief-a:** 2026-04-22
**Author:** PM (Claude Opus 4.7, Cowork mode)
**For execution:** CC-1 (fresh context, post Sprint 10 full-close + PR #2 merged)
**Scope authority:** `decisions/2026-04-22-sprint-11-scope-locked.md` (LOCKED)
**Stage 2 config authority:** `decisions/2026-04-22-stage-2-primary-config-locked.md` (LOCKED 2026-04-22, `on/64K`)
**Supersedes:** `strategy/2026-04-22-sprint-11-kickoff-memo.md` (DRAFT, judge-methodology axis)
**Update 2026-04-22:** Task A1 reasoning_content handling add-on + Task B1 config LOCKED (on/64K).

---

## 1. Sprint primary axis

Sprint 11 je **Pre-flight Readiness Sprint**. Exit kriterijum = **green-light autorizacija za H-42a/b benchmark** ($1500-2600 Stage 2 full-run). Sprint 11 ne izvršava H-42a/b.

Sve što CC-1 radi kroz Sprint 11 mora da se mapira na 1 od 10 hard gate kriterijuma iz scope lock dokumenta §4. Ako task ne mapuje — CC-1 ne pokreće bez PM ratifikacije.

---

## 2. Sprint 11 entry state (Sprint 10 full-close verifikacija)

Pre nego što Sprint 11 kick-uje, CC-1 verifikuje:

1. Sprint 10 Task 1.1 CLOSED sa PASS verdiktom (5 safe Qwen configs) — `sessions/2026-04-22-sprint-10-task-1-1-exit.md` landed.
2. Sprint 10 Task 1.5 Phase 3 CLOSED i push-ovan na origin (ili eksplicitno deferred ka Sprint 11 kao carry-over sa PM ratifikacijom).
3. PR #2 merged u main (per `sessions/2026-04-22-task-18-closed.md`).
4. Sprint 10 close-out report finalizovan i pushed.

Ako bilo šta od gornjeg nije landed — CC-1 NE kick-uje Sprint 11. Ping PM sa blokerom.

---

## 3. Task lista (10 gate kriterijuma iz scope lock §4)

### Track A — Audit-grade traceability

**Task A1 — H-AUDIT-1 design doc (1 page).** Predaj `docs/plans/H-AUDIT-1-DESIGN-DOC-2026-04-XX.md` sa sledećim sadržajem (i ničim više):

- **turnId generation point:** gde se generiše (orchestrator turn entry) i kako (`crypto.randomUUID()` v4, ne v7, ne custom).
- **Propagation surface:** lista 5+ fajlova u kojima turnId mora biti vidljiv i funkcija/metoda signature-a gde ulazi kao parametar. Očekivani fajlovi iz `project_h_audit_1_not_implemented.md`: `orchestrator.ts`, `cognify.ts`, `tools.ts`, `combined-retrieval.ts`, `prompt-assembler.ts`, `agent-loop` (entry point). Ako se CC-1-ov kodni pregled pokaže da neki od ovih ne postoji sa tim imenom ili da postoje dodatni fajlovi — ažuriraj listu u design doc-u i pomeni razliku.
- **Persistence format:** kako turnId se upisuje u existing trace store u `chat.ts`. Struktura polja, tip, retention pravila ako postoje.
- **Reasoning_content handling (dodato per `decisions/2026-04-22-stage-2-primary-config-locked.md` §5):** Stage 2 config je LOCKED na `thinking=on, max_tokens=64000`, što znači da Qwen response sadrži `reasoning_content` polje izvan finalnog answer payload-a. Design doc mora eksplicitno adresirati tri pravila:
  - **Persistence rule:** gde se `reasoning_content` persista u trace store-u (pod istim turnId u poseban slot `turn.reasoningContent` ili potpuno separatan store). Predloži izbor i razlog.
  - **Retention policy:** koliko dugo se čuva, da li ulazi u audit export-ove, da li se brise posle N dana.
  - **Exclusion rule:** gde NE ulazi (npr. user-facing output log-ovi, public trace viewer-i, MCP response payload-i). Trace reconstruction iz turnId-a mora moći da opciono includuje ili excluduje reasoning_content per caller permission.
- **Test scenario:** unit test koji reconstruct-uje full turn graph iz single turnId-a, uključujući reasoning_content slot kao opcioni payload. Sample code-om opiši test, ne implementiraj još.
- **Acceptance kriterijumi:** grep target (≥6 hits za `turnId` u ≥5 fajlova), zero regresija na postojećim suite-ovima, tsc clean, reasoning_content handling dokumentovan u design doc-u.

**CRITICAL: A1 NE kreće u A2 implementation dok PM ne ratifikuje design doc.** PM ratifikacija gate je tvrd. Ne preempty.

**Budget:** $0 (markdown only).
**Wall-clock estimate:** 1-2h za design doc draft + PM iteration turnaround.

---

**Task A2 — H-AUDIT-1 implementation.** Start SAMO posle A1 PM ratifikacije.

Implementiraj turnId propagaciju per ratifikovani design doc. Acceptance:
- `grep -n "turnId" packages/**/*.ts | wc -l` vraća ≥6.
- Unique fajlovi sa match-om ≥5.
- Novi unit test u existing test suite lokaciji pokazuje reconstruct full turn graph iz single turnId-a.
- `pnpm test` vraća zero regresija.
- `pnpm tsc --noEmit` clean.
- Commit message: `feat(audit): implement H-AUDIT-1 turnId propagation per design doc 2026-04-XX`.

Nakon merge-a, posti exit ping u `sessions/2026-04-XX-sprint-11-h-audit-1-exit.md` sa grep output-om i test log-om.

**Budget cap:** $0.10 (unit test API calls).
**Wall-clock estimate:** 0.5-1 dan.

---

**Task A3 — H-AUDIT-2 bench-spec resolution.**

Ova task zahteva 30-min Marko + PM call (bench-spec odluka "wall-clock vs recall correctness only", per `project_audit_findings.md`). CC-1 ne izvršava task samostalno — CC-1 STANDS BY dok PM ne dostavi `decisions/2026-04-XX-bench-spec-wall-clock-resolution.md`.

Po landing-u decision dokumenta, CC-1 (ako treba) ažurira Stage 2 kickoff memo (B4) da reflektuje bench-spec izbor.

**Budget:** $0.
**Wall-clock estimate:** 0.5 dan (posle Marko+PM call).

---

### Track B — Methodology locks

**Task B1 — Stage 2 Qwen config apply.** (LOCKED 2026-04-22)

Authority: `decisions/2026-04-22-stage-2-primary-config-locked.md` — LOCKED na **`thinking=on, max_tokens=64000`** na route `qwen3.6-35b-a3b-via-openrouter`. Marko je override-ovao PM preporuku (`off/16K`) sa rationale-om iz v05 eval rezultata.

Apply akcija:
- Ažuriraj LiteLLM default config za Stage 2 batch runs:
  ```
  thinking: true (ili ekvivalent parameter name u harness-u)
  max_tokens: 64000
  model: qwen3.6-35b-a3b-via-openrouter
  ```
- Verifikuj da C2 i C3 harness koristi taj config eksplicitno, ne nasleđeno iz drugog lokala.
- Smoke test 1 poziv da se config aktivirao. Log cost, latency, **i reasoning_content size** (polje koje dolazi sa `thinking=on`).
- Exit ping: `sessions/2026-04-XX-sprint-11-b1-config-applied.md` sa cost/latency/reasoning_content size zapisom.

**Anti-pattern lock (iz §8 decision doc-a):** Ako C3 faila sa 3 attempts na `on/64K`, HARD STOP i PM review — NE automatska reformulacija na `off/16K` sredinom sprinta. Thinking=off je legitimana contingency samo posle Sprint 11/12 retrospektive.

**Budget cap:** $0.05 (smoke test).
**Budget impact downstream:** Stage 2 4-cell mini expected ~$8-14 (vs $4-6 za PM preporuku). Cap $134 nepromenjen.
**Wall-clock estimate:** 30 min.

---

**Task B2 — Tie-break policy implementacija.**

Implementiraj per PM preporuku u scope lock §2.B2 (Opcija 3: Sonnet 4.6 kao fourth vendor) sa Opcija 2 fallback (PM escalation na 1-1-2 quadri-vendor split).

- Novi fajl: `packages/server/src/benchmarks/judge/ensemble-tiebreak.ts`.
- Interface: funkcija `resolveTieBreak(votes: Vote[]): TieBreakResult` gde `TieBreakResult = { verdict: string; path: 'majority' | 'quadri-vendor' | 'pm-escalation'; votes: Vote[]; }`.
- 4 unit testa pokrivajući: 1-1-1 (trigger quadri-vendor Sonnet call), 1-1-2 (već majority, no tiebreak), 2-1-1 (majority wins), 3-0 (consensus, no tiebreak).
- Integracija u postojeći ensemble orchestration path.
- Observability: logovi koji path je uzet (majority/quadri/pm-esc) per case.

PM će LOCK-ovati policy kroz `decisions/2026-04-XX-tie-break-policy-locked.md` pre merge-a.

**Budget cap:** $0.20 (Sonnet 4.6 calls u unit testu).
**Wall-clock estimate:** 2-3h.

---

**Task B3 — Opus 4.6 route audit.**

Per superseded memo bolt-on C:

1. `grep -rn "claude-opus\|claude-sonnet-4" packages/server/ packages/cli/` → klasifikuj svaku referenca kao:
   - (a) dated snapshot (npr. `claude-opus-4-6-20251014`, `claude-opus-4-7-20260201`),
   - (b) floating alias (npr. `claude-opus-4-6`, `claude-opus-4-7`),
   - (c) hardcoded mismatch (npr. reference na deprecated model).
2. Za (b) i (c), dokumentuj Why floating je prihvatljiv (npr. dev convenience path) ili migriraj na dated snapshot.
3. LOCK naming convention u `docs/BENCHMARK-INFRASTRUCTURE.md` ili ekvivalent canonical fajl.
4. Trigger-on-first-caller-trip observability verify: postoji li log alert kada floating alias failuje na provider side?

Deliverable: `docs/reports/opus-4-6-route-audit-2026-04-XX.md` + PM izdaje `decisions/2026-04-XX-model-route-naming-locked.md` posle audit review-a.

**Budget cap:** $0.10 (verification test calls).
**Wall-clock estimate:** 1-2h.

---

**Task B4 — Stage 2 kickoff memo draft (saradnja sa PM).**

PM piše prvi draft u `strategy/2026-04-XX-stage-2-kickoff-memo.md` sa 4-nedeljnim planom:
- Week 1: Qwen3.6-35B-A3B × full LoCoMo corpus (500 instances ili full set po local zip-u).
- Week 2: Gemma Week 3 probe comparison (per `decisions/2026-04-20-gemma-week3-probe-locked.md`).
- Week 3: Three-model comparison analysis.
- Week 4: Failure mode distribution + publishable results draft.

CC-1 dodaje harness readiness assessment na kraj memo-a (jednokratno): da li sav tooling za 4-week plan postoji u repo-u, gde su gap-ovi, procenjeni wall-clock za gap closure.

**Budget:** $0.
**Wall-clock estimate:** 1h CC-1 assessment + PM iteracije posebno.

---

### Track C — Pre-flight gate execution

**Task C1 — Stage 0 verifikacija.**

Stage 0 je CLOSED per memory (`project_preflight_gate.md`). CC-1:
- Link postojeće artifacts (stage 0 results).
- Verifikuj da nije regredirao (run poslednji known-good smoke test ako postoji, ili uporedi current build vs Stage 0 artifact hash).
- Ako regredirao → re-run Stage 0 po originalnom scope-u (~$5).

Deliverable: kratak check-in ping u `sessions/2026-04-XX-sprint-11-stage-0-verify.md` sa "still green" ili "regression detected, re-run triggered".

**Budget:** $0 ako green, ~$5 ako re-run.
**Wall-clock estimate:** 15-30 min verify, +30 min ako re-run.

---

**Task C2 — Stage 1 mikro-eval.**

Izvršava SAMO posle:
- A2 CLOSED (turnId landed),
- B1 CLOSED (Qwen config LOCKED),
- B2 CLOSED (tie-break implementovan),
- C1 CLOSED (Stage 0 verified).

Scope: kratka eval baseline per `project_preflight_gate.md` Stage 1 spec. Verifikacija da je engine + methodology stack operativan pre Stage 2 main run-a.

Deliverable: `preflight-results/stage-1-microeval-2026-04-XX.md` sa results tabelom i PASS/HARD STOP verdiktom.

**Budget:** $5-10.
**Wall-clock estimate:** 1-2h.

---

**Task C3 — Stage 2 4-cell mini.**

Izvršava SAMO posle C2 PASS.

Scope per `decisions/2026-04-20-preflight-stage2-4cell-amendment.md`:
- 50 pitanja (fiksni seed=42, pre-registrovan sample).
- 4 cells: raw / memory-only / evolve-only / full-stack.
- Sonnet 4.6 judge.
- Pass kriterijum: full-stack ≥85% recall + ordinal consistency (full ≥ memory, full ≥ evolve, full > raw sa delta ≥10pp, bar jedan layer > raw).
- Re-run policy: max 3 attempts, sample curation samo za legitimate scope gap ≤5 pitanja (dokumentovano).

Deliverable: `preflight-results/stage-2-4cell-mini-2026-04-XX.md` sa 4-cell tabelom, ordinal consistency check-om, i verdiktom.

Ako PASS → ovo je poslednji gate kriterijum; Sprint 11 blizu full-close-a.
Ako HARD STOP (3 attempts faili) → ne zatvaraj Sprint 11. PM review.

**Budget cap:** $134 (per ratifikovani preflight gate amendment).
**Wall-clock estimate:** 3-5h (worst case sa retries).

---

## 4. Sekvenciranje (dependencies)

```
C1 ──────────────────────────┐
                              │
A1 design doc → PM ratify → A2 ──┐
                                  │
B1 ratified ──────────────────────┼→ C2 → C3 → Sprint 11 full-close
                                  │
B2 impl + LOCK ───────────────────┘

A3 (after PM+Marko call) ──────── informational, ne blocks C3
B3 route audit ──────────────── informational, ne blocks C3
B4 kickoff memo draft ────── informational, ne blocks C3
```

CC-1 redosled preporučen:
1. Day 1 AM: Entry state verify + A1 design doc draft (uključuje reasoning_content handling per LOCK) + B1 apply (config je već LOCKED, nema čekanja).
2. Day 1 PM: C1 verify paralelno sa čekanjem na PM A1 ratifikaciju. B1 smoke test push-ovan.
3. Day 2 AM: A2 implementation (posle A1 ratifikacije) + B2 impl start.
4. Day 2 PM: A2 finish + B2 finish + B3 route audit paralelno.
5. Day 3 AM: B2 merge pending LOCK + C2 Stage 1 mikro-eval.
6. Day 3 PM: C3 Stage 2 4-cell mini start.
7. Day 4: C3 finish + Sprint 11 close-out report + push.

A3 (bench-spec) ume da ispadne iz calendar-a ako Marko+PM call nije zakazan do Day 2; to je sledeće za eskalaciju PM-u ne CC-1-u.
B4 (Stage 2 kickoff memo) PM vodi; CC-1 asistira kad memo bude spreman za harness assessment add-on.

---

## 5. Budget summary

| Track | Low | High |
|---|---|---|
| A (A1+A2+A3) | $0 | $0.10 |
| B (B1+B2+B3+B4) | $0.05 | $0.35 |
| C (C1+C2+C3) | $67 | $149 |

**Sprint 11 total ceiling:** ~$150.
**Sprint 10+11 cumulative ceiling:** ~$152 vs $15k Stage 2 full-run envelope. Radikalno unutar granica.

Per-task hard alarm: ako bilo koji pojedinačni task premaši 130% svoje cap vrednosti, CC-1 HARD STOP i PM ping.

---

## 6. Reporting cadence

- **Day 1 EOD:** CC-1 posti `sessions/2026-04-XX-sprint-11-day-1-status.md` sa (a) entry verify summary, (b) A1 draft link, (c) C1 verify outcome.
- **Day 2 EOD:** status ping sa A2 + B2 progress, B3 audit outcome (ako CLOSED).
- **Day 3 EOD:** status ping sa B1 applied, C2 verdikt.
- **Day 4 EOD ili sprint close:** `sessions/2026-04-XX-sprint-11-close.md` sa svih 10 gate kriterijuma check-in tabelom i green-light preporukom.

Svaki exit ping po tasku: `sessions/2026-04-XX-sprint-11-<task-id>-exit.md`.

---

## 7. Anti-patterns (hard ograničenja)

- **Anti-pattern #1:** No H-42a/b execution u Sprint 11. Ako neki signal u Sprint 11 iskače u smeru "hajde odmah da pokrenemo full run", CC-1 stand by i PM ping.
- **Anti-pattern #2:** No scope creep. Task lista iz §3 je exhaustive. Bilo koji dodatak zahteva novi decision dokument potpisan od PM-a.
- **Anti-pattern #3:** No self-merge na PR-ovima vezanim za Sprint 11 deliverables. CC-1 predaje za PM review; PM izdaje merge verdikt.
- **Anti-pattern #4:** No post-hoc reformulation rezultata C3 4-cell mini. Pre-registered thresholds (full ≥85%, ordinal consistency) stoje. Re-run pravilo: max 3, curation ≤5 pitanja na legitimate scope gap, eksplicitno dokumentovano. Ne "hajmo samo da slušamo ovaj cell".
- **Anti-pattern #5:** No turnId implementacija bez A1 PM ratifikacije. Implementation-first → design-doc-second je refused workflow.

---

## 8. Exit criteria check-list (za Sprint 11 close-out report)

Svih 10 mora biti ✅:

1. [ ] A1 CLOSED — H-AUDIT-1 design doc ratifikovan (link)
2. [ ] A2 CLOSED — turnId landed, grep ≥6, tests green (commit SHA + grep output)
3. [ ] A3 CLOSED — bench-spec decision LOCKED (decision dokument link)
4. [ ] B1 CLOSED — Stage 2 config LOCKED (decision dokument link)
5. [ ] B2 CLOSED — tie-break policy LOCKED + implementovan + tests green (commit + decision)
6. [ ] B3 CLOSED — Opus 4.6 route audit + naming decision LOCKED (report + decision)
7. [ ] B4 CLOSED — Stage 2 kickoff memo draft ratifikovan (memo link)
8. [ ] C1 CLOSED — Stage 0 verify outcome (ping link)
9. [ ] C2 CLOSED — Stage 1 mikro-eval PASS (results link)
10. [ ] C3 CLOSED — Stage 2 4-cell mini PASS sa ordinal consistency (results link)

Green-light verdikt za H-42a/b izdaje PM čim svih 10 CLOSED + push.

---

## 9. Related

- `decisions/2026-04-22-sprint-11-scope-locked.md` — scope authority (čitaj prvi)
- `decisions/2026-04-22-stage-2-primary-config-locked.md` — Stage 2 config LOCK (`on/64K`), B1 authority
- `strategy/2026-04-22-stage-2-qwen-config-ratification-memo.md` — B1 input memo (PM preporuka odbijena, Marko izbor ratifikovan)
- `strategy/2026-04-22-sprint-11-kickoff-memo.md` — SUPERSEDED draft (audit trail only, ne izvršavati)
- `sessions/2026-04-22-sprint-10-task-1-1-exit.md` — Qwen safe config pool
- `sessions/2026-04-22-sprint-10-task-1-5-phase-3-ratification.md` — potential carry-over state
- `.auto-memory/project_h_audit_1_not_implemented.md` — turnId implementacija kao ne-verifikacija
- `.auto-memory/project_preflight_gate.md` — 3-stage gate struktura
- `.auto-memory/project_audit_findings.md` — H-AUDIT-1 + H-AUDIT-2 Must-Fix
- `.auto-memory/project_target_model_qwen_35b.md` — kanonski engine

---

**End of Sprint 11 kickoff brief. Awaiting CC-1 entry state verify + A1 design doc draft.**
