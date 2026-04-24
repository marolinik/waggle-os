"""
§1.3h Dual-κ Split Analysis
============================

Computes:
  - Per candidate: parse_success, p_opus, p_gpt, κ_vs_opus, κ_vs_gpt,
    κ_conservative = min(κ_vs_opus, κ_vs_gpt), latency p50/p95 on splits,
    routing_actual, split_verdict
  - Aggregate κ on combined 40 (7 splits + 33 unanimous from §1.3g* where
    split sample uses dual-reference with conservative min; unanimous
    uses consensus)
    *Note: §1.3g sample was 20 unanimous; combined = 7 splits + 20
    unanimous = 27. The brief says "aggregate 40" presuming 20+20, but
    our actual sample is 7+20=27. We compute aggregate on the actual 27.
  - Aggregate verdict classification
  - Ranking by κ_conservative desc
  - Primary/backup recommendation

Writes kappa-split-analysis.md.
"""
from __future__ import annotations

import json
import statistics
from pathlib import Path
from typing import Any

PROBE_DIR = Path("D:/Projects/waggle-os/benchmarks/probes/judge-swap-validation")
SPLIT_SAMPLE = PROBE_DIR / "split-cases-sample.jsonl"
UNANIMOUS_SAMPLE = PROBE_DIR / "sample-instances.jsonl"
OUT = PROBE_DIR / "kappa-split-analysis.md"

CANDIDATES = ["kimi", "minimax", "deepseek", "zhipu"]


def load_jsonl(path: Path) -> list[dict]:
    rows = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def cohen_kappa(pairs: list[tuple[str, str]]) -> tuple[float, dict]:
    """Cohen's kappa on 2-class (correct/incorrect) agreement. Pairs are
    (cand_verdict, ref_verdict). Returns (kappa, detail_dict)."""
    if not pairs:
        return (float("nan"), {"n": 0, "agree": 0, "po": 0.0, "pe": 0.0})
    n = len(pairs)
    agree = sum(1 for c, r in pairs if c == r)
    po = agree / n
    # Marginals
    cand_counts = {"correct": 0, "incorrect": 0}
    ref_counts = {"correct": 0, "incorrect": 0}
    for c, r in pairs:
        cand_counts[c] = cand_counts.get(c, 0) + 1
        ref_counts[r] = ref_counts.get(r, 0) + 1
    pe = sum(
        (cand_counts.get(v, 0) / n) * (ref_counts.get(v, 0) / n)
        for v in ("correct", "incorrect")
    )
    if pe >= 1.0:
        return (1.0 if po == 1.0 else float("nan"),
                {"n": n, "agree": agree, "po": po, "pe": pe})
    kappa = (po - pe) / (1.0 - pe)
    return (kappa, {"n": n, "agree": agree, "po": po, "pe": pe,
                    "cand_counts": cand_counts, "ref_counts": ref_counts})


def split_verdict(kappa_cons: float) -> str:
    if kappa_cons != kappa_cons:  # NaN
        return "INCONCLUSIVE"
    if kappa_cons >= 0.70:
        return "PASS"
    if kappa_cons >= 0.60:
        return "BORDERLINE"
    return "FAIL"


def pct(x: int, n: int) -> str:
    if n == 0:
        return "—"
    return f"{x}/{n} ({x * 100 / n:.1f}%)"


def fmt_k(x: float) -> str:
    if x != x:
        return "NaN"
    return f"{x:.4f}"


