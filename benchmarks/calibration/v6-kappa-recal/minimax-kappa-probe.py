"""
Manifest v6 Phase 1 Commit 3 — MiniMax κ re-calibration probe
==============================================================

Executes 100 MiniMax M2.7 verdicts (via OpenRouter) on the authoritative
v5 κ calibration set:
  benchmarks/results/locomo-mini-n20-retry-2026-04-24T00-02-12Z.jsonl

Reuses existing Opus + GPT verdicts from judge_ensemble field (zero new
calls for those). Reuses LoCoMo fixtures for question/ground_truth/
context lookup by instance_id (same pattern as §1.3g/h probes).

Routing: same OR endpoint as §1.3h (direct HTTP, bypasses LiteLLM proxy
for probe speed). The v6 LiteLLM alias wiring (minimax-m27-via-openrouter)
will be validated end-to-end in Phase 2 N=400 execution; κ re-cal
isolates model behavior from middleware.

Prompt: verbatim from failure-mode-judge.ts:245-258 (identical to §1.3g
and §1.3h probes).

Operational hedge per brief §3.5:
  - Log parse rate (target ≥95/100, halt <90/100)
  - Log latency p50 (target ≤25s) + p95
  - Log OR routing errors (>5% rate raises PM flag pre-κ compute)

Scope guards:
  - Parent HEAD = 38a830e (v6 Phase 1 Commit 2 anchor)
  - v6 manifest anchor = 60d061e (Commit 1)
  - §11 frozen paths except litellm-config.yaml (already amended in Commit 2)
  - No runner/judge-runner/failure-mode-judge edits

Budget: ~$2.50 expected (100 calls × $0.02 avg per §1.3h MiniMax pricing).
Cap: $30 Phase 1 total.

Usage:
  python minimax-kappa-probe.py
"""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# ── Paths ───────────────────────────────────────────────────────────────

OUT_DIR = Path("D:/Projects/waggle-os/benchmarks/calibration/v6-kappa-recal")
CAL_SRC = Path("D:/Projects/waggle-os/benchmarks/results/locomo-mini-n20-retry-2026-04-24T00-02-12Z.jsonl")
LOCOMO = Path("D:/Projects/waggle-os/benchmarks/data/locomo/locomo-1540.jsonl")
RESPONSES_PATH = OUT_DIR / "minimax-kappa-responses.jsonl"
SAMPLE_PATH = OUT_DIR / "kappa-sample-instances.jsonl"

# ── Verbatim judge prompt (same as §1.3g and §1.3h) ─────────────────────

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


def load_env() -> dict[str, str]:
    env_path = Path("D:/Projects/waggle-os/.env")
    out: dict[str, str] = {}
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


import re


def extract_json_body(raw: str) -> dict | None:
    if not raw:
        return None
    trimmed = raw.strip()
    if trimmed.startswith("```"):
        m = re.match(r"^```(?:json)?\s*\n?(.*?)```\s*$", trimmed, re.DOTALL)
        if m:
            trimmed = m.group(1).strip()
    try:
        return json.loads(trimmed)
    except Exception:
        pass
    first = trimmed.find("{")
    last = trimmed.rfind("}")
    if first != -1 and last != -1 and last > first:
        try:
            return json.loads(trimmed[first:last + 1])
        except Exception:
            return None
    return None


def parse_verdict(raw: str) -> tuple[str | None, str | None, str | None]:
    body = extract_json_body(raw)
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


def http_post_json(url: str, headers: dict, body: dict, timeout_s: int = 60) -> tuple[int, dict | str]:
    req = urllib.request.Request(
        url, data=json.dumps(body).encode("utf-8"), method="POST",
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
            return e.code, e.read().decode("utf-8", errors="replace")[:2000]
        except Exception:
            return e.code, ""
    except Exception as e:
        return 0, f"{type(e).__name__}: {e}"


def call_minimax_via_openrouter(prompt: str, or_key: str, max_attempts: int = 3) -> dict:
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {"Authorization": f"Bearer {or_key}"}
    body = {
        "model": "minimax/minimax-m2.7",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.0,
        "max_tokens": 4096,
    }
    started = time.time()
    retries = 0
    last_err = None
    for attempt in range(max_attempts):
        status, resp = http_post_json(url, headers, body, timeout_s=90)
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
        "latency_ms": int((time.time() - started) * 1000),
        "prompt_tokens": None,
        "completion_tokens": None,
    }


