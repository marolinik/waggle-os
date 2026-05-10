# LOCKED — PM-RATIFY-VERTEX-BATCH-ELIGIBILITY Verdict, INFEASIBLE ACCEPT, Branch A CLOSED

**Date**: 2026-04-24
**Ratified by**: Marko Marković (via PM adjudication)
**PM**: claude-opus-4-7 (Cowork)
**Prerequisite gate**: §1.3e strict hold → §1.3f Branch A activation → Vertex AI Batch Prediction eligibility probe
**Probe cost**: $0.02 (under $0.05 cap)

## Odluka

**INFEASIBLE ACCEPT** — `gemini-3.1-pro-preview` nije u Vertex AI Batch Prediction registry-ju, iako jeste u publisher catalog-u. Branch A (Vertex Batch rerouting za Gemini cell) **CLOSED permanently** dok Google ne promeni product posture za preview modele. §1.3e fallback matrix redukovana na jedan aktivni branch (B).

## Evidence chain

CC-1 probe (anchor `8ad0567`, 9-commit parent chain od v4 anchor-a `dedd698`) tri data points:

1. **REST GET publisher catalog HTTP 200** — model postoji u opštem catalog-u.
2. **SDK BatchPredictionJob.submit() 404** na oba naming forma (`gemini-3.1-pro-preview` i `publishers/google/models/gemini-3.1-pro-preview`). Error message: `The PublisherModel gemini-3.1-pro-preview does not exist.`
3. **Control test: `gemini-2.5-flash` submit PENDING state** (job ID `7779966002640453632`) kroz identičnu SDK plumbing. Control pokazuje da plumbing radi; rejection je model-specific.

Interpretacija: Vertex Batch maintain-uje separate registry od publisher catalog-a. Preview modeli su u potonjem, odsutni iz prvog. Error message je semantički misleading ("does not exist") ali operativno jasan: not batch-enabled.

## Scope discipline

CC-1 ispoštovao sve guards:
- §11 frozen paths netaknuti (runner, judge-runner, failure-mode-judge, health-check, litellm-config.yaml)
- Manifest v5 anchor `fc16925` intact, NO v6 emission
- Ne Vertex adapter u benchmark execution path-u
- Samo `benchmarks/probes/vertex-batch-eligibility/` + `.gitignore` + `.gitattributes` modifikovani (doc-infra additions za probe artefact pass-through + LF pin)
- NO N=400 kick attempted
- pip install `google-cloud-aiplatform google-cloud-storage` — pre-authorized one-off, versions logged u memo-u

Artefakt SHAs LF-pinned:
- script: `4c30d25e...`
- input: `2c90f83b...`
- log: `5ef76b46...`
- memo: `f3c0a747...`
- output: NOT CREATED (correct under INFEASIBLE)

## Posledice za §1.3e fallback matrix

Bila: tri branka (A — Vertex Batch; B — manifest v6 reduced; C — P8 multi-project).
Sad: jedan aktivni branch (B).

- **Branch A (Vertex Batch)**: CLOSED. Preview model ne eligible. Future: kada `gemini-3.1-pro-preview` promoted u GA, batch eligibility tipično sledi. Strategic signal za kalendar, ne immediate action.
- **Branch B (Manifest v6 reduced Gemini coverage)**: STANDBY. Aktivacija samo ako Google quota ticket ne stigne do 2026-04-26 18:00 CET.
- **Branch C (P8 multi-project)**: već odbačen pre §1.3f (audit/ToS rizik).

## Matrix binary sada

1. **Google approval ≤48h** → GATE-D-REKICK-GO sa pre-flight sequence (gcloud quota verify + probe v3 + N=400 kick). Manifest v5 path po planu.
2. **Google ne-approval @ 48h checkpoint** → Branch B pivot = manifest v6 proposal brief (Gemini judge samo na primary hypothesis cells, ~800 calls umesto 2005; Opus+GPT duo nosi sekundarne cells; small κ re-validation $15-30).

## Nus-produkt (permanent retention)

gcloud SDK + ADC na CC-1 hostu ostaje operational za §1.3e GATE-D-REKICK-GO Step 1 (`gcloud alpha services quota list`). Python SDK-ovi (`google-cloud-aiplatform`, `google-cloud-storage`) ostaju za eventualne buduće Vertex potrebe. P-A1 investicija (~15 min) trajno korisna, ne propada sa Branch A retraction-om.

GCS bucket `egzakta-vertex-batch-probe-2026-04` ostaje u projektu `gen-lang-client-0674908699`; trivial storage cost, Marko discretion da obriše posle 7 dana.

## Parent commit chain

```
fc16925  v5 anchor (MD/YAML pre-registration)
ad324cc  Step 2 primary rpm:20 (gemini-3.1-pro alias)
3a146ef  §1.3c probe v2 PASS (30/30 HTTP 200)
e5696f4  Fold-in 3.5a alias naming reconciliation
d0ab680  Fold-in 3.5b sibling alias defensive mirror
1d3851d  §1.3e RPD feasibility memo
8ad0567  §1.3f Vertex Batch eligibility probe INFEASIBLE
```

8 commits (tačno) od v4 anchor `dedd698`. HEAD intact. Zero N=400 calls executed.

## Task #29 progress

- §1.1 Path L-1 ✓
- §1.2 Task 2.6 path ✓
- §1.3 FAIL → §1.3b IN_SCOPE ✓
- §1.3c PASS ✓
- §1.3e RPD strict hold ✓
- §1.3f Vertex Batch INFEASIBLE ✓ → Branch A CLOSED
- **GATE-D-REKICK-GO blocked**: Google quota approval pending
- **48h checkpoint**: 2026-04-26 18:00 CET → Branch B activation if no approval

## CC-1 state

HALTED. Awaiting either:
(a) Marko ping "Google approval confirmed" → PM emituje GATE-D-REKICK-GO brief sa pre-flight sequence-om;
(b) Marko ping "48h timeout" @ 2026-04-26 18:00 → PM emituje manifest v6 proposal brief za Branch B.

## Odbacivanja

- **Retry na different region** (npr. europe-west4 umesto us-central1): rejection je model-specific not region-specific; control test prošao u us-central1, isti plumbing radi.
- **Workaround kroz batch-eligible substitute model** (Gemini 2.5 Pro batch): §5.2 consistency_constraint break + judge ensemble quality degradation. Odbačeno kao i P3 ranije.
- **Retry za 24h**: Google batch registry promene sa GA promotion-om, ne na dnevnoj osnovi. Čekanje je bez merit-a.