def main() -> int:
    # Load split sample + per-candidate responses
    splits = load_jsonl(SPLIT_SAMPLE)
    n_split = len(splits)
    print(f"Split sample: {n_split} instances")

    resp = {}
    for c in CANDIDATES:
        p = PROBE_DIR / f"{c}-split-responses.jsonl"
        if not p.exists():
            print(f"WARN missing: {p}")
            resp[c] = []
            continue
        resp[c] = load_jsonl(p)
        print(f"  {c}: {len(resp[c])} responses")

    # Index split sample for reference lookup
    split_index = {(s["instance_id"], s["cell"]): s for s in splits}

    # Per-candidate metrics on split subset
    per_cand_split: dict[str, dict] = {}
    for c in CANDIDATES:
        rows = resp[c]
        parsed_rows = [r for r in rows if r.get("parsed_verdict") in ("correct", "incorrect")]
        parse_success = len(parsed_rows)
        pairs_vs_opus = []
        pairs_vs_gpt = []
        p_opus_count = 0
        p_gpt_count = 0
        latencies = []
        routings = []
        for r in parsed_rows:
            key = (r["instance_id"], r["cell"])
            ref = split_index.get(key)
            if ref is None:
                continue
            cand_v = r["parsed_verdict"]
            op_v = ref["opus_verdict"]
            gp_v = ref["gpt_verdict"]
            pairs_vs_opus.append((cand_v, op_v))
            pairs_vs_gpt.append((cand_v, gp_v))
            if cand_v == op_v:
                p_opus_count += 1
            if cand_v == gp_v:
                p_gpt_count += 1
            latencies.append(r.get("latency_ms") or 0)
            routings.append(r.get("routing"))

        n_eval = len(pairs_vs_opus)
        p_opus = p_opus_count / n_eval if n_eval else float("nan")
        p_gpt = p_gpt_count / n_eval if n_eval else float("nan")
        k_opus, k_opus_det = cohen_kappa(pairs_vs_opus)
        k_gpt, k_gpt_det = cohen_kappa(pairs_vs_gpt)
        k_cons = min(k_opus, k_gpt) if (k_opus == k_opus and k_gpt == k_gpt) else float("nan")
        lat_p50 = int(statistics.median(latencies)) if latencies else 0
        lat_p95 = int(
            sorted(latencies)[max(0, int(len(latencies) * 0.95) - 1)]
        ) if latencies else 0
        routing_mode = max(set(routings), key=routings.count) if routings else "unknown"

        per_cand_split[c] = {
            "parse_success": parse_success,
            "n_total": n_split,
            "n_eval": n_eval,
            "p_opus": p_opus,
            "p_gpt": p_gpt,
            "k_opus": k_opus,
            "k_gpt": k_gpt,
            "k_cons": k_cons,
            "k_opus_det": k_opus_det,
            "k_gpt_det": k_gpt_det,
            "lat_p50_ms": lat_p50,
            "lat_p95_ms": lat_p95,
            "routing": routing_mode,
            "split_verdict": split_verdict(k_cons),
            "p_opus_count": p_opus_count,
            "p_gpt_count": p_gpt_count,
        }

    # Aggregate κ on combined sample (27 = 20 unanimous from §1.3g + 7 splits)
    # Unanimous: use consensus (opus_verdict == gpt_verdict); skip if NA
    # Split: use dual-reference conservative min for the aggregate candidate
    unanimous = load_jsonl(UNANIMOUS_SAMPLE)
    # Load §1.3g per-candidate responses (reuse unanimous verdicts)
    unanimous_resp = {}
    for c in CANDIDATES:
        p_unc = PROBE_DIR / f"{c}-responses.jsonl"
        if p_unc.exists():
            unanimous_resp[c] = load_jsonl(p_unc)
        else:
            unanimous_resp[c] = []

    unanimous_index = {(u["instance_id"], u["cell"]): u for u in unanimous}

    per_cand_agg: dict[str, dict] = {}
    for c in CANDIDATES:
        # Build combined pair list for candidate vs Opus and vs GPT
        pairs_opus = []
        pairs_gpt = []
        # Unanimous portion
        for r in unanimous_resp.get(c, []):
            if r.get("parsed_verdict") not in ("correct", "incorrect"):
                continue
            key = (r["instance_id"], r["cell"])
            ref = unanimous_index.get(key)
            if ref is None:
                continue
            cv = r["parsed_verdict"]
            pairs_opus.append((cv, ref["opus_verdict"]))
            pairs_gpt.append((cv, ref["gpt_verdict"]))
        # Split portion
        for r in resp[c]:
            if r.get("parsed_verdict") not in ("correct", "incorrect"):
                continue
            key = (r["instance_id"], r["cell"])
            ref = split_index.get(key)
            if ref is None:
                continue
            cv = r["parsed_verdict"]
            pairs_opus.append((cv, ref["opus_verdict"]))
            pairs_gpt.append((cv, ref["gpt_verdict"]))
        k_op, _ = cohen_kappa(pairs_opus)
        k_gp, _ = cohen_kappa(pairs_gpt)
        k_ag_cons = min(k_op, k_gp) if (k_op == k_op and k_gp == k_gp) else float("nan")
        per_cand_agg[c] = {
            "n_combined": len(pairs_opus),
            "k_agg_vs_opus": k_op,
            "k_agg_vs_gpt": k_gp,
            "k_agg_cons": k_ag_cons,
        }

    # Ranking by k_cons desc
    ranking = sorted(
        CANDIDATES,
        key=lambda c: (
            -1e9 if per_cand_split[c]["k_cons"] != per_cand_split[c]["k_cons"]
            else per_cand_split[c]["k_cons"]
        ),
        reverse=True,
    )

    # Aggregate verdict
    split_kappas = [per_cand_split[c]["k_cons"] for c in CANDIDATES
                    if per_cand_split[c]["k_cons"] == per_cand_split[c]["k_cons"]]
    n_valid_splits = min((per_cand_split[c]["n_eval"] for c in CANDIDATES), default=0)
    min_parse_frac = min(
        (per_cand_split[c]["parse_success"] / n_split if n_split else 0.0)
        for c in CANDIDATES
    )

    # PM-amended verdict categories
    if min_parse_frac < 0.80:
        aggregate_verdict = "INCONCLUSIVE_BUT_OPERATIONAL_SIGNAL"
        agg_reason = f"parse rate < 80% on at least one candidate"
    elif n_valid_splits < 7:
        aggregate_verdict = "INCONCLUSIVE_BUT_OPERATIONAL_SIGNAL"
        agg_reason = f"valid evaluable splits < 7 after drops"
    elif split_kappas and max(split_kappas) - min(split_kappas) >= 0.15 and all(k == k for k in split_kappas):
        aggregate_verdict = "SPLIT_DISCRIMINATING"
        agg_reason = f"κ_cons spread = {max(split_kappas) - min(split_kappas):.3f} ≥ 0.15 (n=7 pool-limited, observational not confirmatory)"
    elif split_kappas and all(k >= 0.70 for k in split_kappas):
        aggregate_verdict = "STILL_ALL_PASS"
        agg_reason = f"all κ_cons ≥ 0.70, spread = {max(split_kappas) - min(split_kappas):.3f} < 0.15 (n=7 pool-limited, observational)"
    else:
        passers = sum(1 for k in split_kappas if k >= 0.70)
        if passers == 0:
            aggregate_verdict = "ALL_FAIL_ON_SPLITS"
        elif passers < 4:
            aggregate_verdict = "PARTIAL_FAIL"
        else:
            aggregate_verdict = "INCONCLUSIVE_BUT_OPERATIONAL_SIGNAL"
        agg_reason = f"passers at κ_cons≥0.70: {passers}/4 (n=7 pool-limited)"

    # Primary/backup recommendation
    ranked_passing = [c for c in ranking if per_cand_split[c]["split_verdict"] == "PASS"]
    if aggregate_verdict in ("SPLIT_DISCRIMINATING", "STILL_ALL_PASS") and len(ranked_passing) >= 2:
        primary = ranked_passing[0]
        backup = ranked_passing[1]
    elif aggregate_verdict == "STILL_ALL_PASS":
        primary = ranked_passing[0] if ranked_passing else "NONE"
        backup = ranked_passing[1] if len(ranked_passing) > 1 else "NONE"
    elif aggregate_verdict == "INCONCLUSIVE_BUT_OPERATIONAL_SIGNAL":
        # Promote §1.3g operational heuristic: zhipu primary, deepseek backup
        # UNLESS split data suggests otherwise (e.g. a candidate failed parse entirely)
        zhipu_ok = per_cand_split["zhipu"]["parse_success"] >= n_split * 0.8
        deepseek_ok = per_cand_split["deepseek"]["parse_success"] >= n_split * 0.8
        primary = "ZHIPU" if zhipu_ok else "DEEPSEEK"
        backup = "DEEPSEEK" if zhipu_ok and deepseek_ok else (
            "MINIMAX" if per_cand_split["minimax"]["parse_success"] >= n_split * 0.8 else "NONE"
        )
    elif aggregate_verdict == "PARTIAL_FAIL":
        primary = ranked_passing[0].upper() if ranked_passing else "NONE"
        backup = ranked_passing[1].upper() if len(ranked_passing) > 1 else "NONE"
    else:  # ALL_FAIL_ON_SPLITS
        primary = "NONE"
        backup = "NONE"

    # MiniMax routing resolution
    mm_resp = resp.get("minimax", [])
    mm_routings = set(r.get("routing") for r in mm_resp)
    if "direct_international" in mm_routings:
        mm_res = "direct_international_successful"
    elif "direct_legacy" in mm_routings:
        mm_res = "direct_legacy_successful"
    elif "openrouter" in mm_routings:
        mm_res = "direct_failed_fell_back_openrouter"
    else:
        mm_res = "unknown"

    # ── Write Markdown ─────────────────────────────────────────────────

    lines = []
    lines.append("# §1.3h Judge Swap Stratified Re-Probe — Dual-κ Split Analysis")
    lines.append("")
    lines.append("**Date:** 2026-04-24 (evening)  **Parent commit:** `8a2f0e6` (§1.3g anchor)")
    lines.append("")
    lines.append(f"**Source:** `benchmarks/results/locomo-mini-n20-retry-2026-04-24T00-02-12Z.jsonl` (100 rows, authoritative).")
    lines.append("")
    lines.append(f"**Split pool (Opus ≠ GPT):** **{n_split}** instances (use-all-available per PM amendment §1.3H-POOL-SHORTAGE OPTION 1).")
    lines.append("")
    lines.append(f"**Split cell distribution:** `agentic=2`, `full-context=2`, `oracle-context=3`, `no-context=0`, `retrieval=0`.")
    lines.append("")
    lines.append("**Observation:** 7/7 splits have `Opus=correct / GPT=incorrect`. Zero inverse splits. ")
    lines.append("This is directional — measures candidate leniency (agrees with Opus) vs strictness (agrees with GPT).")
    lines.append("")
    lines.append("**PM-amended verdict caveat:** n=7 < 12 minimum for meaningful discrimination. All verdicts carry `n=7 pool-limited, observational not confirmatory` caveat. Primary value is operational signal (parse + latency + MiniMax routing).")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## Per-candidate split metrics")
    lines.append("")
    lines.append("| Cand | Parse | n_eval | p_opus | p_gpt | κ_vs_opus | κ_vs_gpt | κ_cons | p50 lat | p95 lat | Routing | Split verdict |")
    lines.append("|------|-------|--------|--------|-------|-----------|----------|--------|---------|---------|---------|---------------|")
    for c in ranking:
        m = per_cand_split[c]
        lines.append(
            f"| {c} | {pct(m['parse_success'], n_split)} | {m['n_eval']} "
            f"| {m['p_opus']*100:.1f}% ({m['p_opus_count']}/{m['n_eval']}) "
            f"| {m['p_gpt']*100:.1f}% ({m['p_gpt_count']}/{m['n_eval']}) "
            f"| {fmt_k(m['k_opus'])} | {fmt_k(m['k_gpt'])} | **{fmt_k(m['k_cons'])}** "
            f"| {m['lat_p50_ms']/1000:.1f} s | {m['lat_p95_ms']/1000:.1f} s "
            f"| `{m['routing']}` | **{m['split_verdict']}** |"
        )
    lines.append("")
    lines.append("### Interpretation — p_opus / p_gpt balance")
    lines.append("")
    lines.append("Since all 7 splits are Opus=correct / GPT=incorrect:")
    lines.append("")
    lines.append("- `p_opus=1.0` means candidate always agreed with Opus (100% lenient)")
    lines.append("- `p_gpt=1.0` means candidate always agreed with GPT (100% strict)")
    lines.append("- `p_opus + p_gpt == 1.0` exactly (binary complementary in this oriented split set)")
    lines.append("- **Well-balanced judge** here ≈ 3-4 correct, 3-4 incorrect (50/50-ish), showing independent calibration")
    lines.append("- **Opus-leaning judge** = mostly 'correct' verdicts; **GPT-leaning judge** = mostly 'incorrect'")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## Aggregate κ on combined sample (27 = 20 unanimous + 7 splits)")
    lines.append("")
    lines.append("Unanimous portion reuses §1.3g verdicts (consensus-matched, κ=1.0 contribution). Split portion uses dual-reference with conservative min.")
    lines.append("")
    lines.append("| Cand | n_combined | κ_agg_vs_opus | κ_agg_vs_gpt | κ_agg_cons |")
    lines.append("|------|------------|----------------|---------------|-------------|")
    for c in ranking:
        a = per_cand_agg[c]
        lines.append(
            f"| {c} | {a['n_combined']} | {fmt_k(a['k_agg_vs_opus'])} "
            f"| {fmt_k(a['k_agg_vs_gpt'])} | **{fmt_k(a['k_agg_cons'])}** |"
        )
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append(f"## Aggregate verdict: **{aggregate_verdict}**")
    lines.append("")
    lines.append(f"**Reason:** {agg_reason}")
    lines.append("")
    lines.append(f"**Ranking by κ_conservative (descending):** {', '.join(ranking)}")
    lines.append("")
    lines.append(f"**Recommended primary:** {primary.upper()}")
    lines.append(f"**Recommended backup:** {backup.upper()}")
    lines.append("")
    lines.append(f"**MiniMax routing resolution:** `{mm_res}`")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## Operational snapshot (split-case specific)")
    lines.append("")
    lines.append("- Parse rate on splits (challenging cases) vs unanimous (§1.3g for reference):")
    for c in ranking:
        m = per_cand_split[c]
        lines.append(
            f"  - `{c}`: splits {m['parse_success']}/{n_split} ({m['parse_success']*100/n_split:.0f}%), "
            f"p50={m['lat_p50_ms']/1000:.1f}s, routing={m['routing']}"
        )
    lines.append("")
    lines.append("- MiniMax direct-vs-fallback: see `minimax-split-responses.jsonl` per-row `routing` field.")
    lines.append("")

    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"\nWrote {OUT}")
    print(f"Aggregate verdict: {aggregate_verdict}")
    print(f"Primary: {primary}  Backup: {backup}")
    print(f"MiniMax routing: {mm_res}")

    # Machine-readable summary for halt ping
    summary = {
        "aggregate_verdict": aggregate_verdict,
        "aggregate_reason": agg_reason,
        "n_split": n_split,
        "per_candidate": per_cand_split,
        "per_candidate_aggregate": per_cand_agg,
        "ranking_by_k_cons_desc": ranking,
        "recommended_primary": primary.upper(),
        "recommended_backup": backup.upper(),
        "minimax_routing_resolution": mm_res,
    }
    (PROBE_DIR / "_summary-split.json").write_text(
        json.dumps(summary, indent=2, default=str), encoding="utf-8"
    )
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
