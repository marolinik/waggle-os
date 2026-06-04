# Manifest v8.2 — Final Scope Amendment (supersedes v8.0 and v8.1)

**Manifest version:** v8.2.0-preregistration (final scope)
**Preregistered date:** 2026-06-04
**Authority:** PM (Marko Marković)
**Supersedes:** manifest-v8-gaia2-preregistration.md (v8.0.0) and
manifest-v8.1-multi-benchmark.md (v8.1.0) for scope section only.
All GAIA 2 methodology in v8.0.0 §1–§9 remains intact and unmodified.

---

## 0. Amendment rationale

v8.1.0 added BEAM (Track A), LongMemEval-V2 (Track C), and Terminal-Bench 2.0 (Track D).
This amendment makes two scope changes:

1. **LongMemEval-V2 dropped** — deferred to v9. No public runner, 25 M+ token haystacks,
   and web-agent trajectory tooling are all pre-stable. Attempting V2 in v8 would block
   the release milestone without scientific payoff. The V1 benchmark is fully runnable
   today (harness already recognises `longmemeval`), and its `knowledge-update` split
   directly tests the same substrate claim.

2. **LongMemEval V1 added as Track A0** — becomes the fastest path to a new data point.
   500 questions, S-variant (115 K tokens/question), zero new harness work required.
   Hard budget cap $20. Runs before BEAM.

---

## 1. Final four-track scope

| Track | Benchmark | Primary claim surface | Status | Budget hard halt |
|---|---|---|---|---|
| **A0** | **LongMemEval V1** | Conversational memory — `knowledge-update` split | Runnable now | **$20** |
| **A** | **BEAM** | Contradiction resolution (unsolved category) | Runnable now | **$50** |
| **B** | **GAIA 2 / ARE** | Ambiguity + Adaptability stateful tasks | Blocked — SIGALRM fix | **$80** (per v8.0) |
| **D** | **Terminal-Bench 2.0** | Capability floor / positioning | Async submission | **$0** |

> **LME-V2 (former Track C) is out of v8 scope.** It is preregistered as a v9 track
> with no methodology commitments in this document.

---

## 2. Execution order

```
A0 (LongMemEval V1)   ← first: fastest path, harness already knows 'longmemeval'
        ↓
A  (BEAM)             ← second: pip install + download, low adapter effort
        ↓
B  (GAIA 2)           ← third: blocked on SIGALRM fix; starts in parallel after fix
D  (Terminal-Bench)   ← async: submit existing scaffold any time, not gating release
```

Rationale for A0-first ordering: the harness `longmemeval` dataset identifier is already
wired; the canonical builder (`build-longmemeval-canonical.ts`) produces a drop-in JSONL;
the S-variant is 500 questions at manageable cost. A0 provides an independent memory
result to strengthen the central claim before BEAM runs.

---

## 3. Central scientific claim (unchanged from v8.1)

> **Substrate (I/P/B hive-mind) > subject model selection.**
>
> Demonstrated across three evaluation surfaces:
> - **Conversational memory** — LongMemEval V1, `knowledge-update` split (Track A0)
> - **Contradiction resolution** — BEAM CR category (Track A), the category that remains
>   unsolved for all subject models at the time of preregistration
> - **Stateful agent tasks** — GAIA 2 Ambiguity + Adaptability splits (Track B)

Terminal-Bench 2.0 (Track D) provides **positioning data only**. It is not part of the
scientific claim and will not be cited as evidence for the substrate > subject hypothesis.

---

## 4. Unchanged elements from v8.0.0

- All GAIA 2 methodology (§1–§9 of manifest-v8-gaia2-preregistration.md) is unmodified.
- Track B $80 hard budget halt is unchanged.
- Contradiction resolution as primary BEAM focus is unchanged.
- The I/P/B frame taxonomy (I = Identity, P = Procedural, B = Belief/Contradiction) is
  unchanged.

---

## 5. LME-V2 deferral note (v9 placeholder)

LongMemEval-V2 (web-agent trajectory haystacks, multimodal, 25 M+ token context) is
deferred to v9. No methodology is preregistered here. A v9 amendment will cover:
trajectory Insert/Query API, multimodal evidence handling, and comparison to V1 baseline.

---

## 6. Budget summary

| Track | Hard halt | Notes |
|---|---|---|
| A0 — LongMemEval V1 | $20 | S-variant only (500 questions) |
| A — BEAM | $50 | 128 K chat-size default |
| B — GAIA 2 | $80 | Per v8.0.0 methodology |
| D — Terminal-Bench | $0 | Submit only |
| **Total exposure** | **$150** | Sequential gating limits concurrent spend |

---

## 7. Prior anchors

- `benchmarks/preregistration/manifest-v8-gaia2-preregistration.md` — v8.0.0 base
- `benchmarks/preregistration/manifest-v8.1-multi-benchmark.md` — v8.1.0 amendment
- This document (v8.2.0) supersedes both for scope; neither for methodology.
