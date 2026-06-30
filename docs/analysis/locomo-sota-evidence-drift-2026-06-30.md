# LoCoMo SOTA evidence drift — root cause + consolidation (2026-06-30)

**Symptom (founder):** "old benchmark results show, and the SOTA claim is not within waggle-os
or hive-mind." The 87.66% LoCoMo memory-SOTA is real and verified, but looking at the canonical
repos you see *old* numbers — the reproducible evidence isn't there.

**Verdict:** Confirmed. This is a recurrence of the §7.5 substrate-drift pattern, but in the
**evidence/results** dimension, not the code dimension — with an aggravating `.gitignore` rule
that was *silently swallowing* the result report.

---

## How it was diagnosed (4-repo evidence matrix)

| Repo / location | LoCoMo number visible | 87.66 evidence present? |
|---|---|---|
| waggle-os committed `benchmarks/results/` | April-2026 GEPA + v4–v6 manifests + `agentic-locomo-2026-04-25` | **No** |
| waggle-os `docs/` (methodology §0, arXiv `.tex`/`.docx`, WAGGLE-CORNERSTONE) | 87.66 **prose** | Claim only — no reproducible data |
| waggle-os on-disk `benchmarks/results/memori-phase22-RESULT.md` | **82.21%** (Phase-2.2 precursor) | No — and **git-ignored**, never committed |
| OSS `marolinik/hive-mind` `benchmarks/locomo/RESULTS.md` + README badge | **73.1%** (N=320, Opus self-judge) | **No** |
| `hive-mind-test` @ `05f2146` (private side repo) | **87.66%** (N=1540, same-judge) | **Yes — committed** |

**Substrate code (the engine) is NOT the problem this time.** All four SOTA-critical elements —
`inprocess-reranker.ts`, `search.ts` reranker wiring, `resolve-relative-date.ts` /
`parse-date-window.ts` (write-time temporal dating), `raw-detail-lane.ts` — are present in
waggle-os `main` (`packages/hive-mind-core/src/mind/`) and in the OSS mirror. The reranker was
reverse-ported from OSS to monorepo in `f47ee8f` (2026-06-11). (Minor: the OSS reranker sits at
an older commit `974ad7b` but is content-equivalent.)

## Root cause (three compounding failures)

1. **`.gitignore` swallow.** `.gitignore` line `**/benchmarks/results/*` ignores everything
   directly under `benchmarks/results/`. The June W3.3 result report was generated there and
   silently never committed. Older results (`gepa-faza1/…`, `agentic-locomo-2026-04-25`,
   `manifest-v4/v5`) survive only because they were force-added / committed *before* the rule —
   so the directory shows a stale snapshot.
2. **Evidence produced in a throwaway side repo.** The actual 87.66 run (report + 1,540×2
   answers + judgments) was produced and committed in `hive-mind-test`, which is a private
   benchmark working repo — not the product monorepo and not the public OSS repo. It was never
   forward-ported. This is the §7.5 "benchmark work in a side checkout is throwaway unless
   reverse-ported" failure mode.
3. **OSS public repo never refreshed.** `marolinik/hive-mind` still advertises the earlier
   73.1% (N=320) result in `RESULTS.md` + README badge; the 87.66 number was never published
   there even though the winning-stack *code* was (PR #14).

Net effect: the SOTA *claim* (prose) shipped to the monorepo docs, but its *reproducible
evidence* lived only on local disk (git-ignored) + a side repo. A fresh clone of either
canonical repo shows old numbers — exactly the founder's report.

> Red herring: the founder pointed at `D:/Projects/waggle-os-w4` (branch `feature/w4-port`).
> That worktree is **226 commits behind `main`** and only 3 doc/lint commits ahead, all of whose
> content was already re-ported to `main` (paper via `4193e68a`). It holds nothing `main` lacks.

## The fix (this change)

**A. Commit the canonical evidence into the product monorepo (done here).**
`benchmarks/results/locomo-sota-2026-06/` now holds the two canonical reports (verbatim, with
provenance headers), an `INDEX.md` (the previously-untracked SOTA single-source-of-truth), and a
`README.md` reproduction recipe. The raw ~3.8 MB answers/judgments are intentionally **not**
duplicated into the lean product repo — they're pointered to `hive-mind-test` + OSS.

**B. Stop the silent swallow (structural drift-closure).** A `.gitignore` negation exception
re-includes `benchmarks/results/locomo-sota-2026-06/**` so this evidence stays committed and
future canonical SOTA evidence has a non-ignored home.

**C. OSS public update — prepared, founder-gated.** Updating `marolinik/hive-mind`
`benchmarks/locomo/RESULTS.md` + README badge from 73.1% → 87.66% is **outward-facing** (it
pre-announces the SOTA ahead of arXiv submission, whose citation pass + endorsement are still
open). Left as a go/no-go for the founder rather than pushed unilaterally.

## Prevent recurrence (recommended follow-ups)
- Add a one-line contract to `CLAUDE.md` §7.5 / `packages/hive-mind-core/CONTRIBUTING.md`:
  *"Benchmark SOTA evidence MUST land in `benchmarks/results/locomo-sota-*/` (gitignore-excepted)
  in the monorepo. `hive-mind-test` is throwaway — forward-port the report the same arc."*
- Optionally extend `scripts/oss-drift-check.sh` to assert `RESULTS.md` headline parity between
  the monorepo evidence dir and the OSS `benchmarks/locomo/`.
