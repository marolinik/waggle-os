# CC Brief — Sprint 12 Task 1 Session 2

**Datum:** 2026-04-22 PM (post-Session-1 adjudication)
**Sprint:** 12 · Task 1 (Infra-build) · **Session 2**
**Author:** PM (Marko Marković)
**Authority chain:** Marko ratification → Session 1 adjudication doc → ovaj brief
**Pre-Session-2 git state:** `a75dd25` + `620f018` autorizovani za push (per adjudication § 4)
**Session 2 LLM spend ceiling:** $0.00 (pure local engineering, isto kao Session 1)
**Session 2 wall-clock estimate:** 7-9h (3 commits, 3 sub-deliverables)

---

## 0. TL;DR

Session 2 zatvara tri od preostalih substrate blockera za C3 mikro-eval kickoff: **Blocker #3** (pre-registration CLI surface + pino emitter za `bench.preregistration.manifest_hash`), **Blocker #4** (judge model registry extension sa `pinning_surface` poljima per B3 addendum § 4), i **B3 addendum § 4/§ 5 implementation** (`model_pinning_surface` + `model_pinning_carve_out_reason` + `model_revision_hash` polja u JSONL + manifest payload).

Posle Session 2: ostaju Blocker #5 (Fleiss' κ + Wilson + cluster-bootstrap CI), Blocker #6 (failure taxonomy F1-F6), i smoke test suite — sve tri stavke su Session 3 scope. Task 1 closure gate (smoke test PASS) je Session 3 odgovornost, ne Session 2.

Session 2 nema runtime LLM calls, nema network calls van eventualnog `git push` na kraju sesije, nema dataset modifikacije. Sav rad je TypeScript surface + JSON config + new pino emitter module + unit tests.

---

## 1. Sources of truth (čitati pre kodiranja)

| Doc | Path | Why |
|---|---|---|
| A3 LOCK v1 | `decisions/2026-04-22-bench-spec-locked.md` + `.manifest.yaml` | Pre-registration field set + `manifest_hash` payload schema |
| B3 LOCK addendum | `decisions/2026-04-22-b3-lock-dashscope-addendum.md` | Pinning surface taxonomy + carve-out polje obligation |
| Session 1 exit ping | `sessions/2026-04-22-cc-sprint-12-task1-session1-exit.md` | Session 1 deliverables baseline + canonical SHA `39e415e2…402a5b24` za Blocker #3 manifest hash payload |
| Session 1 adjudication | `sessions/2026-04-22-cc-sprint-12-task1-session1-adjudication.md` | PM ratification + push authorization |
| Session 1 brief | `briefs/2026-04-22-cc-sprint-12-task1-session1-brief.md` | Brief format precedent + Session 1 scope context |
| Sprint 12 scope draft | `briefs/2026-04-22-sprint-12-scope-draft.md` § Task 1 § 3 | Blocker dependency DAG + Sprint-level context |
| C3 substrate gap origin | `sessions/2026-04-22-c3-blocked-substrate-gap.md` | Originalna 6-blocker taxonomy iz koje #3 + #4 derivirani |

Ako bilo koji od tih dokumenata trenutno ima nejasnoću za bilo koji deo Session 2 scope-a, **stop i traži PM clarifikaciju pre kodiranja** — ne improvizuj.

---

## 2. Scope u + out

### 2.1 IN-scope (3 sub-deliverables, 3 commits)

**Sub-deliverable A — Blocker #3 — Pre-registration CLI surface + pino emitter**

Cilj: omogućiti `npm run bench:locomo -- --manifest-hash <sha> --emit-preregistration-event --per-cell <cell> --judge-tiebreak <strategy>` invocation patterns. Emit single pino event `bench.preregistration.manifest_hash` na početku svakog `runOne()` call-a, sa payload-om koji sadrži manifest hash + per-cell + judge-tiebreak izbore + canonical dataset SHA.

Files to touch:

