# LOCKED — PM-RATIFY-LITELLM-SCOPE Verdict, IN_SCOPE → P4 Pivot

**Date**: 2026-04-24
**Ratified by**: Marko Marković (via PM adjudication)
**PM**: claude-opus-4-7 (Cowork)
**Prerequisite gate**: §1.3 PROBE FAIL → §1.3b sub-gate; produces P2/P4 fork

## Odluka

**IN_SCOPE ACCEPT** — `litellm-config.yaml` je u manifest v4 §11 frozen-paths skupu po obema očitanjima (MD narrow "judge aliases" i YAML strict "whole file"). Posledica: P2 (LiteLLM-side `rpm: 20` config edit) ne može proći bez manifest integrity break-a. Aktivira se P4 (manifest v5 emission + concurrency=1 path) kao primary resolution.

## Memo summary

CC-1 §1.3b deliverable: 93 reči, anchor `69a14708`, SHA `4abb3b2ee...`. Verbatim §11 citation potvrđuje da je config-yaml file path eksplicitno listiran. Oba intent reading-a (uska "samo judge alias declarations su frozen" i stroga "ceo file je frozen") konvergiraju na IN_SCOPE.

## Posledice za §1.3 path matrix

- **P2 PATH RETRACTED**: `rpm: 20` edit na `gemini-3.1-pro` aliasu ne može da bude primary resolution bez break-a manifest v4 §11 freeze. Dilucija manifest authority-ja nije prihvatljiva za audit trail.
- **P4 PATH ACTIVATED**: Manifest v5 emission (anchor TBD), pre-registracija throttle parametara (`rpm: 20` na judge aliases) kao explicit pre-reg deklaracija, plus concurrency=1 control flag. Manifest v5 supersedes v4 anchor `dedd698` za Stage 3 N=400 re-kick svrhe; v4 ostaje audit-immutable kao record originalnog Gate D Option A intenta.
- **§1.3c probe redefined**: izvodi se na manifest v5 throttle params, ne na ad-hoc edit. Throttle deklaracija mora biti deo pre-reg artefakta pre execution-a.

## Brief za CC-1 (P4 path, 5 koraka sequential)

1. **Manifest v5 emit** (md + yaml, SHA-pinned) sa explicit rpm:20 declaration na `gemini-3.1-pro` alias + concurrency=1 control. Anchor commit message references `dedd698` predecessor.
2. **Config edit izvršen pod manifest v5 authority-jem** (ne kao ad-hoc P2). Commit message references manifest v5 anchor.
3. **§1.3c probe** (30 calls / 90s window, 0×429 success criterion) na manifest v5 throttle params. PM-RATIFY na verdikt.
4. **§1.3e RPD feasibility check** (separate sub-gate dodatno introduced, jer 250 RPD per-project ceiling je discovered late-stage). PM-RATIFY na verdikt.
5. **GATE-D-REKICK-GO** posle §1.3c PASS + §1.3e FEASIBLE + (Google ticket approval ako RPD INFEASIBLE @ current).

CC-1 ne sme self-advance kroz nijednu sub-gate. PM ratifikacija na svakom.

## Odbacivanja

- **Manifest v4 amendment** (in-place): bi diluovao freeze authority. Manifest mora ostati immutable; v5 je proper successor sa parent-chain reference-om.
- **P2 force-push** (ignore §11): §1.3b verdikt je explicit IN_SCOPE; force-push bi tražio Marko-direktnu nadjacavanje koja nije ni traženo ni opravdano.

## Artefact chain

- §1.3b memo: anchor `69a14708`, SHA `4abb3b2ee...` (CC-1 emit, PM read-only)
- Parent integrity: HEAD `373516c` frozen except future litellm-config.yaml edit pod v5 authority
- Manifest v4 anchor `dedd698` PRESERVED kao audit-record

## Task #29 progress

- §1.1 Path L-1 ✓
- §1.2 Task 2.6 path ✓
- §1.3 FAIL → §1.3b IN_SCOPE ✓ → P4 activated
- §1.3c probe pending (na manifest v5 throttle)
- §1.3e RPD pending (introduced post-IN_SCOPE)
- N=400 re-kick blocked until §1.3c + §1.3e + (Google approval)
