"""
§1.3h Judge Swap Stratified Re-Probe — split-case execution
============================================================

Executes 28 API calls (7 splits × 4 candidates) on the subset where
Opus != GPT in the authoritative 100-row κ calibration set
(`locomo-mini-n20-retry-2026-04-24T00-02-12Z.jsonl`).

PM-amended (§1.3H-POOL-SHORTAGE OPTION 1):
  - Split pool minimum reduced 12 → 7 (use-all-available)
  - Budget $1.50 cap / $3 halt (reduced from $3/$5)
  - Wall-clock cap 30 min (reduced from 60)
  - Primary operational value focus: MiniMax direct routing E2E
    verification with newly-added MINIMAX_GROUP_ID

Routing:
  - Kimi:     direct api.moonshot.ai, kimi-k2.6, max_tokens=4096
  - DeepSeek: direct api.deepseek.com, deepseek-v4-pro, max_tokens=1024
  - Zhipu:    direct api.z.ai, glm-5.1, max_tokens=1024
  - MiniMax:  DIRECT FIRST — tries api.minimaxi.com + api.minimax.chat
              with MINIMAX_GROUP_ID. Fallback: OpenRouter
              minimax/minimax-m2.7 if both direct variants fail.

Scope discipline: manifest v5 anchor fc16925 intact; §11 frozen path
untouched; no new LiteLLM aliases; no new Opus/GPT calls; additive
files only under `benchmarks/probes/judge-swap-validation/`.

Usage:
  python probe-script-split.py
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import traceback
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# ── Paths + constants ───────────────────────────────────────────────────

PROBE_DIR = Path("D:/Projects/waggle-os/benchmarks/probes/judge-swap-validation")
SPLIT_SAMPLE_PATH = PROBE_DIR / "split-cases-sample.jsonl"

# ── Judge prompt template (verbatim from §1.3g probe-script.py) ────────

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


# ── .env loader ─────────────────────────────────────────────────────────

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


# ── Verbatim judge-runner JSON extractor ────────────────────────────────

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


# ── Provider callers ────────────────────────────────────────────────────

def _retry_call(
    url: str,
    headers: dict,
    body: dict,
    model_id: str,
    routing: str,
    max_attempts: int = 3,
) -> dict:
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


def call_kimi(prompt: str, env: dict) -> dict:
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


# ── MiniMax direct routing with endpoint fallback ──────────────────────
#
# MiniMax direct chat completion has two known v2 endpoints:
#   1. https://api.minimaxi.com/v1/text/chatcompletion_v2  (international)
#   2. https://api.minimax.chat/v1/text/chatcompletion_v2   (legacy/CN)
# v2 is OpenAI-compatible format. GroupId is passed as query param.
# If both v2 endpoints fail, fall back to OpenRouter (§1.3g routing).

_MINIMAX_ROUTE_CACHE: dict[str, str] = {"chosen": None, "first_tried": []}


def call_minimax_direct_with_fallback(prompt: str, env: dict) -> dict:
    """Tries MiniMax direct (international then legacy), falls back to
    OpenRouter on failure. Caches first-successful route to avoid re-
    discovering per call."""
    group_id = env.get("MINIMAX_GROUP_ID", "").strip()
    mm_key = env.get("MINIMAX_API_KEY", "").strip()
    or_key = env.get("OPENROUTER_API_KEY", "").strip()

    # If a working route is already cached, use it
    if _MINIMAX_ROUTE_CACHE["chosen"] == "direct_international":
        return _call_minimax_direct(prompt, mm_key, group_id, "international")
    if _MINIMAX_ROUTE_CACHE["chosen"] == "direct_legacy":
        return _call_minimax_direct(prompt, mm_key, group_id, "legacy")
    if _MINIMAX_ROUTE_CACHE["chosen"] == "openrouter":
        return _call_minimax_openrouter(prompt, or_key)

    # First call: try international, then legacy, then OR
    r = _call_minimax_direct(prompt, mm_key, group_id, "international")
    _MINIMAX_ROUTE_CACHE["first_tried"].append("international")
    if r["status"] == 200 and r["raw_text"]:
        _MINIMAX_ROUTE_CACHE["chosen"] = "direct_international"
        logmsg(f"[minimax] DIRECT international SUCCESSFUL — caching route")
        return r
    logmsg(f"[minimax] direct international FAILED: status={r['status']} err={(r.get('error') or '')[:200]}")

    r = _call_minimax_direct(prompt, mm_key, group_id, "legacy")
    _MINIMAX_ROUTE_CACHE["first_tried"].append("legacy")
    if r["status"] == 200 and r["raw_text"]:
        _MINIMAX_ROUTE_CACHE["chosen"] = "direct_legacy"
        logmsg(f"[minimax] DIRECT legacy SUCCESSFUL — caching route")
        return r
    logmsg(f"[minimax] direct legacy FAILED: status={r['status']} err={(r.get('error') or '')[:200]}")

    _MINIMAX_ROUTE_CACHE["chosen"] = "openrouter"
    _MINIMAX_ROUTE_CACHE["first_tried"].append("openrouter")
    logmsg(f"[minimax] falling back to OpenRouter for all subsequent calls")
    return _call_minimax_openrouter(prompt, or_key)


def _call_minimax_direct(prompt: str, api_key: str, group_id: str, variant: str) -> dict:
    if variant == "international":
        base = "https://api.minimaxi.com/v1/text/chatcompletion_v2"
    elif variant == "legacy":
        base = "https://api.minimax.chat/v1/text/chatcompletion_v2"
    else:
        return {"raw_text": "", "status": 0, "error": f"unknown variant {variant}",
                "retries": 0, "model_id": "unknown", "routing": f"direct_{variant}",
                "latency_ms": 0, "prompt_tokens": None, "completion_tokens": None}

    # GroupId as query param
    url = f"{base}?GroupId={group_id}" if group_id else base
    headers = {"Authorization": f"Bearer {api_key}"}
    body = {
        "model": "MiniMax-M2",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.0,
        "max_tokens": 4096,
    }
    return _retry_call(url, headers, body, "MiniMax-M2", routing=f"direct_{variant}", max_attempts=2)


def _call_minimax_openrouter(prompt: str, or_key: str) -> dict:
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {"Authorization": f"Bearer {or_key}"}
    body = {
        "model": "minimax/minimax-m2.7",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.0,
        "max_tokens": 4096,
    }
    return _retry_call(url, headers, body, "minimax/minimax-m2.7", routing="openrouter")


# ── Sample loader ──────────────────────────────────────────────────────

def load_split_sample() -> list[dict]:
    rows = []
    with SPLIT_SAMPLE_PATH.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


# ── Runner ─────────────────────────────────────────────────────────────

PROVIDER_FNS = [
    ("kimi", call_kimi),
    ("minimax", call_minimax_direct_with_fallback),
    ("deepseek", call_deepseek),
    ("zhipu", call_zhipu),
]


def run_provider(name: str, call_fn, sample: list[dict], env: dict) -> list[dict]:
    logmsg(f"[{name}] start — {len(sample)} split instances")
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
            "opus_verdict_ref": s.get("opus_verdict"),
            "gpt_verdict_ref": s.get("gpt_verdict"),
        }
        out.append(row)
        logmsg(
            f"[{name}] {i+1:>2}/{len(sample)} {s['instance_id']:30} cell={s['cell']:14} "
            f"status={resp['status']} verdict={verdict} retries={resp['retries']} "
            f"routing={resp['routing']}"
        )
    logmsg(f"[{name}] done")
    return out


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def main() -> int:
    logmsg("[probe] §1.3h judge swap stratified re-probe START")
    env = load_env()
    required = [
        "MOONSHOT_API_KEY",
        "MINIMAX_API_KEY",
        "MINIMAX_GROUP_ID",
        "DEEPSEEK_API_KEY",
        "ZHIPU_API_KEY",
        "OPENROUTER_API_KEY",
    ]
    missing = [k for k in required if not env.get(k)]
    if missing:
        logmsg(f"[probe] FATAL missing env keys: {missing}")
        return 2

    sample = load_split_sample()
    logmsg(f"[probe] loaded {len(sample)} split instances from {SPLIT_SAMPLE_PATH.name}")
    if len(sample) < 1:
        logmsg("[probe] FATAL empty sample")
        return 3

    logmsg("[probe] executing 4 providers in parallel (4 threads)")
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

    logmsg("[probe] writing per-provider JSONL artefacts")
    for name, rows in provider_rows.items():
        write_jsonl(PROBE_DIR / f"{name}-split-responses.jsonl", rows)
        parsed = sum(1 for r in rows if r.get("parsed_verdict") is not None)
        logmsg(f"[probe] {name}: wrote {len(rows)} rows, parsed_ok={parsed}")

    logmsg(f"[probe] minimax_routing_resolution: {_MINIMAX_ROUTE_CACHE}")
    logmsg("[probe] END")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        logmsg(f"[FATAL] {type(e).__name__}: {e}")
        logmsg(traceback.format_exc()[:2000])
        sys.exit(99)
