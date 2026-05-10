# LOCKED — PM-RATIFY-RCA Task 2.6 Path

**Date**: 2026-04-24
**Ratified by**: Marko Marković (via PM adjudication)
**PM**: claude-opus-4-7 (Cowork)
**Prerequisite gate**: 2/3 (Task #29 progress)

## Odluka

**PM-RATIFY-RCA: RATIFIED.** Task 2.6 tech-debt path ratifikovan. Manifest v4 anchor `dedd698` ostaje validan bez ijednog code-freeze break-a. HEAD `373516c` nepromenjen.

## Findings acknowledged

1. **F1**: `judgeEnsemble` je sequential `for await` loop (failure-mode-judge.ts:245-258), NE Promise.all. Sprint brief hipoteza o Promise.all early-exit je bila mehanički pogrešna.
2. **F2**: Svih sedam judge failure modes (HTTP 429, timeout, token budget, malformed JSON, 401/403, context length, 5xx) propagira kroz single catch path na judge-runner.ts:386-400 → judge_error payload → runner continues. Unified error handling confirmed.
3. **F3** (kritičan operativni nalaz): Gate D observed halt bio je EKSTERNI. Claude Code harness process-tree cleanup kada kickoff Bash primi "Terminated" marker. Pid 4984 i pid 65668 bili su children iste kickoff sesije. NE runner-code bug.
4. **F4**: Pre-existing audit-trail bug na runner.ts:493-511 širi judge fields ali izostavlja judge_error. Objašnjava 32 "neither rows" zagonetku. Non-blocking za Stage 3 jer pre-registered thresholds ne zavise od tog polja.

## Task 2.6 carry-over tickets (CLOSED as backlog)

1. **`judge-ensemble-defensive-error-handling`** — Promise.allSettled + 2-of-3 quorum na failure-mode-judge.ts:245-258; čuva Opus+GPT verdicts pod Gemini tail failures. Priority P2.
2. **`runner-judge-error-persistence`** — proširenje runner.ts:493-511 spread-a da uključi judge_error field; zatvara audit-trail gap. Priority P2.

## Operational constraint (non-negotiable)

**N=400 kickoff i §1.3 Gate P+ probe MORAJU biti clean foreground.**

- **FORBIDDEN**: `run_in_background`, nohup-detached kickoff Bash, bilo koja invokacija čiji parent Bash marker može primiti Terminated signal tokom runner lifetime-a.
- **REQUIRED**: dedicated foreground terminal session koja ostaje attached za ceo runner duration, ILI tmux/screen sesija eksplicitno detached od Claude Code harness process-tree.

**Rationale**: Finding 3 utvrđuje da harness process-tree cleanup cascades na sve children-e kickoff Bash-a. Bilo koji background wrapper koji može umreti mid-run ubiće runner bez obzira na runner-code correctness.

Ova constraint vezuje §1.3 probe I N=400 re-kick. Kickoff mehanizam mora biti eksplicitno deklarisan u §1.3 probe halt ping-u.

## Path rejection rationale

- Manifest v5 emission nepotreban — findings ne zahtevaju code change.
- Defensive patch pre re-kick-a odbijen jer je hipoteza u brief-u bila pogrešna; nema ničeg da se patch-uje u runner code-u.

## Next gate

- **2/3 prerequisites CLOSED** (§1.1 Path L-1 ✓, §1.2 Task 2.6 path ✓)
- CC-1 authorized za §1.3 Gate P+ pre-flight probe (50 Gemini calls u 30s, 0 × HTTP 429 required, clean foreground kickoff)
- No self-advance to N=400 re-kick do PM-RATIFY-PROBE

## Artefact

- Memo: `benchmarks/results/manifest-v4-runner-early-exit-rca.md`
- Memo SHA-256: `1d53c9d2d54e715812c3f2e3586876f595b123700ddfdc53e22124b2f38535ac`
- Anchor commit: `274e9871b54599077a3d72de88d505550803a805` on `feature/c3-v3-wrapper`
- Parent chain: 274e987 → 67eb899 (§1.1) → dedd698 (manifest v4) intact
