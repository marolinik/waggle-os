# Sprint 11 Scope — LOCKED (Pre-flight Readiness Sprint)

**Datum:** 2026-04-22
**Ratified by:** Marko (2026-04-22, post Sprint 10 full-close + PR #2 ready)
**Author:** PM
**Supersedes:** `strategy/2026-04-22-sprint-11-kickoff-memo.md` (DRAFT, judge-methodology axis framing)
**Status:** LOCKED — CC-1 kickoff brief issued under this scope

---

## 1. Scope statement

Sprint 11 je **Pre-flight Readiness Sprint**. Jedini exit kriterijum je **green-light autorizacija za H-42a/b LoCoMo benchmark execution** ($1500-2600 envelope, documented u `project_preflight_gate.md`). Sprint 11 **ne izvršava H-42a/b**. Izvršenje benchmarka je Sprint 12 scope, condicionovano Sprint 11 full-close verdiktom.

Readiness se definiše kao zbir tri track-a — svaki mora CLOSE da bi green-light bio legitiman. Delimični close = no-go, bez izuzetaka.

---

## 2. Track struktura

### Track A — Audit-grade traceability (H-AUDIT-1 + H-AUDIT-2)

**A1 — H-AUDIT-1 design doc (gate ispred implementation-a).** CC-1 isporučuje 1-page design doc za turnId propagaciju (UUID v4 generisan na orchestrator entry, threaded kroz `cognify.ts`, `tools.ts`, `combined-retrieval.ts`, `prompt-assembler.ts`, `agent-loop`), wired u existing trace store u `chat.ts`. Design doc mora pokrivati: generation point, propagacioni surface (grep target ≥6 hits za `turnId`), persistence format, test scenario (reconstruct full turn graph from single turnId). **PM ratifikaciona gate-a pre implementation start-a.**

**A2 — H-AUDIT-1 implementation.** Posle A1 ratifikacije. Acceptance: `grep -n "turnId" packages/**/*.ts` vraća ≥6 hits u 5+ različitih fajlova; unit test reconstruct-uje full turn graph iz single turnId-a; zero regresija na postojećim suite-ovima; tsc clean.

**A3 — H-AUDIT-2 bench-spec resolution.** 30-min call PM + Marko oko odluke "wall-clock vs recall correctness only" (per `project_audit_findings.md` Must-Fix pre Track 2). Ishod dictatje Cognify O(E²) timing metodologiju za Stage 2. Deliverable: `decisions/2026-04-XX-bench-spec-wall-clock-resolution.md`.

### Track B — Methodology locks (Stage 2 config + bolt-on A + bolt-on C + bolt-on D)

**B1 — Stage 2 Qwen config ratifikacija.** PM dostavlja `strategy/2026-04-22-stage-2-qwen-config-ratification-memo.md` sa 5 safe configs iz Task 1.1 live run-a side-by-side, tradeoff tabelom, i PM preporukom (preliminary: `thinking=off, max_tokens=16000`). Marko ratifikuje; decision dokument se LOCK-uje kao `decisions/2026-04-XX-stage-2-primary-config-locked.md`.

**B2 — Tie-break policy lock (bolt-on A iz deprecated memo-a).** Preneseno iz superseded kickoff memo-a. PM preporuka ostaje Opcija 3 (Sonnet 4.6 kao fourth vendor) sa Opcija 2 fallback (PM escalation na 1-1-2 quadri-vendor split). CC-1 implementira u `packages/server/src/benchmarks/judge/ensemble-tiebreak.ts` + 4 unit testa (1-1-1, 1-1-2, 2-1-1, 3-0). Decision dokument: `decisions/2026-04-XX-tie-break-policy-locked.md`.

**B3 — Opus 4.6 route audit (bolt-on C iz deprecated memo-a).** Preneseno. CC-1 grep-uje `packages/server/**` i `packages/cli/**` za Opus model string reference, klasifikuje dated snapshot vs floating alias, migrira (b) i (c) reference na dated ako treba, LOCK-uje naming konvenciju u `docs/BENCHMARK-INFRASTRUCTURE.md`. Deliverable: `docs/reports/opus-4-6-route-audit-2026-04-XX.md` + `decisions/2026-04-XX-model-route-naming-locked.md`.

**B4 — Stage 2 kickoff memo framing (bolt-on D iz deprecated memo-a).** Preneseno. PM draft Stage 2 kickoff memo sa 4-nedeljnim planom (Week 1 Qwen3.6 × LoCoMo, Week 2 Gemma probe, Week 3 three-model comparison, Week 4 failure mode analysis + publishable results draft). Deliverable: `strategy/2026-04-XX-stage-2-kickoff-memo.md`. Ne locks Stage 2 execution autonomy — postavlja scope + exit criteria, ne izmenjuje pre-registered LoCoMo thresholds.

### Track C — Pre-flight gate execution (Stage 0 → Stage 1 → Stage 2 4-cell mini)

**C1 — Stage 0 verifikacija.** Stage 0 je već CLOSED per memory; CC-1 verifikuje state, link artifacts, potvrđuje da nije regredirao. Ako regredirao → re-run ~$5.

**C2 — Stage 1 mikro-eval.** Per `project_preflight_gate.md`, Stage 1 $5-10, kratka eval baseline. Izvršava CC-1 posle B1 (config ratifikovan) + B2 (tie-break LOCKED) + A2 (turnId landed).

**C3 — Stage 2 4-cell mini.** 50 pitanja, fiksni seed=42, four-cell ablation (raw / memory-only / evolve-only / full-stack), Sonnet judge. Pass kriterijum: full-stack ≥85% recall + ordinal consistency (full ≥ memory, full ≥ evolve, full > raw sa delta ≥10pp, bar jedan layer > raw). Budget $67-134. Re-run policy: max 3 attempts, sample curation samo za legitimate scope gap ≤5 pitanja.

---

## 3. Explicit deferral: bolt-on B (judge prompt refinement trigger matrix)

Bolt-on B iz superseded memo-a (Instance 10 temporal-qualifier trigger matrix) **premešten u Sprint 12**. Razlog: Instance 10 je single case od 14; trigger matrix zahteva ≥3 instances da bi prompt refinement bio triggered. Ova osa ne blokuje H-42a/b benchmark — interpretivni disagreement logging postoji kroz postojeću ensemble observability. Sprint 12 pokreće ovaj rad ako Stage 2 main run donese dodatne interpretivni divergence signale.

---

## 4. Sprint 11 exit criteria (hard gates)

Sprint 11 CLOSES kad **svih 10** od sledećih:

1. A1 CLOSED — H-AUDIT-1 design doc ratifikovan
2. A2 CLOSED — turnId landed, grep ≥6 hits, tests green
3. A3 CLOSED — bench-spec decision LOCKED
4. B1 CLOSED — Stage 2 config LOCKED
5. B2 CLOSED — tie-break policy LOCKED + implementovana + tests green
6. B3 CLOSED — Opus 4.6 route audit report + naming decision LOCKED
7. B4 CLOSED — Stage 2 kickoff memo draft ratifikovan
8. C1 CLOSED — Stage 0 verifikacija
9. C2 CLOSED — Stage 1 mikro-eval PASS
10. C3 CLOSED — Stage 2 4-cell mini PASS sa ordinal consistency

+ Sprint 11 close-out report + origin/main push.

**Green-light verdikt za H-42a/b izdaje PM kad i samo kad svih 10 CLOSED.**

---

## 5. Sprint 11 budget envelope

| Track | Line | Budget |
|---|---|---|
| A | A1 design doc | $0 (markdown) |
| A | A2 implementation | ≤$0.10 (unit tests) |
| A | A3 bench-spec call | $0 (call + markdown) |
| B | B1 config memo | $0 (PM markdown) |
| B | B2 tie-break impl + tests | ≤$0.20 |
| B | B3 route audit | ≤$0.10 |
| B | B4 kickoff memo draft | $0 |
| C | C1 Stage 0 verify | $0 (verify only) ili $5 (re-run ako regredirao) |
| C | C2 Stage 1 mikro-eval | $5-10 |
| C | C3 Stage 2 4-cell mini | $67-134 |

**Sprint 11 ceiling:** ~$150 (absorbs Stage 0 re-run ako triggered). Sprint 10+11 kumulativno projected: $2.28 + $150 = ~$152, unutar ukupnog benchmark prep budget envelope-a pre Stage 2 full-run.

---

## 6. Sprint 11 duration estimate

| Track | Estimate |
|---|---|
| A1 + A2 + A3 | 1-1.5 dana (design doc + implementation + call + markdown) |
| B1 + B2 + B3 + B4 | 1-1.5 dana CC-1 + ~4h PM iteration |
| C1 + C2 + C3 | 1-1.5 dana (C3 je najteže wall-clock stavka) |

**Ukupno:** 4-5 radnih dana realno. Parallelizovano gde tracks ne dele resurse. Track C3 je rep-ograničenje jer čeka A2 (turnId), B1 (config), B2 (tie-break).

---

## 7. Sekvenciranje i blocking graf

```
A1 design doc → PM ratify → A2 implementation ─┐
                                                │
B1 config memo → Marko ratify ─────────────────┼→ C2 Stage 1 mikro-eval
                                                │
B2 tie-break impl ─────────────────────────────┘
                                                         │
                                                         ↓
                                                   C3 Stage 2 4-cell mini
                                                         │
                                                         ↓
                                              Sprint 11 full-close
                                                         │
                                                         ↓
                                               Green-light H-42a/b

A3 bench-spec ──┐
                ├→ Sprint 11 exit gate (informational, ne blokira C3)
B3 route audit ─┤
B4 kickoff memo ┘
```

A3, B3, B4 mogu da se izvrše paralelno sa bilo kojim tackom, ne blokiraju C3.

C1 se izvrši kao prvi krak Track C, bez ikakvih blocker-a.

---

## 8. Anti-pattern lock

Ispod stoje ograničenja koja Sprint 11 poštuje kroz sve track-ove:

- **No post-hoc ground truth reformulation** (Workflow Reality Check anti-pattern #4) — Instance 9 Option C već LOCKED, Instance 10 interpretivni case ne trigger-uje GT izmenu.
- **No retry-and-hope policy** — C3 max 3 attempts, sample curation samo na legitimate scope gap ≤5 pitanja, dokumentovano.
- **No scope creep u Sprint 11** — bilo koja nova stavka zahteva explicit PM ratifikaciju novim decision dokumentom.
- **No H-42a/b execution u Sprint 11** — benchmark izvršenje je Sprint 12 scope. Sprint 11 stane na green-light verdikt.

---

## 9. Rollback klauzule

- **Ako A2 ne CLOSE u 1.5 dana** → PM eskalira, razmatra scope cut (H-AUDIT-2 defer ka Sprint 12), ali A1+A2 MORA landati pre green-light-a.
- **Ako C3 faila 3 attempt-a** → HARD STOP, Sprint 11 ne zatvara se. PM review utvrđuje da li je gap systemic (engine problem) ili sample-specific (legitimate scope gap ≤5 pitanja) pre bilo kakvog remediation plana.
- **Ako B1 Stage 2 config predlog ne prođe Marko ratifikaciju** → PM iteracija memo-a sa novim preporukom; C2/C3 čekaju.

---

## 10. Related

- `strategy/2026-04-22-sprint-11-kickoff-memo.md` — **SUPERSEDED** by ovom odlukom; gets header notice, ostaje u repu kao audit trail
- `strategy/2026-04-22-stage-2-qwen-config-ratification-memo.md` — B1 deliverable (paired with ovom odlukom)
- `briefs/2026-04-22-cc-sprint-11-kickoff.md` — CC-1 execution brief (paired)
- `sessions/2026-04-22-sprint-10-task-1-1-exit.md` — Task 1.1 PASS verdict i safe config pool
- `.auto-memory/project_preflight_gate.md` — 3-stage pre-flight gate struktura
- `.auto-memory/project_audit_findings.md` — H-AUDIT-1 + H-AUDIT-2 Must-Fix
- `.auto-memory/project_h_audit_1_not_implemented.md` — turnId je implementation, ne verification
- `.auto-memory/project_sota_benchmark_governance.md` — governance framework za green-light kriterijume
- `.auto-memory/project_locked_2026_04_20_benchmark_gemma_cc.md` — 7 obligations framework

---

**Sprint 11 scope LOCKED. CC-1 kickoff brief ratified under ovim scope-om. Sprint 11 kick-off autorizovan čim Sprint 10 full-close push landuje.**
