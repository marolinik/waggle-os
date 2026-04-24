"""
§1.3g Judge Swap Validation Probe — 4-candidate roster
=======================================================

Tests whether Kimi, MiniMax, DeepSeek, or Zhipu can replace Gemini 3.1
Pro Preview in the judge ensemble. Per PM-RATIFY-VERTEX-BATCH-
ELIGIBILITY INFEASIBLE exit: Branch A closed; this probe is the primary
path to unblock Stage 3 independent of the Google quota ticket.

Routing (PM ratified 2026-04-24):
  - Kimi:     direct via Moonshot api.moonshot.ai, model `kimi-k2.6`
  - MiniMax:  OpenRouter fallback (direct rejected with invalid-api-
              key / missing GroupId), route `minimax/minimax-m2.7`
  - DeepSeek: direct via api.deepseek.com, model `deepseek-v4-pro`
  - Zhipu:    direct via api.z.ai, model `glm-5.1`

Sample: 20 instances stratified 4-per-cell from the Stage 2-Retry
κ-calibration set at `benchmarks/results/locomo-mini-n20-retry-
2026-04-24T00-02-12Z.jsonl` (100 rows, each has Opus+GPT+Gemini
verdicts already computed). Deterministic first-4-per-cell ordering.

Execution: 80 API calls (4 providers × 20 instances), 4 providers
parallel (ThreadPoolExecutor 4), serial within each provider. Each
call up to 3 retries on transient errors.

Parser identical to judge-runner pattern (extract JSON body, read
`verdict` field).

Scope discipline: no §11 frozen path touched; no new LiteLLM aliases;
no new Opus/GPT calls; manifest v5 anchor fc16925 intact.

Usage:
  python probe-script.py
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
import urllib.error
import urllib.request

# Windows cp1252 stdout fix.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# ── Paths + constants ────────────────────────────────────────────────────

PROBE_DIR = Path("D:/Projects/waggle-os/benchmarks/probes/judge-swap-validation")
CALIBRATION_SRC = Path("D:/Projects/waggle-os/benchmarks/results/locomo-mini-n20-retry-2026-04-24T00-02-12Z.jsonl")
SAMPLE_PATH = PROBE_DIR / "sample-instances.jsonl"

CELLS = ["no-context", "oracle-context", "full-context", "retrieval", "agentic"]
PER_CELL = 4  # 4 per cell × 5 cells = 20 instances

# ── Judge prompt template (verbatim from failure-mode-judge.ts:93-140) ──

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
    "1. Does the model explicitly refuse or say it does not know? -> F1 (ABSTAIN)",
    "2. Does the model answer a DIFFERENT question than was asked (coherent but off-topic)? -> F5 (OFF-TOPIC)",
    "3. Does the model rely on entities, names, dates, or claims that do NOT appear in the ground-truth context (fabrication)? -> F4 (HALLUCINATED)",
    "4. Does the model correctly state SOME required facts but miss others, without stating any incorrect facts? -> F2 (PARTIAL)",
    "5. Otherwise (model states facts derived from the context but gets them wrong): -> F3 (INCORRECT)",
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


def logmsg(msg: str) -> None:
    print(f"{ts()} {msg}", flush=True)


# ── .env loader ──────────────────────────────────────────────────────────

def load_env() -> dict[str, str]:
    env_path = Path("D:/Projects/waggle-os/.env")
    out: dict[str, str] = {}
    if not env_path.exists():
        return out
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip().strip('"').strip("'")
        out[k] = v
    return out


# ── Verbatim judge-runner JSON extractor (mirror of extractJsonBody) ────

def extract_json_body(raw: str) -> dict | None:
    if not raw:
        return None
    trimmed = raw.strip()
    # Code-fence strip.
    if trimmed.startswith("```"):
        m = re.match(r"^```(?:json)?\s*\n?(.*?)```\s*$", trimmed, re.DOTALL)
        if m:
            trimmed = m.group(1).strip()
    # Try direct parse.
    try:
        return json.loads(trimmed)
    except Exception:
        pass
    # First { to matching last }.
    first = trimmed.find("{")
    last = trimmed.rfind("}")
    if first != -1 and last != -1 and last > first:
        try:
            return json.loads(trimmed[first:last+1])
        except Exception:
            return None
    return None


def parse_verdict(raw_text: str) -> tuple[str | None, str | None, str | None]:
    body = extract_json_body(raw_text or "")
    if not isinstance(body, dict):
        return (None, None, None)
    v = body.get("verdict")
    fm = body.get("failure_mode")
    rat = body.get("rationale")
    if v not in ("correct", "incorrect"):
        return (None, None, None)
    if fm is not None and fm not in ("F1", "F2", "F3", "F4", "F5"):
        fm = None
    return (v, fm, rat if isinstance(rat, str) else None)


# ── HTTP helper ─────────────────────────────────────────────────────────

def http_post_json(url: str, headers: dict, body: dict, timeout_s: int = 60) -> tuple[int, dict | str]:
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json", **headers},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            try:
                return resp.status, json.loads(raw)
            except Exception:
                return resp.status, raw
    except urllib.error.HTTPError as e:
        try:
            body_err = e.read().decode("utf-8", errors="replace")
        except Exception:
            body_err = ""
        return e.code, body_err[:2000]
    except Exception as e:
        return 0, f"{type(e).__name__}: {e}"


# ── Provider-specific callers ──────────────────────────────────────────

def call_kimi(prompt: str, env: dict) -> dict:
    # kimi-k2.6 quirks: (a) rejects `temperature` != 1 ("only 1 is allowed
    # for this model"; same pattern as Opus/GPT-5.x reasoning models
    # already accommodated in judge-client.ts:88); (b) reasoning-heavy
    # output — 4-5k chars of chain-of-thought before the JSON verdict,
    # hits 1024 token ceiling mid-reasoning. Raise max_tokens to 4096.
    url = "https://api.moonshot.ai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {env['MOONSHOT_API_KEY']}"}
    body = {
        "model": "kimi-k2.6",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 4096,
    }
    return _retry_call(url, headers, body, "kimi-k2.6", routing="direct")


def call_deepseek(prompt: str, env: dict) -> dict:
    url = "https://api.deepseek.com/v1/chat/completions"
    headers = {"Authorization": f"Bearer {env['DEEPSEEK_API_KEY']}"}
    body = {
        "model": "deepseek-v4-pro",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.0,
        "max_tokens": 1024,
    }
    return _retry_call(url, headers, body, "deepseek-v4-pro", routing="direct")


def call_zhipu(prompt: str, env: dict) -> dict:
    url = "https://api.z.ai/api/paas/v4/chat/completions"
    headers = {"Authorization": f"Bearer {env['ZHIPU_API_KEY']}"}
    body = {
        "model": "glm-5.1",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.0,
        "max_tokens": 1024,
    }
    return _retry_call(url, headers, body, "glm-5.1", routing="direct")


def call_minimax_via_openrouter(prompt: str, env: dict) -> dict:
    # MiniMax M2.7 via OpenRouter is reasoning-heavy — 3/20 initial rows
    # had empty content with completion_tokens=1024 (hit ceiling mid-
    # reasoning, same pattern as Kimi). Raise max_tokens to 4096.
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {"Authorization": f"Bearer {env['OPENROUTER_API_KEY']}"}
    body = {
        "model": "minimax/minimax-m2.7",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.0,
        "max_tokens": 4096,
    }
    return _retry_call(url, headers, body, "minimax/minimax-m2.7", routing="openrouter")


def _retry_call(url: str, headers: dict, body: dict, model_id: str, routing: str,
                max_attempts: int = 3) -> dict:
    """Returns {raw_text, status, error, retries, model_id, routing, latency_ms}."""
    started = time.time()
    last_err = None
    retries = 0
    for attempt in range(max_attempts):
        status, resp = http_post_json(url, headers, body, timeout_s=60)
        if status == 200 and isinstance(resp, dict):
            choices = resp.get("choices") or []
            if choices:
                msg = choices[0].get("message") or {}
                content = msg.get("content") or msg.get("reasoning_content") or ""
                usage = resp.get("usage", {})
                return {
                    "raw_text": content,
                    "status": 200,
                    "error": None,
                    "retries": retries,
                    "model_id": model_id,
                    "routing": routing,
                    "latency_ms": int((time.time() - started) * 1000),
                    "prompt_tokens": usage.get("prompt_tokens"),
                    "completion_tokens": usage.get("completion_tokens"),
                }
        last_err = f"status={status} resp={str(resp)[:400]}"
        retries += 1
        if attempt < max_attempts - 1:
            time.sleep(2 ** attempt)
    return {
        "raw_text": "",
        "status": 0,
        "error": last_err,
        "retries": retries,
        "model_id": model_id,
        "routing": routing,
        "latency_ms": int((time.time() - started) * 1000),
        "prompt_tokens": None,
        "completion_tokens": None,
    }


# ── Sample selection (stratified 4 per cell) ────────────────────────────

def build_sample() -> list[dict]:
    """Read κ calibration JSONL, select 4 instances per cell (first-4 by
    file order), extract fields needed for judge prompt + Opus+GPT ground
    truth."""
    per_cell_rows: dict[str, list[dict]] = {c: [] for c in CELLS}
    with CALIBRATION_SRC.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                r = json.loads(line)
            except Exception:
                continue
            cell = r.get("cell")
            if cell not in per_cell_rows:
                continue
            if len(per_cell_rows[cell]) >= PER_CELL:
                continue
            # Extract Opus + GPT verdicts from judge_ensemble.
            ensemble = r.get("judge_ensemble") or []
            opus = next((j for j in ensemble if "opus" in j.get("model", "").lower()), None)
            gpt = next((j for j in ensemble if "gpt" in j.get("model", "").lower()), None)
            if opus is None or gpt is None:
                continue
            per_cell_rows[cell].append({
                "instance_id": r.get("instance_id"),
                "cell": cell,
                "question": r.get("model_answer", "")  # placeholder
                            # Actual: the judge sees (question, ground_truth, context, model_answer).
                            # We reconstruct from the calibration row + canonical fixture lookup
                            # in a separate step below.
                            ,
                "opus_verdict": opus.get("verdict"),
                "opus_failure_mode": opus.get("failure_mode"),
                "gpt_verdict": gpt.get("verdict"),
                "gpt_failure_mode": gpt.get("failure_mode"),
                "model_answer": r.get("model_answer", ""),  # subject's answer
            })
    sample = []
    for c in CELLS:
        sample.extend(per_cell_rows[c])
    return sample


def enrich_sample_with_locomo(sample: list[dict]) -> list[dict]:
    """κ-calibration JSONL has model_answer but not question/ground_truth/
    context. Join against the canonical LoCoMo fixture by instance_id."""
    locomo_path = Path("D:/Projects/waggle-os/benchmarks/data/locomo/locomo-1540.jsonl")
    by_id: dict[str, dict] = {}
    with locomo_path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                r = json.loads(line)
            except Exception:
                continue
            by_id[r.get("instance_id")] = r
    enriched = []
    for s in sample:
        iid = s["instance_id"]
        src = by_id.get(iid)
        if src is None:
            s["question"] = None
            s["ground_truth"] = None
            s["context"] = None
            enriched.append(s)
            continue
        s["question"] = src.get("question")
        s["ground_truth"] = (src.get("expected") or [src.get("gold_answer", "")])[0]
        s["context"] = src.get("context", "")
        enriched.append(s)
    return enriched


# ── Main probe ──────────────────────────────────────────────────────────

PROVIDER_FNS = [
    ("kimi", call_kimi),
    ("minimax", call_minimax_via_openrouter),
    ("deepseek", call_deepseek),
    ("zhipu", call_zhipu),
]


def run_provider(name: str, call_fn, sample: list[dict], env: dict) -> list[dict]:
    logmsg(f"[{name}] start — {len(sample)} instances")
    out: list[dict] = []
    for i, s in enumerate(sample):
        prompt = JUDGE_PROMPT_TEMPLATE.format(
            question=s.get("question") or "",
            ground_truth=s.get("ground_truth") or "",
            context=s.get("context") or "",
            model_answer=s.get("model_answer") or "",
        )
        resp = call_fn(prompt, env)
        verdict, fm, rat = parse_verdict(resp["raw_text"])
        row = {
            "instance_id": s["instance_id"],
            "cell": s["cell"],
            "provider": name,
            "model_id": resp["model_id"],
            "routing": resp["routing"],
            "http_status": resp["status"],
            "error": resp.get("error"),
            "retries": resp["retries"],
            "latency_ms": resp["latency_ms"],
            "prompt_tokens": resp.get("prompt_tokens"),
            "completion_tokens": resp.get("completion_tokens"),
            "raw_text": resp["raw_text"],
            "parsed_verdict": verdict,
            "parsed_failure_mode": fm,
            "parsed_rationale": rat,
        }
        out.append(row)
        logmsg(f"[{name}] {i+1:>2}/{len(sample)} {s['instance_id']}  status={resp['status']}  verdict={verdict}  retries={resp['retries']}")
    logmsg(f"[{name}] done")
    return out


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def main() -> int:
    logmsg("[probe] §1.3g judge swap validation START")
    env = load_env()
    required = ["MOONSHOT_API_KEY", "OPENROUTER_API_KEY", "DEEPSEEK_API_KEY", "ZHIPU_API_KEY"]
    missing = [k for k in required if not env.get(k)]
    if missing:
        logmsg(f"[probe] FATAL missing env keys: {missing}")
        return 2

    logmsg("[probe] step 1: build stratified sample (4 per cell × 5 cells = 20)")
    sample = build_sample()
    if len(sample) != 20:
        logmsg(f"[probe] WARN sample size={len(sample)} (expected 20)")
    sample = enrich_sample_with_locomo(sample)
    null_qctx = sum(1 for s in sample if not s.get("question") or s.get("context") is None)
    logmsg(f"[probe] sample built: {len(sample)} instances; null_q_or_ctx={null_qctx}")
    write_jsonl(SAMPLE_PATH, sample)

    logmsg("[probe] step 2: execute 4 providers in parallel (4 threads)")
    provider_rows: dict[str, list[dict]] = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {
            pool.submit(run_provider, name, fn, sample, env): name
            for (name, fn) in PROVIDER_FNS
        }
        for fut in as_completed(futures):
            name = futures[fut]
            try:
                rows = fut.result()
                provider_rows[name] = rows
            except Exception as e:
                logmsg(f"[probe] provider {name} FAILED: {type(e).__name__}: {e}")
                provider_rows[name] = []

    logmsg("[probe] step 3: write per-provider JSONL artefacts")
    for name, rows in provider_rows.items():
        write_jsonl(PROBE_DIR / f"{name}-responses.jsonl", rows)
        parsed = sum(1 for r in rows if r.get("parsed_verdict") is not None)
        logmsg(f"[probe] {name}: wrote {len(rows)} rows, parsed_ok={parsed}")

    logmsg("[probe] step 4: κ computation handled by companion analysis script")
    logmsg("[probe] END")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        logmsg(f"[FATAL] {type(e).__name__}: {e}")
        logmsg(traceback.format_exc()[:2000])
        sys.exit(99)
