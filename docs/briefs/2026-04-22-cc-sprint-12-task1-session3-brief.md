# CC Brief — Sprint 12 Task 1 Session 3

**Datum:** 2026-04-22 PM (post-Session-2 + B2 LOCK remap close)
**Sprint:** 12 · Task 1 (Infra-build) · **Session 3 — final substrate close**
**Author:** PM (Marko Marković)
**Authority chain:** Marko ratification → Session 2 exit ping (`fa4cbd6` pushed) → ovaj brief
**Pre-Session-3 git state:** `origin/main` na 4 commita dalje od Session 1 baseline-a (`620f018`):
- `fa4cbd6` B2 LOCK alignment — judge roles remap
- `a6e4be9` B3 addendum § 4/§ 5 — per-row pinning
- `b7e52fc` Blocker #4 — judge model registry
- `8466eaf` Blocker #3 — pre-registration CLI + emitter

**Session 3 LLM spend ceiling:** $0.00 (čisto local TypeScript + statistics implementacija, isto kao Session 1 i 2)
**Session 3 wall-clock estimate:** 8-11h (3 sub-deliverables, 3 commits + 1 integration commit, smoke test execution + exit ping)

---

## 0. TL;DR

Session 3 zatvara preostala tri substrate blockera za C3 mikro-eval kickoff + Task 1 closure gate:

- **Blocker #5** — Statistics module: Fleiss' κ (pre-tie-break vote matrix), Wilson score 95% CI, conversation-level cluster-bootstrap 95% CI (10 000 iterations, seed 42). Per-cell i aggregate reporting.
- **Blocker #6** — Failure taxonomy implementacija: hybrid F1–F6 + null + F-other sa mandatory `rationale` field (≥10-word free text enforcement). Judge rubric update sa verbatim taxonomy + detection of F-other rate >10% triggering taxonomy review flag.
- **Smoke test suite** — End-to-end 10-instance dry-run (LoCoMo test-set subset) kroz kompletnu Session 1+2+3 substrate pipeline: pre-registration emit → judge ensemble run → tie-break resolution → κ compute → Wilson + bootstrap CIs → failure-code distribution → aggregate JSON. Verifikuje substrate readiness pre pravog Stage 2 mini (C3) kickoff-a.

Posle Session 3: Task 1 (Infra-build) **FULLY CLOSED**, substrate spreman za Task 2 (Stage 2 mini C3 run). Session 3 nema runtime LLM calls — smoke test koristi deterministic mock judge responses (fixtures) da izbegne žrtvovanje budžeta na dry-run.

---

## 1. Sources of truth (čitati pre kodiranja)