- `benchmarks/harness/src/cli.ts` (or wherever current CLI argv parsing lives — ako ne postoji jedan central file, kreiraj `benchmarks/harness/src/cli.ts` i refactor postojeći `runner.ts` argv block u taj modul). Add 4 new flags + validation.
- `benchmarks/harness/src/preregistration.ts` (NEW). Single export: `emitPreregistrationManifest(payload: PreregistrationManifestPayload): void`. Uses pino logger (existing instance, ne kreiraj novi). Event name: `bench.preregistration.manifest_hash`. Payload schema u § 3.1 ovog brief-a.
- `benchmarks/harness/src/runner.ts`. Pozovi `emitPreregistrationManifest` jednom per `runOne()` call, pre prvog ćelije iteration-a. Payload se konstruiše iz CLI args + canonical dataset version (već dostupan iz Session 1 `getDatasetVersion()`) + bench-spec manifest hash (computed at-runtime preko `crypto.createHash('sha256').update(fs.readFileSync('decisions/2026-04-22-bench-spec-locked.manifest.yaml')).digest('hex')` — ili equivalent helper-a u `manifest-hash.ts` modulu ako želiš da ga ekstraktuješ).
- `benchmarks/harness/src/manifest-hash.ts` (NEW, optional ako `preregistration.ts` postaje preveliki). Single export: `computeBenchSpecManifestHash(): string`. Deterministic SHA-256 over the `.manifest.yaml` bytes.
- `benchmarks/harness/tests/preregistration.test.ts` (NEW). Minimum 8 tests: payload schema valid, pino emit called once per runOne, payload includes canonical dataset SHA, payload includes manifest hash, manifest hash deterministic across reads, CLI flag parsing of `--manifest-hash`, CLI flag parsing of `--per-cell`, CLI flag parsing of `--judge-tiebreak`.
- `benchmarks/harness/tests/cli.test.ts` (NEW or extend existing). Test sve 4 nove flag-ove kroz argv parser + invalid-input rejections.

**Sub-deliverable B — Blocker #4 — Judge model registry extension**

Cilj: Proširiti `config/models.json` (or wherever current judge model registry lives — verify lokaciju kroz `rg "judge.*model" benchmarks/ packages/` pre nego što počneš) sa 4 nova model entry-ja: Opus 4.7, GPT-5.4, Gemini 3.1, Grok 4.20. Svaki entry mora imati polje `pinning_surface` po B3 addendum § 4 taxonomy-ju (`anthropic_immutable` | `floating_alias` | `revision_hash_pinned`) plus `pinning_surface_carve_out_reason` polje (string ili null).

Files to touch:

- `benchmarks/harness/config/models.json` (verify path) ili `packages/server/src/benchmarks/config/models.ts` ako je TS source. Add 4 entries. Update existing Anthropic entries (Opus 4.6, Sonnet 4.6, Haiku 4.5) sa `pinning_surface: "anthropic_immutable"` + `pinning_surface_carve_out_reason: null`.
- `benchmarks/harness/src/types.ts`. Extend `JudgeModelConfig` interface (or equivalent) sa `pinning_surface` + `pinning_surface_carve_out_reason` polja.
- `benchmarks/harness/tests/models-config.test.ts` (NEW). Minimum 6 tests: svi judge model entries imaju `pinning_surface`, valid enum values, Anthropic entries imaju `null` carve-out reason, non-Anthropic entries imaju non-null carve-out reason, no duplicate model_id, JSON schema parse-clean.

Model entry payload skeleton (svaki novi entry):

```json
{
  "model_id": "anthropic/claude-opus-4-7",
  "provider": "anthropic",
  "context_window": 200000,
  "pinning_surface": "anthropic_immutable",
  "pinning_surface_carve_out_reason": null,
  "judge_role": "primary"
}
```

Za non-Anthropic (npr. Gemini):

```json
{
  "model_id": "google/gemini-3.1-pro",
  "provider": "google_via_openrouter",
  "context_window": 1000000,
  "pinning_surface": "floating_alias",
  "pinning_surface_carve_out_reason": "Google does not expose immutable model snapshots; floating alias mandated by B3 addendum § 5",
  "judge_role": "secondary"
}
```

