"""
§1.3h Option C follow-up — DeepSeek max_tokens=2048 verification
=================================================================

PM-ratified bounded probe: re-run DeepSeek on the same 7 splits from
§1.3h with max_tokens=2048 (up from 1024). Purpose: classify the 2/7
parse failures from §1.3h as truncation_fixable vs structural.

Scope:
  - Single candidate (DeepSeek only)
  - Same 7-split sample (split-cases-sample.jsonl SHA 6df4ed0f...)
  - One parameter delta: max_tokens 1024 -> 2048
  - No new sample selection, no new Opus/GPT calls
  - Artefacts additive in benchmarks/probes/judge-swap-validation/

Scope guards (identical to §1.3h):
  - Manifest v5 anchor fc16925 immutable
  - Parent HEAD = ae0d312 (§1.3h anchor)
  - §11 frozen paths untouched
  - No runner modification, no v6 emission

Budget: $0.50 cap, 15 min wall-clock cap.
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

PROBE_DIR = Path("D:/Projects/waggle-os/benchmarks/probes/judge-swap-validation")
SAMPLE_PATH = PROBE_DIR / "split-cases-sample.jsonl"
OUT_PATH = PROBE_DIR / "deepseek-split-responses-v2-mt2048.jsonl"

# Verbatim judge prompt (same as §1.3g and §1.3h probes)
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
    import re
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


def call_deepseek_mt2048(prompt: str, api_key: str, max_attempts: int = 3) -> dict:
    url = "https://api.deepseek.com/v1/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}"}
    body = {
        "model": "deepseek-v4-pro",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.0,
        "max_tokens": 2048,  # ← THE SINGLE DELTA
    }
    started = time.time()
    retries = 0
    last_err = None
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


def main() -> int:
    logmsg("[mt2048] DeepSeek max_tokens bump verification START")
    env = load_env()
    key = env.get("DEEPSEEK_API_KEY", "").strip()
    if not key:
        logmsg("[mt2048] FATAL DEEPSEEK_API_KEY missing")
        return 2

    sample = []
    with SAMPLE_PATH.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                sample.append(json.loads(line))
    logmsg(f"[mt2048] loaded {len(sample)} split instances from {SAMPLE_PATH.name}")

    rows = []
    for i, s in enumerate(sample):
        prompt = JUDGE_PROMPT_TEMPLATE.format(
            question=s.get("question") or "",
            ground_truth=s.get("ground_truth") or "",
            context=s.get("context") or "",
            model_answer=s.get("model_answer") or "",
        )
        resp = call_deepseek_mt2048(prompt, key)
        verdict, fm, rat = parse_verdict(resp["raw_text"])
        rows.append({
            "instance_id": s["instance_id"],
            "cell": s["cell"],
            "provider": "deepseek",
            "model_id": "deepseek-v4-pro",
            "routing": "direct",
            "max_tokens": 2048,
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
        })
        logmsg(
            f"[mt2048] {i+1}/{len(sample)} {s['instance_id']:30} cell={s['cell']:14} "
            f"status={resp['status']} verdict={verdict} retries={resp['retries']} "
            f"completion_tokens={resp.get('completion_tokens')}"
        )

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    parsed = sum(1 for r in rows if r.get("parsed_verdict") is not None)
    logmsg(f"[mt2048] wrote {len(rows)} rows, parsed_ok={parsed}")
    logmsg("[mt2048] END")
    return 0


if __name__ == "__main__":
    sys.exit(main())
