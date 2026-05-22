#!/usr/bin/env python
"""Offline independent re-judge of the GAIA 2 search-split N=160 run.

WHY: the search split is judged ~entirely by the LLM `user_message_checker`
(semantic equivalence of the agent's final message vs the oracle answer; there
are no app-action oracle events to hard-match). The production run self-judged
(Sonnet 4.6 judging a Sonnet 4.6 agent), so the pass rate may be inflated.

This script re-runs the EXACT GAIA 2 `user_message_checker` (same prompt, same
few-shot examples, same [[Success]]/[[Failure]] parsing — imported directly from
gaia2_core) against independent judge models, holding everything else constant.
Only the judge MODEL changes. Mirrors the C-1 LOCOMO trio-strict discipline.

Run inside the runner venv:
  cd external/.../gaia2-cli/runner
  ./.venv/Scripts/python.exe <thispath> --probe        # validate engines only
  ./.venv/Scripts/python.exe <thispath> --run          # full re-judge
"""
from __future__ import annotations
import argparse, glob, json, os, sys

ENV_FILE = r"D:/Projects/waggle-os/external/meta-agents-research-environments/gaia2-cli/.env"
RUN = r"D:/Projects/waggle-os-gaia2-wt/benchmarks/gaia2/runs/p4-full-hermes-n160/search"
CACHE = r"C:/Users/MarkoMarkovic/.cache/gaia2/hf_datasets/meta-agents-research-environments_gaia2-cli/search"
OUT = r"D:/Projects/waggle-os-gaia2-wt/benchmarks/gaia2/runs/rejudge-search-n160.jsonl"


def _load_env():
    """Load gaia2-cli/.env into os.environ (ANTHROPIC_API_KEY lives only there)."""
    if os.path.exists(ENV_FILE):
        for line in open(ENV_FILE, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


# Judge roster (M6, independent of the Sonnet 4.6 agent+self-judge).
# gemini/ prefix → AI-Studio API-key path (not Vertex). GPT-5 needs drop_params (no temp=0).
JUDGES = [
    {"name": "opus-4.7",      "model": "claude-opus-4-7",       "provider": "anthropic",
     "api_key_env": "ANTHROPIC_API_KEY", "base_url": None},
    {"name": "gemini-2.5-pro","model": "gemini/gemini-2.5-pro", "provider": None,
     "api_key_env": "GEMINI_API_KEY",    "base_url": None},
    {"name": "gpt-5.x",       "model": "openai/gpt-5",          "provider": "openai-compat",
     "api_key_env": "OPENROUTER_API_KEY","base_url": "https://openrouter.ai/api/v1"},
]


def _arg(action_args, name):
    """scenario events store args as a list of {name,value} dicts."""
    if isinstance(action_args, dict):
        return action_args.get(name)
    for a in action_args or []:
        if a.get("name") == name:
            return a.get("value")
    return None


def extract(scen_dir):
    sid = os.path.basename(scen_dir)
    sf = os.path.join(CACHE, sid + ".json")
    task = oracle = agent = None
    if os.path.exists(sf):
        d = json.load(open(sf, encoding="utf-8"))
        for ev in d.get("events", []):
            act = ev.get("action", {}) or {}
            fn = act.get("function")
            if fn == "send_message_to_agent" and task is None:
                task = _arg(act.get("args"), "content")
            if fn == "send_message_to_user" and ev.get("class_name") == "OracleEvent" and oracle is None:
                oracle = _arg(act.get("args"), "content")
    ar = os.path.join(scen_dir, "agent_response.txt")
    if os.path.exists(ar):
        agent = open(ar, encoding="utf-8", errors="replace").read().strip()
    # original self-judge verdict
    rf = os.path.join(scen_dir, "result.json")
    self_v = None
    if os.path.exists(rf):
        self_v = json.load(open(rf, encoding="utf-8")).get("success")
    return sid, task, agent, oracle, self_v


def _make_engine(judge):
    """Minimal litellm engine matching the (messages, **kwargs) -> (content, info)
    contract of gaia2's create_litellm_engine, but WITHOUT temperature — the M6
    roster (Opus 4.7, GPT-5) rejects/deprecates temperature and litellm lacks
    metadata to drop it. Uniform across all judges so the comparison stays fair."""
    import litellm
    litellm.drop_params = True
    key = os.environ.get(judge["api_key_env"])
    if not key:
        raise RuntimeError(f"missing {judge['api_key_env']}")
    model = judge["model"]
    if judge["provider"] in ("openai", "openai-compat") and not model.startswith("openai/"):
        model = "openai/" + model

    def engine(messages, **kwargs):
        try:
            r = litellm.completion(model=model, messages=messages,
                                   api_base=judge["base_url"], api_key=key, max_retries=8)
            return r.choices[0].message.content, {"model": model}
        except Exception as exc:
            return None, {"error": str(exc)}
    return engine


def build_checker(judge):
    from gaia2_core.judge.checkers import LLMChecker
    from gaia2_core.judge import prompts as P
    eng = _make_engine(judge)
    probe, info = eng([{"role": "user", "content": "Say OK"}])
    if probe is None:
        raise RuntimeError(f"validation failed: {info}")
    return LLMChecker(engine=eng, prompt_templates=P.USER_MESSAGE_CHECKER_PROMPT_TEMPLATES,
                      num_votes=1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", action="store_true", help="validate engines + extraction only")
    ap.add_argument("--run", action="store_true", help="full re-judge")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--run-dir", default=None, help="override RUN (the <output>/search dir to re-judge)")
    ap.add_argument("--out", default=None, help="override OUT jsonl path")
    args = ap.parse_args()
    _load_env()
    global RUN, OUT
    if args.run_dir:
        RUN = args.run_dir
    if args.out:
        OUT = args.out

    dirs = sorted(d for d in glob.glob(os.path.join(RUN, "*")) if os.path.isdir(d))
    rows = [extract(d) for d in dirs]
    answerable = [r for r in rows if r[1] and r[2] and r[3] is not None]
    print(f"scenarios={len(rows)} answerable(task+agent+oracle)={len(answerable)}")

    if args.probe:
        for j in JUDGES:
            try:
                build_checker(j); print(f"  engine OK: {j['name']} ({j['model']})")
            except Exception as e:
                print(f"  engine FAIL: {j['name']} -> {str(e)[:160]}")
        s = answerable[0]
        print(f"  sample sid={s[0]} self={s[4]} task={s[1][:60]!r} oracle={s[3][:40]!r}")
        return

    if not args.run:
        print("pass --probe or --run"); return

    checkers = {}
    for j in JUDGES:
        try:
            checkers[j["name"]] = build_checker(j); print(f"engine ready: {j['name']}")
        except Exception as e:
            print(f"engine SKIP {j['name']}: {str(e)[:160]}")

    todo = answerable[: args.limit] if args.limit else answerable
    out = open(OUT, "w", encoding="utf-8")
    n = 0
    for sid, task, agent, oracle, self_v in todo:
        rec = {"scenario_id": sid, "self_judge": self_v, "verdicts": {}}
        upa = {"agent_action_call": agent, "oracle_action_call": oracle, "task": task}
        for name, chk in checkers.items():
            try:
                v = chk(upa)
            except Exception as e:
                v = None; rec.setdefault("errors", {})[name] = str(e)[:120]
            rec["verdicts"][name] = v
        out.write(json.dumps(rec) + "\n"); out.flush()
        n += 1
        if n % 10 == 0:
            print(f"  judged {n}/{len(todo)}")
    out.close()
    print(f"wrote {n} rows -> {OUT}")


if __name__ == "__main__":
    main()
