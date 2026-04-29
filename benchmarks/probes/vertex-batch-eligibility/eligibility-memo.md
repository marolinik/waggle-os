# Vertex AI Batch Eligibility Probe — gemini-3.1-pro-preview

**Date:** 2026-04-24 · **Target:** PM-RATIFY-VERTEX-BATCH-ELIGIBILITY gate · **Budget actual:** <$0.02 (control job only).

## Verdict: **INFEASIBLE**

`publishers/google/models/gemini-3.1-pro-preview` exists in the Vertex
publisher catalog (REST `GET /v1/publishers/google/models/gemini-3.1-pro-
preview` with `X-Goog-User-Project: gen-lang-client-0674908699` → **HTTP
200**) but is **NOT** registered for Batch Prediction. SDK
`vertexai.batch_prediction.BatchPredictionJob.submit(source_model=…)`
returns `NotFound: 404 The PublisherModel gemini-3.1-pro-preview does not
exist.` on both bare name and fully-qualified forms.

## Control proof (plumbing OK)

Identical SDK path with `source_model="gemini-2.5-flash"` submitted
successfully: `projects/565729498549/locations/us-central1/
batchPredictionJobs/7779966002640453632` (state=PENDING). Vertex Batch
maintains a batch-eligibility registry distinct from the publisher
catalog; Gemini 3.1 Pro Preview is absent from the former.

## SDK versions (audit)

`google-cloud-aiplatform 1.148.1`, `google-cloud-storage 3.10.1`,
Python 3.11.9.

## Consequence

Branch A (§1.3e fallback) closed. Stage 3 re-kick remains gated on
Google quota ticket. Re-probe when Google adds 3.1 Pro Preview to batch
registry; monitor Vertex release notes.
