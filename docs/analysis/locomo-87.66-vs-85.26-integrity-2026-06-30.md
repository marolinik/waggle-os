# LoCoMo headline integrity — 87.66% is not reproducible; canonical = 86.49% (settled 2026-07-01)

**TL;DR.** The published LoCoMo SOTA headline **87.66% (1350/1540)** does not reproduce on a fresh
judge pass on **any** substrate. Fresh 7-lane W4 + fresh gpt-4.1-mini judge = **85.19%** on its own
archived 2026-06-11 substrate and **86.49%** on the current substrate. The inflation is at the
**judgment layer** (the harness's documented stale-verdict-replay bug), not substrate drift. Founder
adopted **86.49%** as the canonical, reproducible, still-SOTA number (+4.54pp over Memori 81.95,
z=4.64, p<10⁻⁵). Verify: `benchmarks/results/locomo-sota-2026-06/recount.mjs`.

## The investigation chain (each step verified)

1. **Evidence not in the repos.** The 87.66 report + raw answers/judgments lived only in the
   throwaway `hive-mind-test` repo + git-ignored local disk (`.gitignore **/benchmarks/results/*`);
   OSS showed the old 73.1%. (See `locomo-sota-evidence-drift-2026-06-30.md`.)

2. **Committed judgments recount low.** `memori-gpt41mini-ours-judgments.jsonl` @ `05f2146` (the
   report's cited input) recounts to **1313/1540 = 85.26%**, not 1350/87.66. Method validated: it
   reproduces the Mem0 (73.96%), Config-C (76.62%) and theirs-arm (82.14%) numbers exactly.

3. **The committed answers were the WRONG config** (founder's "7-lane W4?" catch). That answers file
   has `raw_detail=0, importance=0, ~3098 tok` — a **reduced 2-lane** run (distilled+semantic), not
   7-lane W4. Re-judged fresh = **85.39%**. The 87.66 needed the full 7-lane stack (raw-detail≈16,
   ~3700 tok).

4. **Regenerated the true 7-lane W4** (PROFILES+DATEWIN+EPISODIC+RAWDETAIL, uncapped) on the current
   substrate → **86.49% (1332/1540)**. Better than 2-lane (+1.1pp), validates the Pareto — but still
   1.17pp below 87.66.

5. **Substrate confound ruled out.** The 87.66 (2026-06-11) ran on minds archived as
   `minds-pre-wave3c` (2026-06-11 00:38); the current minds were rebuilt larger on 2026-06-29. Fresh
   7-lane W4 on the **archived original substrate** = **85.19%** — *lower* than current. So the gap
   is NOT substrate drift (newer substrate scores higher); 87.66 doesn't reproduce even on its own
   substrate.

6. **Cause = stale-verdict replay.** The harness note (2026-06-15,
   `RESULT-backlog-closeout`): *"judge resumes by question_id and replayed stale verdicts."* The
   original 1350-correct judgment pass included replayed/inflated verdicts; it is lost and no fresh
   judge (85.19 / 86.49) reproduces it. The `41-judge` resume-by-linecount is the mechanism —
   reusing an OUT_FILE skips fresh judging.

## Definitive numbers (all fresh gpt-4.1-mini judge, Memori verbatim prompt, N=1540)
| Configuration | Overall | vs Memori |
|---|--:|--:|
| Published claim (2026-06-11) | 87.66% (1350) | +5.71pp — *unreproducible* |
| Archived 2026-06-11 substrate, 7-lane W4 | 85.19% (1312) | +3.24pp |
| **Current substrate, 7-lane W4 (CANONICAL)** | **86.49% (1332)** | **+4.54pp, z=4.64** |
| 2-lane committed file, fresh judge | 85.39% | +3.44pp |

## Resolution (2026-07-01)
- Adopt **86.49%** as canonical. Pinned in `benchmarks/results/locomo-sota-2026-06/`
  (report + answers + judgments + `recount.mjs`), git-tracked.
- Correct 87.66→86.49 across all surfaces (docs, public `apps/www`, `BenchmarkApp`, arXiv draft,
  OSS, memory index); recompute stats (+5.71→+4.54pp, z=4.42→4.64).
- Prevent recurrence: the harness must use a fresh `OUT_TAG` per run; benchmark SOTA evidence must
  pin substrate+answers+judgments together in-repo. `hive-mind-test` is throwaway.