| Doc | Path | Why |
|---|---|---|
| A3 LOCK v1 (bench-spec) | `decisions/2026-04-22-bench-spec-locked.md` | §2 threshold tiering, §4 κ monitoring, §6 failure taxonomy, §7 JSONL schema |
| A3 LOCK manifest | `decisions/2026-04-22-bench-spec-locked.manifest.yaml` | Payload schema za `manifest_hash` input |
| B3 LOCK addendum | `decisions/2026-04-22-b3-lock-dashscope-addendum.md` | Pinning surface payload fields (pre-Session-2 legacy, now live) |
| Session 2 exit ping | `sessions/2026-04-22-cc-sprint-12-task1-session2-exit.md` | Session 2 deliverables + B2 remap close (ako exit ping fajl ne postoji u ovom imenu, traži najnoviji Session 2 sessions/* fajl) |
| Session 2 brief | `briefs/2026-04-22-cc-sprint-12-task1-session2-brief.md` | Brief format precedent + surface contracts za Blocker #3/#4/B3 addendum |
| B2 LOCK remap brief | `briefs/2026-04-22-cc-sprint-12-task1-judge-role-remap.md` | `JudgeRole` enum extension sa `reserve` — već merged u `fa4cbd6` |
| Sprint 12 scope draft | `briefs/2026-04-22-sprint-12-scope-draft.md` § Task 1 § 3 | Blocker dependency DAG + Sprint-level context |
| Tie-break policy LOCK | `decisions/2026-04-22-tie-break-policy-locked.md` | Grok 4.20 `reserve` tie-break activation rules (relevant za κ computation: κ se računa nad **pre-tie-break** vote matrix) |

Ako bilo koji dokument ima nejasnoću za Session 3 scope, **stop i traži PM clarifikaciju pre kodiranja** — ne improvizuj.

---

## 2. Scope u + out

### 2.1 IN-scope (3 sub-deliverables, 3 commits + 1 integration commit)

---

**Sub-deliverable A — Blocker #5 — Statistics module**

Cilj: jedan central statistics module koji proizvodi tri numeričke vrednosti potrebne za Stage 2 exit ping-ove i aggregate JSON:

1. **Fleiss' κ** nad pre-tie-break vote matrix-om tri primary judge-a (Opus 4.7, GPT-5.4, Gemini 3.1). Ulaz: `VoteMatrix` struktura sa N items × 3 judges × K categories (K je broj failure-code kategorija uključujući null; za binary correctness check K=2). Izlaz: `{ kappa: number, n_items: number, n_judges: number, n_categories: number, category_marginals: number[] }`.

2. **Wilson score 95% CI** nad binary correctness rate-om. Ulaz: `{ successes: number, trials: number, confidence: 0.95 }`. Izlaz: `{ point_estimate: number, ci_lower: number, ci_upper: number, half_width: number }`. Formula standardna — ne hand-roll-uj, koristi explicit Wilson formulu:

```
p̂ = successes / trials
z = 1.959964  // two-sided 95%
denom = 1 + z²/n
center = (p̂ + z²/(2n)) / denom
half = z * sqrt(p̂(1-p̂)/n + z²/(4n²)) / denom
ci_lower = center - half
ci_upper = center + half
```

3. **Conversation-level cluster-bootstrap 95% CI** nad binary correctness rate-om gde cluster = conversation_id. Ulaz: `{ rows: CorrectnessRow[], n_bootstrap: 10000, seed: 42, confidence: 0.95 }` gde svaki row ima `{ conversation_id, correct: 0 | 1 }`. Izlaz: `{ point_estimate: number, ci_lower: number, ci_upper: number, n_bootstrap: number, seed: number }`.

   Bootstrap protokol: sample conversations WITH replacement (ne instances). Za svaki bootstrap iteration (1 od 10 000), rekonstruiši mean correctness rate iz resampled conversation set-a. Uzmi 2.5th i 97.5th percentile iz distribution-a kao CI bounds. Seed-uj PRNG deterministički (seed=42) tako da rerun istog ulaza daje isti izlaz (property test).

Files to create:

- `benchmarks/harness/src/stats/fleiss-kappa.ts` (NEW). Single export: `computeFleissKappa(voteMatrix: VoteMatrix): FleissKappaResult`. Include JSDoc link na Fleiss (1971) paper + numerical note da za K=2 case ovo reducira na tradicionalni agreement measure.
- `benchmarks/harness/src/stats/wilson-ci.ts` (NEW). Single export: `computeWilsonCI(input: WilsonInput): WilsonResult`. Include formula reference comment gore opisanu.
- `benchmarks/harness/src/stats/cluster-bootstrap.ts` (NEW). Single export: `computeClusterBootstrapCI(input: BootstrapInput): BootstrapResult`. Koristi `seedrandom` paket ako već postoji u repo-u, inače custom Mulberry32 PRNG implementacija (jednostavnija nego pull-in new dep-a; proveri `pnpm list seedrandom` pre dodavanja).
- `benchmarks/harness/src/stats/index.ts` (NEW). Re-export svih tri funkcija + shared types `VoteMatrix`, `WilsonInput`, `BootstrapInput`.
- `benchmarks/harness/tests/stats/fleiss-kappa.test.ts` (NEW). Minimum 8 tests: K=2 case redukcija, K=6 (F1-F6 taxonomy) happy path, perfect agreement (κ=1.0), zero agreement baseline, tie-break ignored (pre-tie-break matrix only), NaN guard za empty input, reject za mismatch judge count, reject za mismatch category count.
- `benchmarks/harness/tests/stats/wilson-ci.test.ts` (NEW). Minimum 6 tests: p̂=0.5 at n=100 matches published tabular value, p̂=1.0 edge (ci_upper=1.0, ci_lower<1.0), p̂=0.0 edge (mirror), p̂=0.916 at n=1540 (expected half-width ~0.85pp per A3 LOCK §5), monotonicity (n↑ → half_width↓), rejects n≤0.
- `benchmarks/harness/tests/stats/cluster-bootstrap.test.ts` (NEW). Minimum 8 tests: deterministic re-run (same input + seed → same output), 10 000 iterations default, seed=42 default, reject za empty rows, property: CI ⊇ point estimate, property: ci_lower ≤ ci_upper, conversation-level grouping (verify clusters of size>1 affect CI vs Wilson on same data), NaN guard.

**Surface za integration:** aggregate JSON writer (Session 2 substrate) će ove funkcije pozvati pre pisanja `qwen-aggregate.json` (po A3 LOCK §7). U Session 3 scope-u, **samo eksportujemo surface** — integracija ide u Sub-deliverable C (smoke test suite) i u Task 2 (pravi Stage 2 mini run).

Commit poruka (predlog): `feat(stats): Sprint 12 Task 1 Blocker #5 — Fleiss κ + Wilson CI + cluster-bootstrap stats module`.

---

**Sub-deliverable B — Blocker #6 — Failure taxonomy implementacija**

Cilj: (1) TypeScript enum + type za 8-value failure code space (null + F1 + F2 + F3 + F4 + F5 + F6 + F_other); (2) judge rubric copy block koji sadrži verbatim F1–F6 definicije i F_other escape clause; (3) validator koji enforcira da F_other entries imaju non-empty `rationale` sa ≥10 reči; (4) aggregate helper koji computa failure-code distribution + flag-uje F_other rate >10% za v2 taxonomy review.

Files to create:

- `benchmarks/harness/src/failure-taxonomy/codes.ts` (NEW). Exports:
  ```ts
  export type FailureCode = null | 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6' | 'F_other';
  export const FAILURE_CODES = ['F1','F2','F3','F4','F5','F6','F_other'] as const;
  export const FAILURE_CODE_DEFINITIONS: Record<Exclude<FailureCode, null>, string> = { ... };  // verbatim from A3 LOCK §6
  ```
- `benchmarks/harness/src/failure-taxonomy/rubric.ts` (NEW). Single export: `buildJudgeRubricBlock(): string`. Vraća multi-line string sa verbatim F1–F6 definicijama (copy-paste iz `decisions/2026-04-22-bench-spec-locked.md` §6) plus trailing instruction "If no category fits, select F-other and provide ≥10-word rationale explaining the failure." Plus single-line taxonomy version tag `F1-F6+other v1` (po A3 LOCK §7 field 14). Rubric se mora renderati deterministički — isti string svaki put; input nema parameter-a.
- `benchmarks/harness/src/failure-taxonomy/validator.ts` (NEW). Single export: `validateFailureCodeEntry(entry: { failure_code, rationale? }): ValidationResult`. Pravila:
  - `failure_code === null` → `rationale` must be null/undefined; reject ako postoji.
  - `failure_code` in F1..F6 → `rationale` optional; ako postoji, no length constraint.
  - `failure_code === 'F_other'` → `rationale` mandatory, must be non-empty string, must have ≥10 tokens (split on whitespace, filter empty); reject otherwise with explicit error code `F_other_rationale_too_short` ili `F_other_rationale_missing`.
- `benchmarks/harness/src/failure-taxonomy/aggregate.ts` (NEW). Single export: `computeFailureDistribution(rows: FailureRow[]): FailureDistribution`. Output: `{ counts: Record<FailureCode, number>, total: number, f_other_rate: number, f_other_review_flag: boolean, f_other_rationales_sample: string[] }`. `f_other_review_flag` je `true` ako `f_other_rate > 0.10`. Sample je prvih 10 F_other rationales za manual PM review u exit ping-u.
- `benchmarks/harness/src/failure-taxonomy/index.ts` (NEW). Re-export svih above + shared types.
- `benchmarks/harness/tests/failure-taxonomy/codes.test.ts` (NEW). 4 tests: FAILURE_CODES length=7, all definitions present, FailureCode type compiles, no duplicate codes.
- `benchmarks/harness/tests/failure-taxonomy/rubric.test.ts` (NEW). 4 tests: block contains verbatim "F1 — contradicts-ground-truth", block contains "F6 — format-violation", block contains "F-other" escape clause, block contains taxonomy version tag `F1-F6+other v1`.
- `benchmarks/harness/tests/failure-taxonomy/validator.test.ts` (NEW). 10 tests: null code + null rationale passes, null code + non-null rationale rejects, F1 + no rationale passes, F_other + 15-word rationale passes, F_other + 5-word rationale rejects (`F_other_rationale_too_short`), F_other + null rationale rejects (`F_other_rationale_missing`), F_other + whitespace-only rationale rejects, F_other + exactly-10-word rationale passes (boundary), invalid code enum rejects, F_other + newline-separated 10-word rationale passes (tokenization handles whitespace broadly).
- `benchmarks/harness/tests/failure-taxonomy/aggregate.test.ts` (NEW). 6 tests: counts sum equals total, f_other_rate computation correct, review_flag at 11% triggers, review_flag at 10% does NOT trigger (strict greater-than), sample is first 10 entries, zero-F_other input gives empty sample.

**Judge rubric integration note:** Session 3 ne integriše rubric u judge prompt yet. Sub-deliverable B samo exports `buildJudgeRubricBlock()`. Judge prompt template update ide u Task 2 (Stage 2 mini) gde se prompt actually sastavlja i šalje LLM-u. Ovde garantujemo samo da rubric block exists, deterministic je, i test coverage odgovara A3 LOCK §6 taxonomy definiciji.

Commit poruka (predlog): `feat(taxonomy): Sprint 12 Task 1 Blocker #6 — F1-F6+other failure taxonomy + rubric + validator`.

---

**Sub-deliverable C — Smoke test suite**

Cilj: 10-instance end-to-end dry-run koji protežuje ceo Session 1+2+3 substrate path bez real LLM calls. Smoke test je **offline**, koristi deterministic mock judge responses (fixtures) da simulira Stage 2 mini behavior. Exit criterion: smoke test PASS = Task 1 FULLY CLOSED.

Files to create:

- `benchmarks/harness/tests/smoke/fixtures/mock-judge-responses.json` (NEW). 10 instance × 3 judges × (correctness + failure_code + rationale ako F_other) fixture data. Ručno konstruisani tako da:
  - Barem 7 od 10 su "correct" (correctness=1, failure_code=null) — verifikuje Wilson CI računa nešto blizu p̂=0.7 sa widim CI-em at n=10.
  - 1 instanca je F1 (contradicts-ground-truth) single-judge, druga dva judge-a correct → tie-break activates Grok `reserve`, testira tie-break-activation path.
  - 1 instanca je F_other sa valid ≥10-word rationale → testira validator happy path + aggregate sample capture.
  - 1 instanca je F6 (format-violation) unanimous 3 judges → testira unanimous non-null failure case.
  - Judge vote matrix raznolik tako da Fleiss κ ne bude ni 1.0 ni ~0 — target range [0.6, 0.85] za smoke run (očekivano).
- `benchmarks/harness/tests/smoke/fixtures/mock-locomo-instances.json` (NEW). 10 minimal LoCoMo-shaped instances (ili iz real LoCoMo test set ako je repo-checked-in dataset file dostupan; verify pre nego što sintetišeš syntetic data). Svaka instanca ima `{ instance_id, conversation_id, question, reference_answer }`. Conversation_id distribution: 4 conversations × 2-3 instances each, da cluster-bootstrap ima realan cluster structure.
- `benchmarks/harness/tests/smoke/smoke-run.test.ts` (NEW). Integration test koji:
  1. Load-uje `mock-locomo-instances.json` i `mock-judge-responses.json`.
  2. Za svaku instancu, simulira `runOne()` logic bez real LLM calls — koristi mock judge responses direktno kao da su vraćene iz pravog judge call-a.
  3. Pokreće tie-break resolution logiku (per `decisions/2026-04-22-tie-break-policy-locked.md`) na svim instancama, emit-uje `JudgeRow` entries.
  4. Generiše JSONL output u `benchmarks/harness/tests/smoke/outputs/smoke-run-{timestamp}.jsonl` (gitignored timestamped path — ili koristi in-memory buffer bez disk write-a, na CC discretion).
  5. Pokreće Fleiss κ nad pre-tie-break vote matrix — assert κ ∈ [0.5, 0.95] i assert da rezultat nije NaN.
  6. Pokreće Wilson + cluster-bootstrap CIs nad post-tie-break correctness — assert da point_estimate ∈ [0.5, 0.9] i oba CI-a ⊇ point estimate.
  7. Pokreće failure distribution aggregation — assert sum equals total (10), assert F_other sample has exactly 1 entry, assert review_flag nije triggered (1/10 = 10% ≯ 10%, strict greater-than semantic).
  8. Generiše aggregate JSON u `benchmarks/harness/tests/smoke/outputs/smoke-aggregate.json` (in-memory je OK; path samo za consistency sa A3 LOCK §7 structure).
  9. Emit-uje single pino info event `bench.smoke.completed` sa payload: `{ n_instances, kappa, wilson_ci, bootstrap_ci, failure_dist, f_other_review_flag, duration_ms }`.

Smoke test mora biti deterministic — rerun istog fixtures mora producirati bit-identical aggregate JSON (modulo timestamp field ako postoji). Test assertion na bit-identical je nice-to-have ali ne-blokerski; hash-compare aggregate objekta posle `JSON.stringify(obj, Object.keys(obj).sort())` je dovoljno.

- `benchmarks/harness/tests/smoke/outputs/.gitignore` (NEW). Single line: `*` (ignore everything in outputs dir osim `.gitignore` fajla samog).

Commit poruka (predlog): `test(smoke): Sprint 12 Task 1 Sub-deliverable C — 10-instance smoke suite + Blocker #5/#6 integration`.

---

### 2.2 OUT-of-scope (EKSPLICITNO)

- **Real LLM calls za smoke run.** Smoke test je offline, koristi fixtures. Ako CC misli da fixtures nisu dovoljne za realistic dry-run, pauziraj i traži PM clarifikaciju umesto da trošiš budžet.
- **Stage 2 mini (C3) pravi kickoff.** Task 2 scope, ne Task 1 Session 3.
- **Manifest hash change detection.** Session 1+2 već implementiraju `computeBenchSpecManifestHash()` i emit event; ako se manifest menja posle Session 3 commit-a, to je Task 2 concern (verify pre pravog mini run-a).
- **Judge prompt template update.** Sub-deliverable B samo exports rubric block; integracija u prompt template je Task 2 obligation.
- **CI/CD integration.** Smoke test mora passati lokalno kroz `npm test` — ako postoji CI pipeline koji je već setup-ovan, smoke test će biti pokupljen automatski. Ne konfiguriši novi CI workflow u Session 3 scope-u.
- **Documentation README.** Opcionalni 4. integration commit može dodati kratak `benchmarks/harness/README.md` section o smoke test usage-u, ali to je nice-to-have. Ako se vreme produžuje preko 11h ceiling-a, skip README i ping PM umesto toga.

### 2.3 4. commit — integration polish (OPTIONAL)

Ako sve tri sub-deliverable-a prođu clean u prva 3 commita i preostane >1h wall-clock, opcionalni 4. commit može da sadrži:

- `benchmarks/harness/README.md` section o smoke test usage-u, stats module API-ju, failure taxonomy interface-u.
- Type barrel re-exports na root level: `benchmarks/harness/src/index.ts` re-eksportuje `stats/*` i `failure-taxonomy/*` za cleaner imports iz Task 2 code-a.
- JSDoc polish po modulima ako postoji jasna rupa.

Ako je vreme tight, skip 4. commit; 3-commit close je dovoljan za Task 1 closure.

---

## 3. Dependencies i surface contracts

### 3.1 Stats module surface (konzumira ga aggregate JSON writer u Task 2)

```ts
// benchmarks/harness/src/stats/index.ts
import { VoteMatrix, FleissKappaResult, WilsonInput, WilsonResult, BootstrapInput, BootstrapResult } from './types';
export { computeFleissKappa } from './fleiss-kappa';
export { computeWilsonCI } from './wilson-ci';
export { computeClusterBootstrapCI } from './cluster-bootstrap';
export type { VoteMatrix, FleissKappaResult, WilsonInput, WilsonResult, BootstrapInput, BootstrapResult };
```

### 3.2 Failure taxonomy surface

```ts
// benchmarks/harness/src/failure-taxonomy/index.ts
export { FAILURE_CODES, FAILURE_CODE_DEFINITIONS } from './codes';
export type { FailureCode } from './codes';
export { buildJudgeRubricBlock } from './rubric';
export { validateFailureCodeEntry } from './validator';
export type { ValidationResult } from './validator';
export { computeFailureDistribution } from './aggregate';
export type { FailureRow, FailureDistribution } from './aggregate';
```

### 3.3 JudgeRow schema extension (verify Session 2 već dodao)

Session 2 je trebao da proširi `JudgeRow` interface sa `pinning_surface` + `model_revision_hash` + `carve_out_reason` poljima (B3 addendum § 4/§ 5). Verify u `benchmarks/harness/src/types.ts` pre Session 3 rada — ako polja nisu tu, to je Session 2 leakage i vraća se back na Session 2 scope (neočekivano, flag PM-u).

Session 3 ADDS: `failure_code: FailureCode` i `rationale: string | null` polja na `JudgeRow`. Ova polja već postoje u A3 LOCK §7 JSONL schema-u, ali TypeScript surface možda još nije narrow-ovan na `FailureCode` literal union. Ako `judge_row.failure_code` trenutno ima tip `string | null` umesto `FailureCode`, narrow-uj ga. Ovo je type cascade pattern isti kao remap surprise (Session 2 remap `preregistration.ts` widening).

---

## 4. Verification sequence

Posle svakog commit-a:

```bash
cd benchmarks/harness
npx tsc --noEmit    # type check
npm test            # run full test suite
```

Posle 3. commita (smoke test):

```bash
npm test -- --grep "smoke"   # verify smoke test runs deterministic
# očekivano: 1 PASS, duration <5s (offline, no network)
```

Ciljni test count posle Session 3:

- Pre-Session-3 baseline: 196 tests (138 harness + 58 server).
- Sub-deliverable A dodaje: 8 (fleiss) + 6 (wilson) + 8 (bootstrap) = **22 tests**.
- Sub-deliverable B dodaje: 4 (codes) + 4 (rubric) + 10 (validator) + 6 (aggregate) = **24 tests**.
- Sub-deliverable C dodaje: ≥1 integration test (smoke-run.test.ts) — realno 3-5 assertions unutar jednog `describe` block-a.

**Target Session 3 exit:** 196 + 22 + 24 + (3-5) = **245-247 tests green**.

Ako broj tests divergira značajno (±10), flag u exit ping-u kao surprise.

---

## 5. Exit ping format (post-Session 3)

Exit ping u `sessions/2026-04-22-cc-sprint-12-task1-session3-exit.md` mora imati:

1. Git state — commits + push status.
2. Test count delta — pre/post + Session 3 contribution.
3. Wall-clock actual vs. brief estimate.
4. $ LLM spend (expected: $0).
5. Smoke test output payload — Fleiss κ value, Wilson CI, bootstrap CI, failure distribution, F_other review flag. Ovo je **hard output** koji PM verifikuje pre Task 1 close ratification.
6. Surprises list sa ACCEPT/HOLD/REMAP predlozima per Session 1/2 precedent.
7. Cumulative ledger ($0.018893 unchanged through Sprint 11 + Sprint 12 Task 1 — verify).
8. Task 1 closure recommendation — YES ako smoke PASS + sva tri sub-deliverable-a green + tsc clean, NO inače (sa explicit blocker list).

---

## 6. Acceptance criteria

- [ ] Blocker #5 commit: `benchmarks/harness/src/stats/*` + tests, +22 tests green, tsc clean
- [ ] Blocker #6 commit: `benchmarks/harness/src/failure-taxonomy/*` + tests, +24 tests green, tsc clean
- [ ] Smoke test commit: `benchmarks/harness/tests/smoke/*` + fixtures, ≥1 integration test green, smoke-run output validated
- [ ] `origin/main` napreduje za 3 (ili 4 sa optional integration) commita od pre-Session-3 baseline-a (`fa4cbd6`)
- [ ] 245+ tests green u cumulative harness suite
- [ ] $0 LLM spend potvrđen u exit ping-u
- [ ] Smoke test aggregate JSON verified PM-side kao substrate-ready signal

---

## 7. Out of scope reminder

- Ne diraj Session 1/2 code osim ako cascade fix nije tehnički neophodan (kao što je remap-ov `preregistration.ts` type widening).
- Ne dodavaj new npm dependencies osim ako ne postoji clean alternativa (ako treba PRNG seed support, proveri postojeće — `@waggle/core` možda već ima util).
- Ne dupliraj tie-break logic — reuse `resolveTieBreak` iz Session 2 ili wherever it lives.
- Ne konfiguriši CI workflow — out of scope.

---

## 8. Ako naiđeš na nešto neočekivano

Surprise §-policy važi kao u Session 1/2. Kategorije:

- **ACCEPT** — non-blocking, technical necessity, merge sa flag u exit ping-u.
- **HOLD** — blocker, ne committuj dok se ne razreši sa PM-om kroz clarifikaciju.
- **REMAP** — scope change, zahteva odvojenu odluku (kao B2 LOCK remap — 4. Session 2 commit).

Očekivane surprise kategorije za Session 3:

- `JudgeRow.failure_code` već narrow-ovan na FailureCode literal union (ACCEPT ako Session 2 to uradio) ili nije (ACCEPT sa type widening).
- `seedrandom` dep konflikt — ako se dev-dependency već koristi u drugom delu repo-a, confirm pre add-ovanja.
- Real LoCoMo dataset checked-in u repo — ako postoji, možeš koristiti prvih 10 real instances umesto syntetic fixtures za `mock-locomo-instances.json`. ACCEPT ali dokumentuj u fixture file header-u.

---

**Signal PM-u kada se završi:** exit ping sa 3 commit SHA-ova + smoke test aggregate payload + Task 1 closure recommendation (YES/NO).

**Posle Task 1 close:** Task 2 kickoff (Stage 2 mini C3 run) postaje PM next-gate. Marko će ratifikovati Task 1 close pre Task 2 brief-a.
