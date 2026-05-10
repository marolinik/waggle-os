# CC-1 Brief — Vertex AI Batch Prediction Eligibility Probe za `gemini-3.1-pro-preview`

**Date**: 2026-04-24
**Status**: §1.3f sub-gate, paralelno čekanju Google quota ticket-a
**Authorized by**: Marko Marković (2026-04-24 evening)
**Predecessor**: §1.3e PM-RATIFY-V5-RPD strict hold + 48h fallback Branch A activated kao discovery
**PM**: claude-opus-4-7 (Cowork)

---

## §0 Kontekst i scope guard

Stage 3 N=400 re-kick blokiran zbog Google `gemini-3.1-pro-preview` per-project 250 RPD ceiling-a. Quota approval ticket pending; nema garancije da će proći u 48h. Marko odbacio P8 multi-project (audit/ToS rizik) i prompt-level batching (κ + §5.2 break).

Branch A iz §1.3e fallback plana: **Vertex AI Batch Prediction API**. Provider-side asinhrono batch (24h SLA, ~50% cost, separate quota pool) koji bi zaobišao 250 RPD ceiling kompletno **ako** preview model podržava batch mode. Empirically unverified.

Ovaj brief autorizuje **eligibility probe**, ne batch implementation. Probe rezultat informiše dalji put: ako eligible → manifest v6 proposal za Gemini cell rerouting; ako ne eligible → ostajemo na Google quota ticket waiting + Branch B pripravnost.

### Strict scope guards (non-negotiable)

- **Manifest v5 ostaje immutable** (anchor `fc16925`). Probe ne emituje v6, ne menja v5 §0.5 delta log, ne dodaje deklaracije.
- **HEAD `373516c` + 7 commits od v4 anchor-a ostaju nedirnuti** osim dodavanja probe scripta + JSONL fixture-a + log artefakata u `benchmarks/probes/vertex-batch-eligibility/` direktorijumu (novi folder, izvan §11 frozen paths).
- **Nema novog Vertex adapter-a u runner-u, judge-runner-u, ili LiteLLM config-u.** Probe je samostalan Python ili Node script koji direktno priča sa Vertex AI API-jem; ne ulazi u benchmark execution path.
- **Nema modifikacije `litellm-config.yaml`, `runner.ts`, `failure-mode-judge.ts`, `health-check.ts`** (sve u §11 frozen paths).
- Ako probe success → CC-1 ulazi u HALT i emituje halt ping sa "VERTEX_BATCH_ELIGIBLE — manifest v6 proposal authorization tražim". PM odlučuje da li da emituje brief za v6.
- Ako probe fail → CC-1 ulazi u HALT sa "VERTEX_BATCH_INFEASIBLE — vraćam se na waiting Google ticket". PM ažurira §1.3e branch matrix.

---

## §1 Marko prerequisites (pre CC-1 izvršenja)

CC-1 ne počinje pre nego što su oba zatvorena. Marko će ih izvesti i confirm-ovati u chat-u.

### §1.1 Vertex AI API enable na GCP projektu

GCP Console → APIs & Services → Library → "Vertex AI API" → Enable. Projekat: isti pod kojim je `generativelanguage.googleapis.com` već enabled (Egzakta account 01DBA5-921E58-9DAF46).

Verifikacija: `gcloud services list --enabled --filter="aiplatform.googleapis.com"` ili UI confirmation.

### §1.2 Authentication setup

Vertex AI ne koristi AI Studio API key; treba Service Account credentials ili Application Default Credentials (ADC).

**Preporučeni put** (manje friction):
- `gcloud auth application-default login` u Marko-vom shell-u → kreira ADC u `~/.config/gcloud/application_default_credentials.json`
- CC-1 koristi ADC bez explicit credential file path-a

**Alternativni put** (ako Marko preferira service account):
- Console → IAM & Admin → Service Accounts → Create → grant role "Vertex AI User"
- Generate JSON key, download, predaj path-om CC-1 (ne paste-uj sadržaj u chat)

Verifikacija: `gcloud auth application-default print-access-token` vrati token bez error-a.

---

## §2 Probe specifikacija

### §2.1 Sample input

5 instances iz already-generated Stage 3 fixtures (canonical SHA dataset, ne menja se ništa). Fixture izvor: `benchmarks/datasets/locomo-mini-N400-canonical.jsonl` ili ekvivalentni Stage 3 frozen fixture file. Uzeti prvih 5 records sequential, kopirati u `benchmarks/probes/vertex-batch-eligibility/probe-input.jsonl` u **Vertex Batch JSONL request format**:

```jsonl
{"request": {"contents": [{"role": "user", "parts": [{"text": "<judge prompt + LoCoMo instance>"}]}], "generationConfig": {"temperature": 0.0}}}
```

Format reference: `https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/batch-prediction-api` (verify exact schema; preview model schema may differ from GA).

Judge prompt: identičan onome koji `failure-mode-judge.ts:245-258` šalje kroz LiteLLM ka `gemini-3.1-pro` aliasu. Ne menjaj prompt template — koristi verbatim copy iz koda kao string literal u probe scriptu.

### §2.2 Submission

- **Endpoint**: Vertex AI BatchPredictionJobs.create
- **Model identifier**: `publishers/google/models/gemini-3.1-pro-preview` (verify exact preview model namespace u Vertex catalog; može biti drugačije od AI Studio alias-a)
- **Region**: `us-central1` (default Vertex region; verify availability)
- **Input**: GCS bucket upload prepared JSONL (Vertex Batch zahteva GCS, ne local file). Marko mora da omogući GCS bucket ako već nema — to je deo §1.1 ako probe Marko-au javi missing-bucket error.
- **Output**: GCS prefix za output JSONL