Egzaktni `model_id` slug-ovi: confirm sa OpenRouter ili native provider naming convention pre commit-a. Ako ne možeš da potvrdiš slug bez network call-a, fallback na placeholder slug + komentar koji eksplicitno kaže "PLACEHOLDER — confirm pre Sprint 12 Task 2 kickoff" — ne blocking za Session 2 čišćenje.

**Sub-deliverable C — B3 addendum § 4/§ 5 piggy-back**

Cilj: Per-row `model_pinning_surface` + `model_pinning_carve_out_reason` + `model_revision_hash` polja u svakom `JsonlRecord`-u, plus istovetna polja u manifest payload-u koji ide u `bench.preregistration.manifest_hash` event.

Files to touch:

- `benchmarks/harness/src/types.ts`. Extend `JsonlRecord` interface sa tri optional polja:
  - `model_pinning_surface?: 'anthropic_immutable' | 'floating_alias' | 'revision_hash_pinned'`
  - `model_pinning_carve_out_reason?: string | null`
  - `model_revision_hash?: string | null`
- `benchmarks/harness/src/runner.ts`. Pri konstrukciji svakog `JsonlRecord`, populate tri nova polja iz judge model config registry-ja (lookup `model_id` u `models.json`, copy `pinning_surface` + `pinning_surface_carve_out_reason`, set `model_revision_hash` na `null` osim ako je provider eksplicitno vraća — to je future hook, za Session 3 ili kasnije).
- `benchmarks/harness/src/preregistration.ts` (already touched in Sub-deliverable A). Manifest payload extends sa array svih judge model-a u play-u, sa per-model `pinning_surface` + carve-out reason.
- `benchmarks/harness/tests/jsonl-record-schema.test.ts`. Add 3 tests verifying nova polja u emit-ovanom record-u.
- `benchmarks/harness/tests/preregistration.test.ts` (već u scope iz Sub-deliverable A). Add 2 tests verifying per-judge-model pinning surface ulazi u manifest payload.

### 2.2 OUT-of-scope (NOT in Session 2 — defer to Session 3 or later)

- **Blocker #5 — Fleiss' κ + Wilson + cluster-bootstrap CI** u `metrics.ts`. Ne dirati. Session 3 anchor.
- **Blocker #6 — Failure taxonomy F1-F6 + F-other** u `judge-runner.ts` + JSONL schema extension. Ne dirati. Session 3.
- **Smoke test suite** — 10-instance dry-run kroz full runner invocation shape per C3 brief § 4. Ne pisati. Session 3 closure gate.
- **Bilo kakvi LLM API calls** — bilo runtime, bilo unit-test mock-ovani sa real network. Sve mora biti `nock` ili pure local mock-ovi. $0 LLM spend constraint je hard.
- **Push to remote** — push je PM odgovornost (već autorizovan u adjudication doc § 4). CC izvršava `git push origin main` na kraju Session 2 jedino ako PM eksplicitno potvrdi u closing exchange-u.
- **Doc scrub legacy cell names** (Sprint 13 backlog stavka per adjudication § 3). Ne dirati `03B-SERVER_QUALITY.md`, `BACKLOG-MASTER`, ili druge historical doc-e.
- **`.gitattributes` extension za druge audit artifacts** (Sprint 13 backlog stavka per adjudication § 3). Ne dodavati nove pin-ove.

---

## 3. Schemas + signatures (precision contracts)

### 3.1 `PreregistrationManifestPayload` schema

