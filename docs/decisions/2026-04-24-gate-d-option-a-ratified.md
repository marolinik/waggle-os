# LOCKED — Gate D Deviation Adjudication Option A Ratified

**Date**: 2026-04-24
**Ratified by**: Marko Marković
**PM**: claude-opus-4-7 (Cowork)

## Odluka

**Option A ACCEPT** — Gemini 3.1 Pro Tier 2 upgrade kao primary resolution za Gate D deviation halt. Manifest v4 anchor `dedd698` ostaje validan ex-ante lock. Code freeze HEAD `373516c` nepromenjen.

## Uslovi

Tri blocker prerequisites pre N=400 re-kick-a ratifikovani kao non-negotiable:

1. **Lock semantics clarification memo** (Path L-1 preferred, L-2 fallback sa manifest v5 trigger)
2. **Runner early-exit RCA memo** (tech-debt preferred, patch-required triggers manifest v5)
3. **Gate P+ pre-flight probe** (50 Gemini calls u 30s, 0 × 429 required)

Sva tri moraju biti PM-ratifikovana pre re-kick autorizacije.

## Billing state

- Account: Egzakta (ID 01DBA5-921E58-9DAF46)
- Tier: **Tier 2 LIVE** 2026-04-24
- Credit balance: $63.20
- Visa ending 7475, postpay mode

## Odbačene opcije

- C (judge swap) → §5.2 break
- D (token-bucket limiter) → code-freeze break
- E (Promise.allSettled + quorum) → code-freeze + §5.2 break
- G (no-op) → bad EV

## Fallback

- **Option B** (manifest v5, concurrency=1, ~16h wall-clock) ako bilo koji prerequisite pokrene manifest v5 trigger
- **Option F** (stop at Gate C, publish sa caveats) kao last-resort

## Carry-over

Task 2.6 entries:
- Subject-only per-cell budget gap (`runner.ts:396`, `line 428`)
- Judge-ensemble defensive error handling (Promise.allSettled + quorum, ako RCA potvrdi "isključivo 429")
- Runner-lock race permanent fix (ako §1.1 Path L-1 prođe waiver)
- Gate P+ probe template (reusable pre-flight check)

## Reference

- Brief: `briefs/2026-04-24-cc-task25-stage3-rekick-option-a.md`
- Deviation halt: `sessions/2026-04-24-task25-stage3-n400-deviation-halt.md`
- Manifest v4 MD: `D:\Projects\waggle-os\benchmarks\results\manifest-v4-preregistration.md`
- Manifest v4 YAML: `D:\Projects\waggle-os\benchmarks\results\manifest-v4-preregistration.yaml`
