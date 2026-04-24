"""
Vertex AI Batch Prediction Eligibility Probe - gemini-3.1-pro-preview
=====================================================================

§1.3f per PM-RATIFY-V5-RPD fallback Branch A (2026-04-24).

Empirical question: does `publishers/google/models/gemini-3.1-pro-preview`
accept Vertex Batch Prediction? If ELIGIBLE, unlocks an async path that
sidesteps the 25 RPM online per-model cap (§1.3 probe root cause) and
the current 250 RPD ceiling.

Scope discipline:
  - No §11 frozen path touched (no runner, no judge-runner, no litellm-
    config.yaml, no failure-mode-judge.ts).
  - No benchmark adapter. Self-contained standalone script.
  - All artefacts emitted to `benchmarks/probes/vertex-batch-eligibility/`.

Execution:
  1. Build 5-instance Vertex Batch JSONL from the canonical LoCoMo fixture.
  2. Upload to GCS.
  3. Submit BatchPredictionJob via the newer Gemini `submit()` surface
     (vertexai.batch_prediction), with fallback to the legacy
     `aiplatform.BatchPredictionJob.create()` if submit is unavailable
     or rejects the preview model.
  4. Poll up to `initial_poll_seconds` (default 450s = 7.5 min, within
     Bash 10-min timeout). On INCOMPLETE, emit resume-ready job name for
     a follow-up invocation with --resume <job_name>.

Usage:
  python probe-script.py                 # fresh submit + poll
  python probe-script.py --resume <jrn>  # poll-only resume of running job

Judge prompt: verbatim reproduction of
`packages/server/src/benchmarks/judge/failure-mode-judge.ts:93-140`
(buildJudgePrompt). Identical to §1.3 + §1.3c probe payload so any
eligibility difference is routing, not prompt content.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

# ── Bound parameters (all from PM direktiva; no placeholders) ─────────────

PROJECT_ID = "gen-lang-client-0674908699"
LOCATION = "us-central1"
GCS_BUCKET = "egzakta-vertex-batch-probe-2026-04"
GCS_INPUT = f"gs://{GCS_BUCKET}/probe-input.jsonl"
GCS_OUTPUT_PREFIX = f"gs://{GCS_BUCKET}/probe-output/"
MODEL_ID = "publishers/google/models/gemini-3.1-pro-preview"
JOB_DISPLAY_NAME = "locomo-mini-vertex-batch-eligibility-probe-2026-04-24"

FIXTURE_PATH = Path("D:/Projects/waggle-os/benchmarks/data/locomo/locomo-1540.jsonl")
PROBE_DIR = Path("D:/Projects/waggle-os/benchmarks/probes/vertex-batch-eligibility")
LOG_PATH = PROBE_DIR / "job-state-trace.log"
INPUT_PATH = PROBE_DIR / "probe-input.jsonl"
OUTPUT_PATH = PROBE_DIR / "job-output.jsonl"

TERMINAL_STATES = {
    "JobState.JOB_STATE_SUCCEEDED",
    "JobState.JOB_STATE_FAILED",
    "JobState.JOB_STATE_CANCELLED",
    "JobState.JOB_STATE_EXPIRED",
}

# Verbatim from failure-mode-judge.ts:93-140 (buildJudgePrompt).
JUDGE_PROMPT_TEMPLATE = "\n".join([
    "You are evaluating whether an LLM's answer is correct against ground truth.",
    "",
    "## Question",
    "{question}",
    "",
    "## Ground-truth answer",
    "{ground_truth}",
    "",
    "## Ground-truth supporting context (excerpt shown to the model)",
    "{context}",
    "",
    "## Model's answer",
    "{model_answer}",
    "",
    "## Your task",
    "",
    "Step 1: Determine if the model's answer is correct.",
    "- \"correct\" means the model's answer contains all required facts from ground truth, with no additional incorrect claims.",
    "- Minor phrasing differences, synonyms, or alternative but equivalent formulations are acceptable.",
    "- Extra detail is acceptable ONLY if it is factually correct.",
    "",
    "Step 2: If incorrect, assign exactly one failure mode using this decision tree:",
    "",
    "1. Does the model explicitly refuse or say it does not know? ->F1 (ABSTAIN)",
    "2. Does the model answer a DIFFERENT question than was asked (coherent but off-topic)? ->F5 (OFF-TOPIC)",
    "3. Does the model rely on entities, names, dates, or claims that do NOT appear in the ground-truth context (fabrication)? ->F4 (HALLUCINATED)",
    "4. Does the model correctly state SOME required facts but miss others, without stating any incorrect facts? ->F2 (PARTIAL)",
    "5. Otherwise (model states facts derived from the context but gets them wrong): ->F3 (INCORRECT)",
    "",
    "Step 3: Return JSON only, no prose, in this exact schema:",
    "",
    "{{",
    "  \"verdict\": \"correct\" | \"incorrect\",",
    "  \"failure_mode\": null | \"F1\" | \"F2\" | \"F3\" | \"F4\" | \"F5\",",
    "  \"rationale\": \"one sentence explaining the verdict\"",
    "}}",
    "",
    "If verdict is \"correct\", failure_mode MUST be null.",
    "If verdict is \"incorrect\", failure_mode MUST be one of F1-F5.",
])


def ts() -> str:
    return datetime.now(timezone.utc).isoformat()


# Windows cp1252 stdout chokes on Unicode arrows; reconfigure once at import.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def logline(text: str) -> None:
    line = f"{ts()} {text}"
    try:
        print(line, flush=True)
    except UnicodeEncodeError:
        print(line.encode("ascii", errors="replace").decode("ascii"), flush=True)
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def build_input_jsonl() -> int:
    PROBE_DIR.mkdir(parents=True, exist_ok=True)
    count = 0
    with FIXTURE_PATH.open("r", encoding="utf-8") as f, INPUT_PATH.open("w", encoding="utf-8") as g:
        for line in f:
            if count >= 5:
                break
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            prompt = JUDGE_PROMPT_TEMPLATE.format(
                question=rec["question"],
                ground_truth=rec.get("gold_answer", ""),
                context=rec.get("context", ""),
                model_answer="unknown",
            )
            # Vertex Batch JSONL request shape for Gemini models.
            req = {
                "request": {
                    "contents": [
                        {"role": "user", "parts": [{"text": prompt}]},
                    ],
                    "generationConfig": {"temperature": 0.0, "maxOutputTokens": 512},
                }
            }
            g.write(json.dumps(req, ensure_ascii=False) + "\n")
            count += 1
    return count


def upload_to_gcs(local_path: Path, gcs_uri: str) -> None:
    from google.cloud import storage
    assert gcs_uri.startswith("gs://")
    rest = gcs_uri[len("gs://"):]
    bucket_name, _, blob_name = rest.partition("/")
    client = storage.Client(project=PROJECT_ID)
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(blob_name)
    blob.upload_from_filename(str(local_path))
    logline(f"[upload] {local_path} ->{gcs_uri} ({local_path.stat().st_size} bytes)")


def download_first_output_jsonl(gcs_prefix: str, local_path: Path) -> int:
    from google.cloud import storage
    assert gcs_prefix.startswith("gs://")
    rest = gcs_prefix[len("gs://"):]
    bucket_name, _, prefix = rest.partition("/")
    client = storage.Client(project=PROJECT_ID)
    bucket = client.bucket(bucket_name)
    rows = 0
    with local_path.open("w", encoding="utf-8") as out:
        for blob in client.list_blobs(bucket, prefix=prefix):
            if blob.name.endswith(".jsonl") or "predictions" in blob.name:
                data = blob.download_as_text()
                out.write(data)
                rows += sum(1 for line in data.splitlines() if line.strip())
                logline(f"[download] {blob.name} ->{local_path} ({len(data)} bytes)")
    return rows


def submit_via_preview_api(model_variant: str) -> object | None:
    """Try the Gemini-native BatchPredictionJob.submit() API with a given
    model identifier form. The SDK may want bare name (`gemini-3.1-pro-
    preview`) vs fully-qualified (`publishers/google/models/gemini-3.1-pro-
    preview`); caller loops through variants."""
    try:
        import vertexai
        from vertexai.batch_prediction import BatchPredictionJob
    except ImportError as e:
        logline(f"[submit:preview:{model_variant}] ImportError {e}")
        return None
    try:
        vertexai.init(project=PROJECT_ID, location=LOCATION)
        job = BatchPredictionJob.submit(
            source_model=model_variant,
            input_dataset=GCS_INPUT,
            output_uri_prefix=GCS_OUTPUT_PREFIX,
            job_display_name=JOB_DISPLAY_NAME,
        )
        logline(f"[submit:preview:{model_variant}] OK job_resource_name={job.resource_name}")
        return job
    except Exception as e:
        logline(f"[submit:preview:{model_variant}] ERROR {type(e).__name__}: {str(e)[:500]}")
        return None


def submit_via_legacy_api() -> object | None:
    """Fall back to the legacy aiplatform.BatchPredictionJob.create() API."""
    try:
        from google.cloud import aiplatform
    except ImportError as e:
        logline(f"[submit:legacy] ImportError {e}")
        return None
    try:
        aiplatform.init(project=PROJECT_ID, location=LOCATION)
        job = aiplatform.BatchPredictionJob.create(
            job_display_name=JOB_DISPLAY_NAME,
            model_name=MODEL_ID,
            instances_format="jsonl",
            gcs_source=GCS_INPUT,
            gcs_destination_prefix=GCS_OUTPUT_PREFIX,
            predictions_format="jsonl",
            sync=False,
        )
        logline(f"[submit:legacy] OK - job_resource_name={job.resource_name}")
        return job
    except Exception as e:
        logline(f"[submit:legacy] ERROR {type(e).__name__}: {str(e)[:500]}")
        return None


def poll_until_terminal(job, max_seconds: int, cadence_s: int = 60) -> str:
    t0 = time.time()
    last_state = None
    while time.time() - t0 < max_seconds:
        try:
            # Refresh from Vertex.
            job._sync_gca_resource()
        except Exception as e:
            logline(f"[poll] sync error {type(e).__name__}: {str(e)[:200]}")
        state = str(job.state) if hasattr(job, "state") else "UNKNOWN"
        if state != last_state:
            logline(f"[poll] t+{int(time.time()-t0):>4}s state={state}")
            last_state = state
        if state in TERMINAL_STATES:
            return state
        time.sleep(cadence_s)
    logline(f"[poll] INCOMPLETE after {max_seconds}s - state={last_state}")
    return "INCOMPLETE"


def resume_job(resource_name: str):
    """Re-attach to an existing BatchPredictionJob by its resource name."""
    logline(f"[resume] reattaching to {resource_name}")
    try:
        from vertexai.batch_prediction import BatchPredictionJob as PreviewBPJ
        import vertexai
        vertexai.init(project=PROJECT_ID, location=LOCATION)
        return PreviewBPJ(resource_name)
    except Exception as e:
        logline(f"[resume:preview] fail {type(e).__name__}: {e}")
    try:
        from google.cloud import aiplatform
        aiplatform.init(project=PROJECT_ID, location=LOCATION)
        return aiplatform.BatchPredictionJob(resource_name)
    except Exception as e:
        logline(f"[resume:legacy] fail {type(e).__name__}: {e}")
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--resume", default=None, help="resource_name of an already-submitted BPJ")
    ap.add_argument("--max-seconds", type=int, default=450, help="max wall-clock in poll loop")
    args = ap.parse_args()

    logline(f"[probe] START - PROJECT={PROJECT_ID} LOCATION={LOCATION} MODEL={MODEL_ID}")

    # Package version stamp for audit.
    try:
        import google.cloud.aiplatform as aip
        import google.cloud.storage as gcs
        logline(f"[probe] sdk versions: aiplatform={aip.__version__} storage={gcs.__version__}")
    except Exception:
        logline("[probe] sdk version stamp failed")

    if args.resume:
        job = resume_job(args.resume)
        if job is None:
            logline("[probe] resume failed - exit 2")
            return 2
    else:
        # Phase 1: build input.
        n = build_input_jsonl()
        logline(f"[build] wrote {n} requests to {INPUT_PATH}")

        # Phase 2: upload.
        try:
            upload_to_gcs(INPUT_PATH, GCS_INPUT)
        except Exception as e:
            logline(f"[upload] FATAL {type(e).__name__}: {str(e)[:500]}")
            logline("[probe] VERDICT=INCONCLUSIVE reason=gcs_upload_fail")
            return 3

        # Phase 3: submit. Try model-ID variants in order (SDK preferences
        # vary — bare name vs fully-qualified). The Vertex publisher catalog
        # GET confirmed `gemini-3.1-pro-preview` exists at HTTP 200; if all
        # variants via the SDK still 404, that's evidence of
        # "model exists but batch-prediction not enabled for it" -> INFEASIBLE.
        model_variants = [
            "gemini-3.1-pro-preview",                         # bare name
            "publishers/google/models/gemini-3.1-pro-preview", # fully-qualified
        ]
        job = None
        for variant in model_variants:
            job = submit_via_preview_api(variant)
            if job is not None:
                break
        if job is None:
            logline("[submit:preview] all variants exhausted; trying legacy API")
            job = submit_via_legacy_api()
        if job is None:
            logline("[probe] SUBMISSION FAILED on all preview model variants + legacy API")
            logline("[probe] VERDICT=INFEASIBLE reason=submission_rejected_all_variants")
            return 4

    # Phase 4: poll.
    final_state = poll_until_terminal(job, max_seconds=args.max_seconds)
    logline(f"[probe] TERMINAL_STATE={final_state} job_resource_name={job.resource_name}")

    if final_state == "INCOMPLETE":
        logline(f"[probe] RESUMABLE - re-run with: python probe-script.py --resume {job.resource_name}")
        logline("[probe] VERDICT=PARTIAL_PENDING wall_clock_exhausted")
        return 5

    # Phase 5: classify.
    if final_state == "JobState.JOB_STATE_SUCCEEDED":
        logline("[probe] downloading output JSONL(s)...")
        rows = download_first_output_jsonl(GCS_OUTPUT_PREFIX, OUTPUT_PATH)
        logline(f"[probe] downloaded {rows} output rows ->{OUTPUT_PATH}")
        logline("[probe] VERDICT=ELIGIBLE")
        return 0
    elif final_state == "JobState.JOB_STATE_FAILED":
        err = getattr(job, "error", None)
        logline(f"[probe] JOB FAILED - error={err}")
        logline("[probe] VERDICT=INFEASIBLE reason=job_state_failed")
        return 6
    else:
        logline(f"[probe] VERDICT=INCONCLUSIVE reason=unexpected_state:{final_state}")
        return 7


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        logline(f"[FATAL] {type(e).__name__}: {str(e)[:500]}")
        logline(f"[FATAL] traceback: {traceback.format_exc()[:2000]}")
        logline("[probe] VERDICT=INCONCLUSIVE reason=fatal_exception")
        sys.exit(99)
