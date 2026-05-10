# LOCKED — PM-RATIFY-PROBE FAIL Branch, P2 Path Selected

**Date**: 2026-04-24
**Ratified by**: Marko Marković (via PM adjudication)
**PM**: claude-opus-4-7 (Cowork)
**Prerequisite gate**: 2/3 ratified; §1.3 probe FAIL adjudicated via P2 path with two conditions

## Odluka

**P2 ACCEPT** — LiteLLM-side rate-limiter (`rpm: 20` on `gemini-3.1-pro-preview`) kao primary resolution za Gate P+ 24/50 429 failure. Manifest v4 anchor `dedd698` ostaje validan pending §1.3b OUT_OF_SCOPE verdict. HEAD `373516c` nepromenjen.

## Root cause acknowledged

Google per-model preview cap (25 RPM hardcoded za `gemini-3.1-pro-preview`) je nezavisan od account billing tier-a. Tier 2 1000 RPM je account-wide across models, ne per-model. Ovo je Google PRODUCT POLICY constraint, ne infrastructure gap. LiteLLM headers su pokazali 1999/2000 remaining — LiteLLM nije limiter, Google je.

Probe evidence: prvih 25 calls (t=0-14.7s) sve 200 OK, calls 25-49 cascade 429 sa Retry-After 33.4s. Strict window-based enforcement.

## Uslovi (oba non-negotiable)

### §1.3b — manifest v4 §11 scope audit

CC-1 mora eksplicitno utvrditi da `litellm-config.yaml` (ili ekvivalentni ops-config path) NIJE u §11 frozen paths listi. Deliverable: ≤100 reči memo sa verbatim §11 citation, config path declaration, i IN_SCOPE/OUT_OF_SCOPE verdikt.

Ako IN_SCOPE → fallback na P4 (concurrency=1 + manifest v5 emission). P2 ne može proći bez manifest integrity break-a.
Ako OUT_OF_SCOPE → P2 proceeds, §1.3c pokreće se.

### §1.3c — throttle verification mini-probe

Posle rpm: 20 config change-a: 30 Gemini calls u 90s windowu pri clean foreground kickoff-u. Očekivano 0 × 429. Ako fail → razmatra se dalji throttle (rpm: 15) ili cascade na P4.

## Odbacivanja

- **P1** (Google support): pursued u PARALLEL kao non-blocking future-proof track. Marko-level action preko Google AI Studio support ticket sistema, citirajući account ID 01DBA5-921E58-9DAF46, Tier 2 status, production use case (LLM-as-judge benchmark). NIJE re-kick blocker.
- **P3** (model swap na gemini-1.5-pro): §5.2 consistency_constraint break + judge ensemble quality degradation. Rejected.
- **P4** (concurrency 1): manifest v5 trigger bez gain-a preko P2. Drži se kao fallback ako §1.3b IN_SCOPE.
- **P5** (halt at Gate C): thesis integrity incompatible sa "pravi sota rezultat" direktivom. Rejected nuclear option.
- **P6** (Promise.allSettled early): code-freeze break kada P2 postiže isti rezultat bez ga. Ostaje u Task 2.6 backlog-u (`judge-ensemble-defensive-error-handling`) per §1.2 ratifikaciji.

## Wall-clock projekcije (P2 path)

- Gemini floor pri rpm 20: 2000 calls / 20 rpm = 100 min
- Opus + GPT judges parallel, runner overhead, cell scheduling: +30-60 min
- **Ukupno: ~2-3h wall-clock** za ceo Stage 3 (brže od originalnog 8h pre-reg estimate-a)

## Task #29 progress

- §1.1 Path L-1 ✓
- §1.2 Task 2.6 path ✓
- §1.3 FAIL → §1.3b + §1.3c sub-gates added
- N=400 re-kick blocked until §1.3b + §1.3c ratified

## Artefact chain

- Probe log SHA-256: `8b6503aaeed6b2ab799c7b31b989e38c93f226f7ac4d505c81726637f207c665`
- Probe memo SHA-256: `ed959f1204dde26afe45da8832783805d767e9f11b57fdc1401ff356b72f51e7`
- Anchor commit: `66dcd5a1b18b9367662b04f1c9e1b66d855a9481`
- Parent chain: 66dcd5a → 274e987 (§1.2) → 67eb899 (§1.1) → dedd698 (manifest v4) INTACT

## Parallel non-blocking action (Marko)

Google AI Studio support ticket za per-model quota increase na `gemini-3.1-pro-preview`, account ID 01DBA5-921E58-9DAF46, Tier 2 live. Unknown response time za preview modele. Registracija sada otvara put za buduće benchmark-ove.