def build_sample() -> list[dict]:
    """Load all 100 κ calibration instances with enriched LoCoMo fixture."""
    rows = []
    with CAL_SRC.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))

    locomo_by_id = {}
    with LOCOMO.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            locomo_by_id[r.get("instance_id")] = r

    enriched = []
    for r in rows:
        iid = r.get("instance_id")
        ensemble = r.get("judge_ensemble") or []
        opus = next((j for j in ensemble if "opus" in j.get("model", "").lower()), None)
        gpt = next((j for j in ensemble if "gpt" in j.get("model", "").lower()), None)
        gemini = next((j for j in ensemble if "gemini" in j.get("model", "").lower()), None)
        loc = locomo_by_id.get(iid) or {}
        gt = ((loc.get("expected") or [loc.get("gold_answer", "")])[0]) if loc else ""
        enriched.append({
            "instance_id": iid,
            "cell": r.get("cell"),
            "question": loc.get("question") or "",
            "ground_truth": gt,
            "context": loc.get("context") or "",
            "model_answer": r.get("model_answer") or "",
            "opus_verdict": (opus or {}).get("verdict"),
            "opus_failure_mode": (opus or {}).get("failure_mode"),
            "gpt_verdict": (gpt or {}).get("verdict"),
            "gpt_failure_mode": (gpt or {}).get("failure_mode"),
            "gemini_verdict_v5": (gemini or {}).get("verdict"),
            "gemini_failure_mode_v5": (gemini or {}).get("failure_mode"),
        })
    return enriched


def main() -> int:
    logmsg("[v6-kappa] MiniMax 100-instance re-calibration START")
    env = load_env()
    or_key = env.get("OPENROUTER_API_KEY", "").strip()
    if not or_key:
        logmsg("[v6-kappa] FATAL OPENROUTER_API_KEY missing")
        return 2

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    sample = build_sample()
    logmsg(f"[v6-kappa] loaded {len(sample)} κ instances from {CAL_SRC.name}")

    # Persist enriched sample for kappa compute
    with SAMPLE_PATH.open("w", encoding="utf-8") as f:
        for s in sample:
            f.write(json.dumps(s, ensure_ascii=False) + "\n")
    logmsg(f"[v6-kappa] wrote enriched sample to {SAMPLE_PATH.name}")

    # Execute 100 MiniMax calls (sequential, with per-call retries)
    rows = []
    started_run = time.time()
    routing_errors = 0
    for i, s in enumerate(sample):
        prompt = JUDGE_PROMPT_TEMPLATE.format(
            question=s["question"],
            ground_truth=s["ground_truth"],
            context=s["context"],
            model_answer=s["model_answer"],
        )
        resp = call_minimax_via_openrouter(prompt, or_key)
        verdict, fm, rat = parse_verdict(resp["raw_text"])
        if resp["status"] != 200:
            routing_errors += 1
        rows.append({
            "instance_id": s["instance_id"],
            "cell": s["cell"],
            "provider": "minimax",
            "model_id": "minimax/minimax-m2.7",
            "routing": "openrouter_direct_http",
            "litellm_alias_registered": "minimax-m27-via-openrouter",
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
            "opus_verdict_ref": s["opus_verdict"],
            "gpt_verdict_ref": s["gpt_verdict"],
        })
        if (i + 1) % 10 == 0 or i == 0:
            elapsed = time.time() - started_run
            parsed_so_far = sum(1 for r in rows if r.get("parsed_verdict") is not None)
            logmsg(
                f"[v6-kappa] {i+1:>3}/{len(sample)} {s['instance_id']:30} cell={s['cell']:14} "
                f"status={resp['status']} verdict={verdict} parse_ok={parsed_so_far}/{i+1} "
                f"routing_err={routing_errors} elapsed={elapsed:.0f}s"
            )

    # Halt-before-compute check if parse < 90/100
    parsed = sum(1 for r in rows if r.get("parsed_verdict") is not None)
    logmsg(f"[v6-kappa] completed {len(rows)} calls; parsed={parsed}/100; routing_errors={routing_errors}")

    # Write responses regardless of halt status
    with RESPONSES_PATH.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    logmsg(f"[v6-kappa] wrote {RESPONSES_PATH.name}")

    if parsed < 90:
        logmsg(f"[v6-kappa] HALT_BEFORE_COMPUTE: parse rate {parsed}/100 < 90 threshold (per brief §3.5)")
        return 3
    if routing_errors > 5:
        logmsg(f"[v6-kappa] ROUTING_ERROR_RATE_FLAG: {routing_errors}/100 > 5% threshold (per brief §3.5)")
        return 4

    logmsg("[v6-kappa] probe step complete; κ computation handled by kappa-v6-compute.py")
    logmsg("[v6-kappa] END")
    return 0


if __name__ == "__main__":
    import traceback
    try:
        sys.exit(main())
    except Exception as e:
        logmsg(f"[FATAL] {type(e).__name__}: {e}")
        logmsg(traceback.format_exc()[:2000])
        sys.exit(99)
