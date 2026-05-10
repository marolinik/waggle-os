# LOCKED — PM Let-It-Run N=400 Phase B Execution

**Date**: 2026-04-24 (evening, post-kickoff)
**Ratified by**: Marko Marković (verbatim-implicit via accept of PM recommendation)
**PM**: claude-opus-4-7 (Cowork)
**Context**: N=400 runner kicked (PID 647664, nohup-detached), first instance successful, projected 24h wall-clock (vs brief 180-min projection)

## Odluka

**LET IT RUN.** 180-min wall-clock u Phase 2 brief bio je PM projection greška, ne hard halt trigger. Budget-side halts ($28 soft, $30 hard) su real triggers; time-side nije specifikovano kao trigger. Runner nastavlja do completion ili budget-side halt.

## PM brief error acknowledgment

Original Phase 2 brief §5 specifikovao "Wall-clock cap: 180 min" bez eksplicitne halt trigger specifikacije. To je bilo wall-clock projekcija bazirana na optimističkoj racunici bez proper aritmetike:
- Pretpostavljeno: 400 instances total
- Actual: 2000 total evals (400 per cell × 5 cells)
- Pretpostavljeno: parallel execution ili aggressive concurrency
- Actual per v5/v6 §7: concurrency=1, sequential cells, sequential instances
- Pretpostavljeno: ~90-150 min wall-clock
- Actual: ~24-28h wall-clock (~45s per instance × 2000 = 25h)

CC-1 korektno surfirao ambiguity na kickoff-u i zatražio PM adjudication. PM odlučio: **projekcija nije binding trigger; budget-side halts ostaju authoritative constraint**.

## Zašto LET IT RUN je correct choice

1. **SOTA benchmark wall-clock parity**: 24h je normalno za production SOTA runs čak i kod top labs. Naš concurrency=1 sequential setup je disciplinovan pre-reg choice, ne inefficiency.

2. **Kill bi izgubio in-progress work**: no-context cell već u execution, prvi instance uspešan (Qwen 13.4s, $0.002). Zero benefit od early kill.

3. **Concurrency povećanje = §5.2 scope deviation**: raising concurrency mid-run bi zahtevalo v7 re-pre-registration. Ne vredi to komplikovati radi wall-clock convenience.

4. **Marko "pravi sota rezultat" direktiva**: eksplicitno prioritetizuje thesis integrity nad wall-clock convenience. 24h čekanja je manja cena nego nov adjudication ciklus.

5. **Budget-side gate je binding**: $28 soft halt + $30 hard halt ostaju aktivni kroz ceo run. Projected $20-25 drži nas komfortno pod cap.

## Current run state

- **Parent launcher PID**: 647664 (nohup wrapper, exited after detach — normal nohup behavior)
- **Actual runner PID**: **71020** (node process, holds runner-lock, live process — this is the PID to check for liveness)
- Runner lock: `benchmarks/results/.benchmark-runner.lock` (pid=71020)
- Current cell (at kickoff): no-context (1/5)
- Output: `benchmarks/results/no-context-locomo-2026-04-24T16-29-14-400Z.jsonl` (live write)
- Log: `tmp/stage3-n400-v6-run.log`
- LiteLLM proxy: http://localhost:4000 (55 aliases, v6 additions live)
- Session persistence: runner survives this chat session close

**Monitoring PID lesson (2026-04-24 false-alarm debrief)**: CC-1 halt ping pomenuo dva PID-a. 647664 je launcher wrapper koji exit-uje odmah posle nohup detach-a (normal behavior); actual runner child je 71020 koji drži runner-lock i obavlja execution. Buduće liveness check mora koristiti PID iz runner-lock file-a, ne launcher PID iz halt ping-a.

## Monitoring cadence (Marko-side)

Svakih 4-6h tokom sledećih ~24-28h:

**Progress check** (safe, non-invasive) — PowerShell on Windows:
```
Get-Process -Id 71020 -ErrorAction SilentlyContinue
Get-Content tmp\stage3-n400-v6-run.log -Tail 20
Get-ChildItem benchmarks\results\*-locomo-2026-04-24T16*.jsonl | ForEach-Object { "$($_.Name): $((Get-Content $_.FullName | Measure-Object -Line).Lines) / 400" }
```

Or combined one-liner:
```
Write-Host "=== PID ===" ; Get-Process -Id 71020 -ErrorAction SilentlyContinue ; Write-Host "`n=== PROGRESS ===" ; Get-ChildItem benchmarks\results\*locomo-2026-04-24T16*.jsonl | ForEach-Object { "$($_.Name): $((Get-Content $_.FullName | Measure-Object -Line).Lines) / 400" } ; Write-Host "`n=== LOG TAIL ===" ; Get-Content tmp\stage3-n400-v6-run.log -Tail 10
```

**Projected cell completion** (approximate, assumes no unexpected delays):
- no-context: ~21:00 CET 2026-04-24 (tonight)
- oracle-context: ~02:00 CET 2026-04-25 (overnight)
- full-context: ~07:00 CET 2026-04-25 (morning)
- retrieval: ~12:00 CET 2026-04-25 (midday)
- agentic: ~17:00 CET 2026-04-25 (late afternoon)

Runner kicks post-execution analysis + commits post-all-cells-complete.

## Kill triggers (flag back to PM)

Marko pinguje PM sa log excerpt za adjudication ako:

1. **Budget halt**: log shows "$28" threshold hit ili "BUDGET_HALT" token
2. **Streak halt**: §7.2 "3 consecutive subject failures" detected
3. **Cost projection exceeds**: cumulative $ > $25 pre completion agentic cell
4. **Cell stalls**: any cell shows no progress >8h (potential openrouter cascade or MiniMax outage)
5. **Log errors cascade**: repeated "ERROR" tokens bez successful recovery
6. **Strategic abort**: Marko-level decision iz bilo kog razloga

U većini slučajeva PM adjudication odlučuje između (a) resume with mitigation, (b) clean restart sa lessons, (c) abort + scope reduce.

## Completion protocol

Kada svih 5 cells complete (sutra popodne):
1. Marko resume session sa PM (this thread ili new)
2. CC-1 resumed from same worktree
3. CC-1 pravi 4 Phase 2 deliverables:
   - `stage3-n400-v6-results.jsonl` (merged all cells)
   - `stage3-n400-v6-analysis.md` (Fisher one-sided H1 test + per-cell + agentic diagnostic)
   - `stage3-n400-v6-operational-report.md` (metrics)
   - `stage3-n400-v6-memo.md` (≤300 words)
4. Single commit parent = `4ae9784`
5. CC-1 halt ping with PM-RATIFY-V6-N400-COMPLETE request
6. PM ratifies + emits Gate D exit brief + evaluates SOTA claim vs 91.6% LoCoMo target

## Task #29 trace

- §2.0 ✓ §2.1 ✓ (Phase 1 PASS)
- §2.2 N=400 execution: RUNNING detached (PID 647664)
- PM-RATIFY-V6-5-2-CLARIFICATION ✓
- PM-RATIFY-V6-N400-COMPLETE: pending completion (sutra popodne)
- Gate D exit: pending PM-RATIFY-V6-N400-COMPLETE

## Parent commit chain + pending

```
4ae9784 §5.2.1+§5.2.2 amendment (CURRENT HEAD)
<pending> stage3-n400-v6 execution commit (CC-1 will produce on completion)
```

15 commits total od v4 `dedd698` once N=400 execution commit lands.
