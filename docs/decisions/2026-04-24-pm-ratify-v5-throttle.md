# LOCKED — PM-RATIFY-V5-THROTTLE Verdict, §1.3c PASS

**Date**: 2026-04-24
**Ratified by**: Marko Marković (via PM adjudication)
**PM**: claude-opus-4-7 (Cowork)
**Prerequisite gate**: §1.3b IN_SCOPE → P4 path → manifest v5 emit + §1.3c throttle verification

## Odluka

**§1.3c PASS ACCEPT** — manifest v5 emit zatvoren, throttle probe v2 zatvoren, naming reconciliation i sibling alias defensive sweep apsorbovani u v5 audit trail. CC-1 može da napreduje na §1.3e RPD feasibility check kao naredni sub-gate (uvedeno post-§1.3c jer se 250 RPD per-project ceiling pojavio late-stage tokom Marko discovery-ja u GCP Console).

## Manifest v5 emission

- Anchor: `fc16925`
- MD SHA: `9062b9f5...`
- YAML SHA: `b4dc90cb...`
- Predecessor: manifest v4 anchor `dedd698` (immutable, audit-record only)
- Throttle declaration: `rpm: 20` na `gemini-3.1-pro` alias eksplicitno u v5 §0.5 delta log + §5.x ops-config sekcija
- Concurrency control: `concurrency: 1` declared

## §1.3c throttle probe v2 results

- 30 calls u 90s window-u, clean foreground kickoff
- 30/30 HTTP 200, 0 × 429
- Wall-clock: 99.5s (probe target ≤90s + drift acceptable)
- Commit: `3a146ef`
- Log SHA: `429ec2ee...`
- Memo SHA: `c48efee...`

**Verdict**: rpm:20 throttle empirically validated. LiteLLM-side rate limiter funkcioniše per-alias kako je manifest v5 deklarisao.

## Fold-in 3.5a — naming reconciliation

PM brief (originalno) referencirao `gemini-3.1-pro-preview` (upstream model name). CC-1 implementacija primenila rpm:20 na `gemini-3.1-pro` alias (CLI-used). Oba route-uju na isti upstream `gemini/gemini-3.1-pro-preview`.

**Verdict**: internally consistent (alias → upstream mapping je 1:1). Reconciliation dokumentovan u manifest v5 §0.5 delta log:
- Brief notation: upstream model name
- Implementation notation: alias name (CLI-used by runner)
- Both refer to same physical endpoint

Commit `e5696f4`, new MD SHA `dcbc5da0...`.

## Fold-in 3.5b — sibling alias defensive sweep

Risk identified: `gemini-3.1-pro-preview` alias (sibling, not edited) je expose-ovan — bilo koji non-Stage-3 caller na tom aliasu bi exhausted shared upstream 25 RPM pool tokom Stage 3 run-a.

Defensive grep sweep result:
- 7 unique files sa references na sibling alias
- 0 active callers
- Reference loci: `models.json:122` (OpenRouter-bucket fallback config, dormant), tests, eval scripts, Tauri bundle, dokumentacija
- SHA: `f13893d5...`, 276 lines

Defensive remediation: CC-1 mirror-edit na `gemini-3.1-pro-preview` alias (rpm:20 applied) regardless of zero active callers, kao belt-and-suspenders pattern. Commit `d0ab680`.

**Verdict**: PRECAUTION ACCEPT. Cost = 0 (alias unused), benefit = guaranteed isolation čak i ako se neki future code-path probudi tokom Stage 3 window-a.

## Parent commit chain (since v4 anchor `dedd698`)

```
fc16925  v5 anchor (MD/YAML pre-registration)
ad324cc  Step 2 primary rpm:20 (gemini-3.1-pro alias)
3a146ef  §1.3c probe v2 PASS (30/30 HTTP 200)
e5696f4  Fold-in 3.5a alias naming reconciliation
d0ab680  Fold-in 3.5b sibling alias defensive mirror
```

5 commits od v4. HEAD `373516c` izmenjen samo na litellm-config.yaml + manifest v5 emit + probe artefakti — sve pod v5 authority.

## Posledice za Task #29

- §1.1 Path L-1 ✓
- §1.2 Task 2.6 path ✓
- §1.3 FAIL → §1.3b IN_SCOPE ✓ → §1.3c PASS ✓
- §1.3e RPD feasibility introduced kao naredni sub-gate (250 RPD discovery)
- GATE-D-REKICK-GO blocked until §1.3e ratifikacija + (Google approval ako INFEASIBLE)

## Odbacivanja

- **rpm:15 ili niže**: nije potrebno; 30/30 PASS @ rpm:20 znači da imamo 25% headroom ispod Google 25 RPM hard cap-a. Dalja redukcija bi povećala wall-clock bez benefita.
- **Probe v3 (60 calls / 180s)**: probe v2 sufficient kao validation; dalji probe troši Google quota bez incremental information gain-a.
