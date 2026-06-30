"""Combined N=114 paired McNemar for the HEADLINE B vs A (qwen+mem vs opus+mem),
merging batch-1 (n50, ids 0-49) + batch-2 (ids64b2, ids 50-113). Run after the
batch-2 B+A run completes:  python benchmarks/tau2/results-retail-pilot/mcnemar-n114.py
B-/A- stay at N=50 (batch-1 only) — they were a clean tie / noise; the bump targets B vs A."""
import json, os
from math import comb

SIMS = "D:/Projects/waggle-os-harness-bench/benchmarks/tau2/upstream/data/simulations"
# arm -> the batches to union (dir names). B/A get both batches; B-/A- only batch-1.
BATCHES = {
    "B":  ["retail_pilot_B_n50k1",  "retail_pilot_B_ids64b2k1"],
    "A":  ["retail_pilot_A_n50k1",  "retail_pilot_A_ids64b2k1"],
    "B-": ["retail_pilot_Bm_n50k1"],
    "A-": ["retail_pilot_Am_n50k1"],
}

def load_union(dirs):
    out = {}
    for d in dirs:
        p = os.path.join(SIMS, d, "results.json")
        if not os.path.exists(p):
            print(f"  !! missing {p}")
            continue
        for s in json.load(open(p, encoding="utf-8")).get("simulations", []):
            if "error" in str(s.get("termination_reason", "")).lower():
                continue
            reward = (s.get("reward_info") or {}).get("reward", 0) or 0
            out[str(s.get("task_id"))] = 1 if reward >= 0.999 else 0
    return out

passes = {a: load_union(dirs) for a, dirs in BATCHES.items()}
print("=== per-arm pass^1 (combined) ===")
for a in BATCHES:
    n, k = len(passes[a]), sum(passes[a].values())
    print(f"  {a:3} {k:3}/{n:3} = {k/n*100:5.1f}%" if n else f"  {a:3} (no data)")

def exact_two_sided(b, c):
    n = b + c
    if n == 0:
        return 1.0
    probs = [comb(n, k) * 0.5**n for k in range(n + 1)]
    return min(1.0, sum(p for p in probs if p <= probs[b] + 1e-12))

def mcnemar(a1, a2):
    common = sorted(set(passes[a1]) & set(passes[a2]))
    both = sum(passes[a1][t] and passes[a2][t] for t in common)
    b = sum(passes[a1][t] == 1 and passes[a2][t] == 0 for t in common)
    c = sum(passes[a1][t] == 0 and passes[a2][t] == 1 for t in common)
    neither = sum(passes[a1][t] == 0 and passes[a2][t] == 0 for t in common)
    return common, both, b, c, neither, exact_two_sided(b, c)

print("\n=== paired McNemar (exact two-sided) ===")
for a1, a2, label in [("B", "A", "HEADLINE qwen+mem vs opus+mem (N=114)")]:
    common, both, b, c, neither, p = mcnemar(a1, a2)
    print(f"\n{label}\n  N={len(common)} both={both} {a1}-only={b} {a2}-only={c} neither={neither}"
          f"  net={b-c:+d}  exact 2-sided p={p:.4f}" + ("  *p<0.05*" if p < 0.05 else "  (n.s.)"))