**Implementation skeleton** (Python sa `google-cloud-aiplatform` SDK preferiran zbog cleaner Vertex Batch API; Node alternativa OK ako CC-1 preferira jezik consistency sa benchmark stack-om):

```python
from google.cloud import aiplatform
aiplatform.init(project="<project-id>", location="us-central1")
job = aiplatform.BatchPredictionJob.create(
    job_display_name="locomo-mini-vertex-batch-eligibility-probe-2026-04-24",
    model_name="publishers/google/models/gemini-3.1-pro-preview",
    instances_format="jsonl",
    gcs_source="gs://<bucket>/probe-input.jsonl",
    gcs_destination_prefix="gs://<bucket>/probe-output/",
    predictions_format="jsonl",
)
```

### §2.3 Monitoring

Job se izvršava asinhrono (Vertex SLA: do 24h za batch job, često brže). CC-1 polluje job state svakih 60s do max 90 min wall-clock (rana terminacija ako "PIPELINE_STATE_FAILED" sa explicit "model not supported in batch mode" error → ne čeka 24h).

Log u `benchmarks/probes/vertex-batch-eligibility/job-state-trace.log` sa timestamp + state + (ako fail) error message verbatim.

Ako 90 min protekne bez completion ili explicit error → CC-1 ne čeka dalje, vraća halt ping sa "INCONCLUSIVE — long-running, vraćam se kasnije" i Marko odlučuje da li da pomeri max wall-clock.

### §2.4 Success criteria

**ELIGIBLE** (probe PASS):
- Job state = "JOB_STATE_SUCCEEDED" u <90 min
- Output JSONL u GCS sa 5 valid responses (JSON parseable, sadrže `candidates[0].content.parts[0].text` sa judge score format-om)
- 0 errors u response payloads

**INFEASIBLE** (probe FAIL):
- Job state = "JOB_STATE_FAILED" sa error message koji eksplicitno spominje preview/unsupported/batch-mode-not-available
- Validation fail: response responses but malformed (judge score parse fail) → root cause moguće različit, escaliraj u halt ping ne kao definitivan FAIL

**INCONCLUSIVE**:
- 90 min timeout bez state promene
- Auth/permission errors (Marko prereq fault, ne preview model fault)
- GCS bucket setup errors

---

## §3 Deliverables

CC-1 commit-uje sledeće u `feature/c3-v3-wrapper` branch posle probe-a (regardless of outcome):

1. `benchmarks/probes/vertex-batch-eligibility/probe-script.py` (ili `.ts`) — probe code sa inline comments
2. `benchmarks/probes/vertex-batch-eligibility/probe-input.jsonl` — 5-instance JSONL request
3. `benchmarks/probes/vertex-batch-eligibility/job-state-trace.log` — polling timeline
4. `benchmarks/probes/vertex-batch-eligibility/job-output.jsonl` (ako success) — Vertex Batch output JSONL preuzet iz GCS
5. `benchmarks/probes/vertex-batch-eligibility/eligibility-memo.md` — ≤150 reči summary sa explicit verdict (ELIGIBLE / INFEASIBLE / INCONCLUSIVE), key error messages verbatim, cost actual

Anchor commit message: `[probe] vertex batch eligibility for gemini-3.1-pro-preview - <verdict>`. SHA-256 hash svih artefakata u halt ping-u.

---

## §4 Halt ping format

Po završetku (success/fail/inconclusive), CC-1 emituje halt ping sa:

- `verdict: ELIGIBLE | INFEASIBLE | INCONCLUSIVE`
- `anchor_commit: <sha>`
- `artefact_shas: {script, input, log, output, memo}`
- `wall_clock: <duration>`
- `cost_actual: $<actual> (vs $0.05 budget)`
- `key_errors: <verbatim>` ako fail
- `next_step_request: PM-RATIFY-VERTEX-BATCH-ELIGIBILITY`

CC-1 ne self-advances. Ne emituje manifest v6 proposal. Ne menja runner. Čeka PM ratifikaciju.

---

## §5 Budget i halt criteria

- **Budget**: $0.05 cap. Vertex Batch pricing za Gemini 3.1 Pro Preview ≈ $1.25 input / $5.00 output per 1M tokens (50% off standard). 5 instances × ~3K tokens combined ≈ negligible. Job orchestration cost = $0.
- **GCS storage**: trivial (5 small JSONL files, <1 MB total). Nema material cost.
- **Halt @ $0.10**: ako bilo koji unexpected billing trigger pokazuje > $0.10 actual spend → halt + escalate.

---

## §6 Rollback / cleanup

Probe artefacts ostaju u repo-u kao audit trail (folder `benchmarks/probes/vertex-batch-eligibility/`) regardless of outcome. GCS bucket sa input/output JSONL-ovima može da se obriše posle probe-a (Marko discretion — opcioni `gcloud storage rm` posle 7 dana).

---

## §7 Task #29 trace update

Posle CC-1 halt ping-a, PM update:
- §1.3f Vertex Batch eligibility probe: <verdict>
- Branch A (Vertex Batch): activated / retracted u §1.3e fallback matrix
- Google ticket waiting: continues parallel
- N=400 re-kick: ostaje blocked do (Google approval) ili (Vertex Batch ELIGIBLE + manifest v6 emitted + ratified)

---

## §8 Authorized by

PM Marko Marković, 2026-04-24 evening, response na "ajde opcija a".

CC-1 može da počne čim Marko potvrdi §1.1 + §1.2 (Vertex AI API enabled + ADC ili SA setup verified).