```typescript
interface PreregistrationManifestPayload {
  // Bench-spec lock
  manifest_hash: string;                      // SHA-256 of decisions/2026-04-22-bench-spec-locked.manifest.yaml bytes
  manifest_path: string;                      // 'decisions/2026-04-22-bench-spec-locked.manifest.yaml'
  manifest_locked_at: string;                 // ISO-8601, copied from manifest yaml

  // Canonical dataset
  dataset_version: string;                    // From getDatasetVersion(), e.g. '39e415e2f3a0fa1bd3cb1804a58d0b440b50d3070b2100698437e4ec402a5b24'
  dataset_path: string;                       // 'benchmarks/data/locomo/locomo-1540.jsonl'
  dataset_instance_count: number;             // 1531

  // CLI choices (from runtime argv)
  per_cell: string[];                         // e.g. ['raw', 'filtered', 'compressed', 'full-context']
  judge_tiebreak: string;                     // e.g. 'majority' | 'arithmetic-mean' | per A3 LOCK § B2
  judge_models: Array<{
    model_id: string;
    provider: string;
    judge_role: 'primary' | 'secondary' | 'tertiary';
    pinning_surface: 'anthropic_immutable' | 'floating_alias' | 'revision_hash_pinned';
    pinning_surface_carve_out_reason: string | null;
  }>;

  // Provenance
  emitted_at: string;                         // ISO-8601 wall-clock at emit time
  runner_version: string;                     // Git short SHA at runtime, fallback 'unknown' ako git ne dostupan
  runner_invocation: {
    argv: string[];                           // process.argv kopija (sanitized — bez API keys)
    cwd: string;                              // process.cwd()
  };
}
```

Pino event signature:

```typescript
logger.info(
  { ...payload, event: 'bench.preregistration.manifest_hash' },
  'Pre-registration manifest hash emitted for benchmark run'
);
```

### 3.2 `JsonlRecord` extensions (Sub-deliverable C)

```typescript
interface JsonlRecord {
  // ... existing fields preserved unchanged
  // ... dataset_version já existe iz Session 1

  // NEW — Sub-deliverable C
  model_pinning_surface?: 'anthropic_immutable' | 'floating_alias' | 'revision_hash_pinned';
  model_pinning_carve_out_reason?: string | null;
  model_revision_hash?: string | null;
}
```

### 3.3 CLI flag parsing surface (Sub-deliverable A)

Add 4 new flags, all optional sa defaults:

| Flag | Type | Default | Description |
|---|---|---|---|
| `--manifest-hash <sha>` | string | computed at-runtime | Allows override za test ili replication runs; default computes from `.manifest.yaml` bytes |
| `--emit-preregistration-event` | boolean | `true` | If `false`, suppresses pino emit (useful za tests) |
| `--per-cell <cell>` | string\[] | `['raw', 'filtered', 'compressed', 'full-context']` | Subset of cells; multi-value (`--per-cell raw --per-cell filtered`) |
| `--judge-tiebreak <strategy>` | string | per A3 LOCK § B2 default | Override za tie-break strategy; validates against A3 LOCK enum |

Flag parsing library: koristi postojeći (verify which — vrlo verovatno `commander` ili `yargs` based on Sprint 11 codebase). Ako ne postoji centralizovani parser, kreiraj minimalni manual argv walker u `cli.ts` — ne uvodi novu dependency bez PM signoff-a.

---

## 4. Acceptance criteria (closure gate per sub-deliverable)

### 4.1 Sub-deliverable A acceptance

- `benchmarks/harness/tests/preregistration.test.ts` — 8/8 pass.
- `benchmarks/harness/tests/cli.test.ts` — sve nove flag tests pass.
- `tsc --noEmit` clean on `benchmarks/harness`.
- Manual smoke: `npm run bench:locomo -- --manifest-hash test123 --per-cell raw --judge-tiebreak majority --emit-preregistration-event` → pino event emitted with payload matching schema § 3.1.
- Single commit: `feat(benchmarks): Sprint 12 Task 1 Blocker #3 — pre-registration CLI surface + manifest_hash emitter`

### 4.2 Sub-deliverable B acceptance

