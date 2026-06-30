"""Paired McNemar (exact two-sided binomial) over the 4 pilot arms' results.json.
Run: python benchmarks/tau2/results-retail-pilot/mcnemar.py  (no deps beyond stdlib).
Pairs arms on task_id; excludes infra-errored sims. See PILOT-RESULT-2026-06-30.md."""
import json, os
from math import comb

SIMS = "D:/Projects/waggle-os-harness-bench/benchmarks/tau2/upstream/data/simulations"
ARMS = {"B-": "retail_pilot_Bm_n50k1", "B": "retail_pilot_B_n50k1",
        "A-": "retail_pilot_Am_n50k1", "A": "retail_pilot_A_n50k1"}

def load(arm_dir):
    with open(os.path.join(SIMS, arm_dir, "results.json"), encoding="utf-8") as f:
        d = json.load(f)
    out = {}
    for s in d.get("simulations", []):
        if "error" in str(s.get("termination_reason", "")).lower():
            continue
        reward = (s.get("reward_info") or {}).get("reward", 0) or 0
        out[str(s.get("task_id"))] = 1 if reward >= 0.999 else 0
    return out

passes = {a: load(d) for a, d in ARMS.items()}
print("=== per-arm pass^1 ===")
for a in ARMS:
    n, k = len(passes[a]), sum(passes[a].values())
    print(f"  {a:3} {k:2}/{n:2} = {k/n*100:5.1f}%")

def exact_two_sided(b, c):
    n = b + c
    if n == 0:
        return 1.0
    probs = [comb(n, k) * 0.5**n for k in range(n + 1)]
    obs = probs[b]
    return min(1.0, sum(p for p in probs if p <= obs + 1e-12))

def mcnemar(a1, a2):
    common = sorted(set(passes[a1]) & set(passes[a2]))
    both = sum(passes[a1][t] and passes[a2][t] for t in common)
    b = sum(passes[a1][t] == 1 and passes[a2][t] == 0 for t in common)
    c = sum(passes[a1][t] == 0 and passes[a2][t] == 1 for t in common)
    neither = sum(passes[a1][t] == 0 and passes[a2][t] == 0 for t in common)
    return common, both, b, c, neither, exact_two_sided(b, c)

print("\n=== paired McNemar (exact two-sided) ===")
for a1, a2, label in [
    ("B", "A", "qwen+mem vs opus+mem  (HEADLINE)"),
    ("B", "B-", "qwen ON vs OFF        (qwen lift)"),
    ("A", "A-", "opus ON vs OFF        (surprise)"),
    ("B-", "A-", "qwen-off vs opus-off  (raw)"),
    ("B", "A-", "qwen+mem vs best opus"),
]:
    common, both, b, c, neither, p = mcnemar(a1, a2)
    print(f"\n{label}\n  N={len(common)} both={both} {a1}-only={b} {a2}-only={c} neither={neither}"
          f"  net={b-c:+d}  exact 2-sided p={p:.4f}" + ("  *p<0.05*" if p < 0.05 else "  (n.s.)"))
