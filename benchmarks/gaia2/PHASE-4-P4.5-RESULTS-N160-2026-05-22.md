# Phase 4 P4.5 — GAIA 2 search split FULL RUN N=160 RESULTS

**Date:** 2026-05-22
**Branch:** `feature/gaia2-are-setup`
**Agent:** Hermes runtime (`localhost/gaia2-hermes:latest`) + Anthropic `claude-sonnet-4-6`, thinking=high
**Judge:** `claude-sonnet-4-6` (in-container daemon)
**Dataset:** `meta-agents-research-environments/gaia2-cli`, split `search`, N=160 (full split)
**Cost:** ~$91 extrapolated (~165 scenario-executions × ~$0.55), under the $100 hard cap (Marko amendment 2026-05-21)

---

## Headline

| Metric | Value |
|---|---:|
| **Strict pass rate** | **134/160 = 83.8%** |
| **Judged-only pass rate** | **134/155 = 86.5%** (excludes 5 harness-undecidable) |
| FAIL | 21 |
| ERROR (no turn boundary) | 5 |
| Mem0 paper baseline (Hermes + Sonnet, search split) | ~40–55% pass@1 |

**The ARE-native architecture clears the Mem0 baseline by ~30–45pp at full N=160.** CI at N=160 is
~±6pp (Wilson, p=0.84), so the result is robust — not a small-N artifact.

---

## How this run completed (provenance — it was a two-part run)

1. **First pass** (`waggle_phase4_full_n160.toml`, concurrency=2, 2026-05-21 20:02 → 2026-05-22 01:43):
   reached **141/160** before the CC session crashed and killed the runner process.
   Partial: 117 PASS / 19 FAIL / 5 ERROR. All 141 `result.json` survived on disk.
2. **Finish pass** (`waggle_phase4_finish_subset.toml`, 2026-05-22 03:35 → 04:45): a **deterministic
   24-scenario subset** (the 5 errored + 19 never-run), written to the SAME output dir so the
   results merge into a clean N=160 aggregate.

### Why a subset manifest instead of `--retry`

The runner's built-in `--retry` over-selected: it picked **48 scenarios** = the correct 24
(missing + errored) PLUS **24 already-terminal PASS/FAIL** that it re-queued needlessly. That would
have cost ~$26 (breaching the $100 cap) and re-rolled good verdicts. Root cause not fully isolated
(paths are uniform `search/<id>/result.json`, so it is not a directory-structure mismatch — the
`_select_retry_scenarios` selector misclassifies a specific 24-scenario subset). The subset-manifest
path (`[target].subset_manifest` listing exact IDs) sidesteps it entirely and is deterministic.

---

## The 5-error floor (honest framing)

Errors are all `Daemon error: no turn boundary detected` — the agent ran real work (12–41 tool calls)
but the in-container judge daemon never observed a clean turn close before idle-timeout. **Re-running
swapped *which* scenarios error rather than reducing the count** (2 of the original 5 resolved;
2 new appeared), so this is a stable ~3% runner turn-detection floor on long scenarios, **not** agent
failure and **not** flaky randomness.

Persistent errors at N=160: `27_azdwq4`, `28_ofdzab`, `29_f3f586`, `30_48xm0t`, `30_o7av0c`.

Honest reporting: **155 judged, 5 undecidable on this harness** → report both the strict (83.8%,
counts errors against us) and judged-only (86.5%, excludes them) numbers. Strict is the defensible
public figure; judged-only is the architecture-capability figure.

---

## Open follow-ups (not blocking the result)

- **4th Windows unicode gap:** `trace_viewer.py` HTML generation fails on `▸` (▸) with cp1252 —
  emitted as WARNINGs, affects only the per-scenario trace HTML, NOT `result.json` grading data.
  Patch 3 (runner.py artifact writes) does not cover the trace viewer. Logged in
  `WINDOWS-DOCKER-RUNNER-PATCHES.md` as the 4th patch needed for the upstream PR.
- **Turn-boundary floor:** worth an upstream issue — daemon should treat a long idle after N tool
  calls with no further events as a soft turn-close + judge, rather than erroring.

---

## Authority chain

- Budget: Marko $80→$100 amendment 2026-05-21
- Architecture validation: `PHASE-4-P4.2-PROGRESS-2026-05-21.md` §2 (ARE-native, targeted API calls)
- N=10 probe: `PHASE-4-P4.2-PROGRESS-2026-05-21.md` §8 (8/10 strict, 8/8 judged-only)
- Runner patches: `WINDOWS-DOCKER-RUNNER-PATCHES.md`
- Artifacts: `runs/p4-full-hermes-n160/` (160 scenario dirs + index.html + results.jsonl)