- `benchmarks/harness/tests/models-config.test.ts` — 6/6 pass.
- `tsc --noEmit` clean on `benchmarks/harness` + `packages/server` ako interfejs polja diraju server module.
- `models.json` (ili equivalent) parse-clean preko Node's `JSON.parse(fs.readFileSync(...))`.
- Svi judge model entries imaju non-empty `pinning_surface`. Sve non-Anthropic entries imaju non-null `pinning_surface_carve_out_reason`.
- Single commit: `feat(benchmarks): Sprint 12 Task 1 Blocker #4 — judge model registry + pinning surface fields per B3 addendum § 4`

### 4.3 Sub-deliverable C acceptance

- `benchmarks/harness/tests/jsonl-record-schema.test.ts` — sve postojeće tests pass + 3 nova prolaze.
- `benchmarks/harness/tests/preregistration.test.ts` — 2 dodatna tests za per-judge-model pinning surface u manifest payload-u prolaze.
- Manual smoke: emit-uj jedan record kroz mock runner invocation, verify tri nova polja prisutna.
- `tsc --noEmit` clean.
- Single commit: `feat(benchmarks): Sprint 12 Task 1 B3 addendum § 4/§ 5 — per-row pinning surface + carve-out reason + revision hash JSONL fields`

### 4.4 Aggregate Session 2 acceptance

- Harness test suite total post-Session-2: ~96 tests (78 baseline + 8 preregistration + 4-6 cli + 6 models-config + 5 jsonl-record + 2 preregistration extension = ~99-103 ako sve idu lepo, target floor 96).
- Server test suite: 58/58 unchanged (ako Sub-deliverable B dotakne server, novi tests u server package).
- `tsc --noEmit` clean on oba (`benchmarks/harness` + `packages/server`).
- Grep: `rg "manifest_hash" benchmarks/` mora pokazati hits in `preregistration.ts`, `runner.ts`, `cli.ts`, tests, plus existing decision doc references.
- Grep: `rg "pinning_surface" benchmarks/ packages/` mora pokazati hits u `models.json` + `types.ts` + tests.
- 3 commits, sva tri local na `main`. Bez force-push, bez rebase.
- LLM spend: $0.

---

## 5. Surprise-reporting protocol

Sledite Session 1 precedent — exit ping doc na kraju Session 2 sa istom strukturom kao Session 1 exit ping (`sessions/2026-04-22-cc-sprint-12-task1-session1-exit.md`):

- TL;DR sa per-blocker outcome
- Per-commit file table
- Acceptance criteria verification
- **§ 5 Surprises** — bilo koji deviation od ovog brief-a, bilo koja ambiguous scope decision koju si morao da donosiš sam, bilo koja interface API break koju si uradio van eksplicitnog scope-a — sve sa "Why" line-om i "PM question" formulacijom.

PM ratifikuje exit ping pre nego što Session 3 brief može biti draftovan. Dakle ne pokušavaj da preempt-uješ Session 3 izvršenje "while you're at it" — drži se Session 2 scope-a.

Exit ping fajl: `sessions/2026-04-22-cc-sprint-12-task1-session2-exit.md`.

---

## 6. Time + cost ledger expectation

| Sub-deliverable | Wall-clock | LLM spend |
|---|---|---|
| A — Blocker #3 (pre-reg CLI + emitter) | 4-5h | $0 |
| B — Blocker #4 (judge model registry) | 2h | $0 |
| C — B3 addendum § 4/§ 5 (per-row + manifest) | 1-2h | $0 |
| **Aggregate** | **7-9h** | **$0** |

Ako u toku rada postaje očigledno da bilo koji sub-deliverable preti da pređe svoju budget allokaciju za >50%, **stop i pošalji preliminary ping pre kompletiranja** — bolje je da Marko odluči da li seče scope ili daje dodatno vreme nego da CC "tiho" pređe budget.

Sprint 11 + Session 1 cumulative LLM spend: $0.018893. Session 2 mora ostati exactly tu cifru — ni jedan cent dodatno.

---

## 7. Push protocol

Sub-deliverable A + B + C generišu 3 commit-a. Predlažem sledeći redosled commit + push pattern:

