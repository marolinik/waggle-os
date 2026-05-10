# GEPA — Tier 2 Prompt-Shapes Evolution

GEPA (Agrawal et al. — Genetic Evolutionary Prompt Adaptation) harness for
evolving the per-model prompt-shape templates in `packages/agent/src/prompt-shapes/`.

**Faza 1 (current):** proof-of-concept pilot. $100 cap. H3 cell only. 5 shapes ×
3 candidates × 2 generations × N=8 evaluations.

**Faza 2 (gated on Faza 1 PASS):** expansion to H2 + H4 cells, scale N to 20+,
3-5 generations, separate ratification + brief.

## Authority chain

- PM brief: `D:/Projects/PM-Waggle-OS/briefs/2026-04-28-cc4-gepa-tier2-evolution-faza1-brief.md`
- Pre-flight report: `D:/Projects/PM-Waggle-OS/briefs/2026-04-28-cc4-faza1-preflight-report.md`
- Amendment 1: `D:/Projects/PM-Waggle-OS/briefs/2026-04-28-cc4-faza1-amendment-1.md`
- Amendment 2: `D:/Projects/PM-Waggle-OS/briefs/2026-04-28-cc4-faza1-amendment-2.md`
- Launch decision (LOCK): `D:/Projects/PM-Waggle-OS/decisions/2026-04-28-gepa-faza1-launch.md`
- Manifest v7 (Amendment 2 supplemented): `benchmarks/preregistration/manifest-v7-gepa-faza1.yaml`
  - SHA: `583712dde139ffc87fb1ab21643f68d52c56469ded9e8090a624980b05969beb`

## Substrate freeze

- Branch: `feature/c3-v3-wrapper`
- Commit: `c9bda3d6dd4c0a4f715e09f3757a96d01ff01cd7` (Phase 4.7)
- Worktree: `D:/Projects/waggle-os-faza1-wt` (detached HEAD c9bda3d, race-condition guarded)

## Module map (`src/faza-1/`)

| Module | Purpose | Key references |
|---|---|---|
| `types.ts` | Shared types + `QWEN_TARGETED_SHAPES` / `NON_QWEN_SHAPES` partition | Amendment 2 §3 |
| `fitness.ts` | Per-shape fitness function with retrieval engagement bonus fork | Amendment 2 §3 bands |
| `acceptance.ts` | §F + §F.5 verdict per candidate (false-positive guard) | Launch decision §F |
| `mutation-validator.ts` | Cell-semantic preservation audit (boundary SHAs) | Launch decision §A.4 + §B |
| `kappa-audit.ts` | Drift band detection vs canonical 0.7878 ± 0.05 | Launch decision §F.3 |
| `cost-tracker.ts` | Super-linear governance + halt triggers | Launch decision §A.7 + §D |
| `selection.ts` | Top-1-per-shape + run-aggregate §F.2 | Launch decision §F.2 |
| `mutation-oracle-fork.ts` | Qwen vs non-Qwen template routing | Amendment 2 §4 |

## Boundary anchors (LOCKED at substrate c9bda3d)

| Anchor | SHA-256 | Bytes |
|---|---|---|
| `packages/agent/src/prompt-shapes/types.ts` (whole file) | `1a9fa329e4b66ed9f0abe8bc22cbbf0124e0c879e1e78ec806d557cab25bc94d` | — |
| `MULTI_STEP_ACTION_CONTRACT` constant body | `70a1701dfa126f8dc1df9c116f0a8469da005821ecadc59d9b8f348568e755ba` | 252 |

## Baseline shape SHAs (LOCKED)

| Shape | SHA-256 |
|---|---|
| `claude.ts` | `cbaf0c37b067b025a1fe97f2feeec11fae4070a8b3fcfaad1da8775dda451cc0` |
| `qwen-thinking.ts` | `848a4e4917baa5c7bbcc3bb35fb8cb4b4ac8f0ab537243f14cbef3a99197aacb` |
| `qwen-non-thinking.ts` | `35be379be9a8caafc2c419e32da5f63f92fc83f6f6d70d9df76029c1e8584572` |
| `gpt.ts` | `5dc6d750d52a68feb9d37ad8384b2bcd59d70962066122ff086b0e5888413576` |
| `generic-simple.ts` | `81189817f560e26a69394248d8bd9089cae72c7d40825323e2b7407e36026172` |

## Per-shape fitness fork (Amendment 2 §3)

```
Qwen-targeted (qwen-thinking, qwen-non-thinking):
  fitness = trio_strict_pass_rate + retrieval_engagement_bonus − cost_penalty

  retrieval_engagement_bonus =
    +0.05 if mean retrieval_calls per task ≥ 2.0  (Opus parity proxy)
     0.00 if mean retrieval_calls per task ∈ [1.5, 2.0)
    −0.05 if mean retrieval_calls per task < 1.5  (Qwen baseline penalty)

Non-Qwen (claude, gpt, generic-simple):
  fitness = trio_strict_pass_rate − cost_penalty
```

## §F.5 false-positive guard (Amendment 2 §5)

If best Qwen-shape candidate achieves `+5pp trio_strict delta WITHOUT closing
retrieval engagement gap (mean retrieval_calls < 1.5)`, candidate is REJECTED
as false-positive evolution.

## Tests

110 tests across 7 files (`tests/faza-1/`). Run via `npm test` from repo root
(vitest auto-discovers `benchmarks/*/tests/**/*.test.ts`).

| Test file | Tests |
|---|---|
| `fitness.test.ts` | 30 (5 mandatory boundary cases + 5 routing + cost penalty + invariants) |
| `acceptance.test.ts` | 17 (§F.5 mandatory FAIL + PASS-path + boundaries) |
| `mutation-validator.test.ts` | 19 (SHA boundary + baseline + metadata + imports + Gen 1 mutation) |
| `kappa-audit.test.ts` | 22 (drift band + Cohen's κ + audit log + canonical anchor) |
| `cost-tracker.test.ts` | 23 (HARD_CAP + INTERNAL_HALT + SUPER_LINEAR + audit cadence) |
| `selection.test.ts` | (top-1 + Qwen retrieval ranking + §F.2 boundaries + missing-baseline errors) |
| `mutation-oracle-fork.test.ts` | (shape classification + template paths + placeholder substitution) |

## Halt-and-PM checkpoints

| # | Checkpoint | Cumulative | Trigger |
|---|---|---|---|
| 1 | Pre-A | ~$5 | Post 50-instance corpus + 5-instance spot-audit |
| 2 | A | ~$25 | Post NULL-baseline 5 shapes × 8 instances |
| 3 | B | ~$50-65 | Mid-Gen 1 (after 30 evaluations) |
| 4 | C | ~$100 | Post held-out validation, Faza 1 verdict |

See launch decision §E for binding details.

## Acceptance criteria summary

Per launch decision §F (binding) — all 4 conditions must hold AND no §F.5 trigger:

1. Best GEPA candidate beats NULL-baseline by ≥+5pp on `trio_strict_pass` rate
   (`trio_mean ≥ 4.0` per Ask B); for Qwen-targeted shapes, additionally
   `mean retrieval_calls per task ≥ 1.7` (50% gap closure).
2. ≥3/5 shapes show positive trio_strict delta vs NULL-baseline.
3. Trio judge κ remains within `±0.05` of canonical `0.7878`
   (drift band `[0.7378, 0.8378]`).
4. Zero cell semantic violations detected by `mutation-validator`.
5. **§F.5 false-positive guard:** Qwen candidate with `+5pp trio_strict delta`
   AND `mean retrieval_calls < 1.5` → REJECTED.
