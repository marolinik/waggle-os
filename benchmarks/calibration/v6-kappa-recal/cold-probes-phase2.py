"""
Manifest v6 Phase 2 pre-flight — cold alias probes
====================================================

Validates both v6 judge aliases are production-ready with a minimal
probe sample before any N=400 commit. 6 calls total (3 MiniMax + 3
Kimi) on the first 3 split instances from §1.3h sample.

Probes use direct HTTP to upstream endpoints (same methodology as
§1.3g / §1.3h / §1.3h-C / v6 κ re-cal). LiteLLM proxy is NOT in the
loop — isolates upstream routing/parse behavior from middleware.

Kimi backup has never been exercised in production under v6 authority;
this is the first production-class test.

Scope: §11-compliant (read-only access to frozen files; new artefact
under benchmarks/calibration/v6-kappa-recal/).
"""
from __future__ import annotations

import json
import re
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

OUT_PATH = Path("D:/Projects/waggle-os/benchmarks/calibration/v6-kappa-recal/phase2-cold-probes.jsonl")
# Reuse first 3 split instances from §1.3h — they exercised both providers before
SAMPLE_PATH = Path("D:/Projects/waggle-os/benchmarks/probes/judge-swap-validation/split-cases-sample.jsonl")

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


def call_minimax(prompt: str, or_key: str) -> dict:
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {"Authorization": f"Bearer {or_key}"}
    body = {
        "model": "minimax/minimax-m2.7",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.0,
        "max_tokens": 4096,
    }
    started = time.time()
    status, resp = http_post_json(url, headers, body)
    latency = int((time.time() - started) * 1000)
    if status == 200 and isinstance(resp, dict):
        choices = resp.get("choices") or []
        if choices:
            msg = choices[0].get("message") or {}
            content = msg.get("content") or msg.get("reasoning_content") or ""
            usage = resp.get("usage", {})
            return {
                "raw_text": content,
                "status": 200,
                "latency_ms": latency,
                "prompt_tokens": usage.get("prompt_tokens"),
                "completion_tokens": usage.get("completion_tokens"),
                "provider": "minimax",
                "alias": "minimax-m27-via-openrouter",
                "routing": "openrouter_direct_http",
                "error": None,
            }
    return {
        "raw_text": "",
        "status": status,
        "latency_ms": latency,
        "error": str(resp)[:300],
        "provider": "minimax",
        "alias": "minimax-m27-via-openrouter",
        "routing": "openrouter_direct_http",
        "prompt_tokens": None,
        "completion_tokens": None,
    }


def call_kimi(prompt: str, moonshot_key: str) -> dict:
    """Kimi K2.6 via Moonshot direct intl endpoint. First production-class
    run of the v6 kimi-k26-direct alias equivalent (LiteLLM proxy not in
    loop; routes directly to upstream)."""
    url = "https://api.moonshot.ai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {moonshot_key}"}
    body = {
        "model": "kimi-k2.6",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 4096,
    }
    started = time.time()
    status, resp = http_post_json(url, headers, body)
    latency = int((time.time() - started) * 1000)
    if status == 200 and isinstance(resp, dict):
        choices = resp.get("choices") or []
        if choices:
            msg = choices[0].get("message") or {}
            content = msg.get("content") or msg.get("reasoning_content") or ""
            usage = resp.get("usage", {})
            return {
                "raw_text": content,
                "status": 200,
                "latency_ms": latency,
                "prompt_tokens": usage.get("prompt_tokens"),
                "completion_tokens": usage.get("completion_tokens"),
                "provider": "kimi",
                "alias": "kimi-k26-direct",
                "routing": "moonshot_direct_http",
                "error": None,
            }
    return {
        "raw_text": "",
        "status": status,
        "latency_ms": latency,
        "error": str(resp)[:300],
        "provider": "kimi",
        "alias": "kimi-k26-direct",
        "routing": "moonshot_direct_http",
        "prompt_tokens": None,
        "completion_tokens": None,
    }


def main() -> int:
    logmsg("[cold-probes] Phase 2 pre-flight START")
    env = load_env()
    or_key = env.get("OPENROUTER_API_KEY", "").strip()
    moonshot_key = env.get("MOONSHOT_API_KEY", "").strip()
    if not or_key or not moonshot_key:
        logmsg("[cold-probes] FATAL missing keys (OR or MOONSHOT)")
        return 2

    sample = []
    with SAMPLE_PATH.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                sample.append(json.loads(line))
    sample = sample[:3]  # first 3 instances
    logmsg(f"[cold-probes] loaded {len(sample)} probe instances from §1.3h split sample")

    rows = []
    for i, s in enumerate(sample):
        prompt = JUDGE_PROMPT_TEMPLATE.format(
            question=s["question"], ground_truth=s["ground_truth"],
            context=s["context"], model_answer=s["model_answer"],
        )
        for fn, label in ((call_minimax, "minimax"), (call_kimi, "kimi")):
            resp = fn(prompt, or_key if label == "minimax" else moonshot_key)
            verdict, fm, rat = parse_verdict(resp["raw_text"])
            rows.append({
                "instance_id": s["instance_id"],
                "cell": s["cell"],
                "provider": resp["provider"],
                "alias": resp["alias"],
                "routing": resp["routing"],
                "http_status": resp["status"],
                "error": resp.get("error"),
                "latency_ms": resp["latency_ms"],
                "prompt_tokens": resp.get("prompt_tokens"),
                "completion_tokens": resp.get("completion_tokens"),
                "parsed_verdict": verdict,
                "parsed_failure_mode": fm,
                "parsed_rationale": rat,
                "raw_text": resp["raw_text"],
                "opus_verdict_ref": s.get("opus_verdict"),
                "gpt_verdict_ref": s.get("gpt_verdict"),
            })
            logmsg(
                f"[cold-probes] {label:7} {i+1}/3 {s['instance_id']} status={resp['status']} "
                f"verdict={verdict} lat={resp['latency_ms']}ms"
            )

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    # Summary
    mm_rows = [r for r in rows if r["provider"] == "minimax"]
    km_rows = [r for r in rows if r["provider"] == "kimi"]
    mm_parsed = sum(1 for r in mm_rows if r["parsed_verdict"] is not None)
    km_parsed = sum(1 for r in km_rows if r["parsed_verdict"] is not None)
    logmsg(f"[cold-probes] SUMMARY MiniMax: {mm_parsed}/3 parsed  Kimi: {km_parsed}/3 parsed")
    logmsg("[cold-probes] END")
    return 0 if (mm_parsed == 3 and km_parsed == 3) else 3


if __name__ == "__main__":
    sys.exit(main())