1. Posle Sub-deliverable A merge u `main` lokalno → ne push.
2. Posle Sub-deliverable B merge u `main` lokalno → ne push.
3. Posle Sub-deliverable C merge u `main` lokalno + sve acceptance criteria § 4.4 prolaze → exit ping draft.
4. PM review exit ping → PM signal "push" → CC izvršava `git push origin main` (push-uje sva 3 nova commit-a + neguranje Session 1 commit-ove `a75dd25` + `620f018` ako još nisu push-ovani po adjudication § 4).

Bez push-a u međusekucijama. Sve granular u jednoj push operaciji posle PM ratification.

---

## 8. Risks + watchpoints

**R1 — Existing CLI parser shape** (Sub-deliverable A). Ako Sprint 11 kod ima decentralizovan argv handling rasut po `runner.ts` + `judge-runner.ts` + sub-command files, refactor u central `cli.ts` može preći budget. Mitigation: ako refactor postaje neproporcionalan, zadrži new flags lokalno u `runner.ts` argv block i dokumentuj decision u exit ping § Surprises.

**R2 — `models.json` ne postoji ili je u drugom format-u** (Sub-deliverable B). Verify pre kodiranja. Ako je TS const u `packages/server/src/benchmarks/config/models.ts`, type-extend tamo. Ako ne postoji uopšte, kreiraj `benchmarks/harness/config/models.json` sa svim postojećim Anthropic entries + 4 nova non-Anthropic + extension polja.

**R3 — `pino` logger instance lokacija** (Sub-deliverable A). Verify postojeću pino setup. Ako je po-modulu instantiated, koristi shared util. Ako ne postoji shared util, kreiraj `benchmarks/harness/src/logger.ts` sa default pino instance + export-uj za reuse.

**R4 — Manifest YAML parsing dependency** (Sub-deliverable A). `js-yaml` ili `yaml` paket — verify postojeću dependency. Ne uvodi novu yaml lib; ako nijedan ne postoji, koristi `JSON.parse` na sidecar `.json` mirror file ako ga A3 LOCK ima, ili javi PM za scope expansion.

**R5 — Test naming collision** sa postojećim test fajlovima. Verify pre kreiranja `cli.test.ts`, `preregistration.test.ts`, `models-config.test.ts` da ne postoje već.

**R6 — Drift od B3 addendum eksaktne taxonomy-je**. Re-read `decisions/2026-04-22-b3-lock-dashscope-addendum.md` § 4 + § 5 pre kodiranja Sub-deliverable B i C. Ako tvoja implementacija odstupa od addendum tačno definisanih polja ili enum-a, zaustavi i clarify sa PM-om. Ne improvizuj naming.

---

## 9. Related artifacts

- A3 LOCK v1: `decisions/2026-04-22-bench-spec-locked.md` + `decisions/2026-04-22-bench-spec-locked.manifest.yaml`
- B3 LOCK addendum: `decisions/2026-04-22-b3-lock-dashscope-addendum.md`
- Session 1 brief: `briefs/2026-04-22-cc-sprint-12-task1-session1-brief.md`
- Session 1 exit ping: `sessions/2026-04-22-cc-sprint-12-task1-session1-exit.md`
- Session 1 adjudication: `sessions/2026-04-22-cc-sprint-12-task1-session1-adjudication.md`
- Sprint 12 scope draft: `briefs/2026-04-22-sprint-12-scope-draft.md`
- C3 substrate gap: `sessions/2026-04-22-c3-blocked-substrate-gap.md`

---

## 10. Final reminders

- $0 LLM spend hard constraint.
- 3 commits, no force-push, no rebase, no push do PM signala.
- Surprises ping na kraju, no Session 3 preemption.
- Tests green + tsc clean = closure gate per sub-deliverable.
- Ako bilo šta postaje ambiguous, **stop i pitaj PM** — ne improvizuj.

**Session 2 brief LOCKED. Standing by za CC pickup.**
