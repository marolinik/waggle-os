"""
Manifest v6 Phase 1 — κ re-calibration computation
===================================================

Computes three pairwise Cohen's κ on 100-instance sample:
  κ(Opus, GPT)       — should match v5 historical baseline ~0.74-0.82
  κ(Opus, MiniMax)   — new measurement
  κ(GPT, MiniMax)    — new measurement

Conservative trio κ = min of the three.

Also reports:
  - Raw agreement % per pair
  - Confusion matrix per pair
  - Per-cell breakdown (no-context / oracle-context / full-context /
    retrieval / agentic)
  - MiniMax operational metrics: parse rate, latency p50/p95, routing
    errors, token usage

Writes:
  kappa-v6-analysis.md — detailed matrix + per-cell breakdown
  _summary-v6-kappa.json — machine-readable for halt ping
"""
from __future__ import annotations

import json
import statistics
from collections import Counter
from pathlib import Path

OUT_DIR = Path("D:/Projects/waggle-os/benchmarks/calibration/v6-kappa-recal")
SAMPLE_PATH = OUT_DIR / "kappa-sample-instances.jsonl"
RESPONSES_PATH = OUT_DIR / "minimax-kappa-responses.jsonl"
ANALYSIS_PATH = OUT_DIR / "kappa-v6-analysis.md"
SUMMARY_JSON = OUT_DIR / "_summary-v6-kappa.json"


def load_jsonl(path: Path) -> list[dict]:
    out = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out


def cohen_kappa(pairs: list[tuple[str, str]]) -> tuple[float, dict]:
    """Cohen's κ on 2-class (correct/incorrect) pairs. Returns (κ, detail)."""
    if not pairs:
        return (float("nan"), {"n": 0, "agree": 0, "po": 0.0, "pe": 0.0})
    n = len(pairs)
    agree = sum(1 for a, b in pairs if a == b)
    po = agree / n
    a_counts = {"correct": 0, "incorrect": 0}
    b_counts = {"correct": 0, "incorrect": 0}
    for a, b in pairs:
        a_counts[a] = a_counts.get(a, 0) + 1
        b_counts[b] = b_counts.get(b, 0) + 1
    pe = sum(
        (a_counts.get(v, 0) / n) * (b_counts.get(v, 0) / n)
        for v in ("correct", "incorrect")
    )
    if pe >= 1.0:
        return (1.0 if po == 1.0 else float("nan"),
                {"n": n, "agree": agree, "po": po, "pe": pe,
                 "a_counts": a_counts, "b_counts": b_counts})
    kappa = (po - pe) / (1.0 - pe)
    return (kappa, {"n": n, "agree": agree, "po": po, "pe": pe,
                    "a_counts": a_counts, "b_counts": b_counts})


def confusion_matrix(pairs: list[tuple[str, str]]) -> dict:
    """2x2 confusion (rows = judge A, cols = judge B)."""
    cm = {"correct_correct": 0, "correct_incorrect": 0,
          "incorrect_correct": 0, "incorrect_incorrect": 0}
    for a, b in pairs:
        key = f"{a}_{b}"
        cm[key] = cm.get(key, 0) + 1
    return cm


def classify_verdict(trio_kappa: float) -> str:
    if trio_kappa != trio_kappa:  # NaN
        return "INCONCLUSIVE"
    if trio_kappa >= 0.70:
        return "PASS"
    if trio_kappa >= 0.60:
        return "BORDERLINE"
    return "FAIL"


def fmt_k(x: float) -> str:
    if x != x:
        return "NaN"
    return f"{x:.4f}"


def pct_str(num: int, denom: int) -> str:
    if denom == 0:
        return "—"
    return f"{num}/{denom} ({num * 100.0 / denom:.1f}%)"


def main() -> int:
    sample = load_jsonl(SAMPLE_PATH)
    mm = load_jsonl(RESPONSES_PATH)

    # Index MiniMax responses
    mm_by_key = {(r["instance_id"], r["cell"]): r for r in mm}

    # Build pair lists for 3 pairwise κ
    pairs_og = []  # (Opus, GPT)
    pairs_om = []  # (Opus, MiniMax)
    pairs_gm = []  # (GPT, MiniMax)
    per_cell = {"no-context": [], "oracle-context": [], "full-context": [],
                "retrieval": [], "agentic": []}

    mm_parse_ok = 0
    mm_lat = []
    mm_retries = 0
    mm_routing_errors = 0
    mm_prompt_tok = []
    mm_comp_tok = []

    for s in sample:
        op_v = s.get("opus_verdict")
        gp_v = s.get("gpt_verdict")
        if op_v not in ("correct", "incorrect") or gp_v not in ("correct", "incorrect"):
            continue
        pairs_og.append((op_v, gp_v))
        per_cell.setdefault(s["cell"], []).append(("og", op_v, gp_v))

        key = (s["instance_id"], s["cell"])
        m = mm_by_key.get(key)
        if m is None:
            continue
        mm_v = m.get("parsed_verdict")
        mm_lat.append(m.get("latency_ms") or 0)
        mm_retries += m.get("retries") or 0
        if m.get("http_status") != 200:
            mm_routing_errors += 1
        if m.get("prompt_tokens"):
            mm_prompt_tok.append(m["prompt_tokens"])
        if m.get("completion_tokens"):
            mm_comp_tok.append(m["completion_tokens"])
        if mm_v in ("correct", "incorrect"):
            mm_parse_ok += 1
            pairs_om.append((op_v, mm_v))
            pairs_gm.append((gp_v, mm_v))
            per_cell.setdefault(s["cell"], []).append(("om", op_v, mm_v))
            per_cell.setdefault(s["cell"], []).append(("gm", gp_v, mm_v))

    k_og, k_og_det = cohen_kappa(pairs_og)
    k_om, k_om_det = cohen_kappa(pairs_om)
    k_gm, k_gm_det = cohen_kappa(pairs_gm)
    cm_og = confusion_matrix(pairs_og)
    cm_om = confusion_matrix(pairs_om)
    cm_gm = confusion_matrix(pairs_gm)

    kappas = [k for k in (k_og, k_om, k_gm) if k == k]
    k_trio = min(kappas) if kappas else float("nan")
    verdict = classify_verdict(k_trio)

    # Per-cell pairwise
    per_cell_rows = []
    cells_order = ["no-context", "oracle-context", "full-context", "retrieval", "agentic"]
    for cell in cells_order:
        triples = per_cell.get(cell, [])
        pog = [(a, b) for t, a, b in triples if t == "og"]
        pom = [(a, b) for t, a, b in triples if t == "om"]
        pgm = [(a, b) for t, a, b in triples if t == "gm"]
        k_c_og, _ = cohen_kappa(pog) if pog else (float("nan"), {})
        k_c_om, _ = cohen_kappa(pom) if pom else (float("nan"), {})
        k_c_gm, _ = cohen_kappa(pgm) if pgm else (float("nan"), {})
        n_cell = len(pog)
        mm_cell_parsed = len(pom)
        per_cell_rows.append({
            "cell": cell,
            "n": n_cell,
            "mm_parsed": mm_cell_parsed,
            "k_og": k_c_og,
            "k_om": k_c_om,
            "k_gm": k_c_gm,
        })

    # Operational metrics
    lat_p50 = int(statistics.median(mm_lat)) if mm_lat else 0
    lat_p95 = int(sorted(mm_lat)[max(0, int(len(mm_lat) * 0.95) - 1)]) if mm_lat else 0
    prompt_tok_total = sum(mm_prompt_tok)
    comp_tok_total = sum(mm_comp_tok)
    # OR MiniMax M2.7 pricing: $0.30/M prompt, $1.20/M completion
    cost_actual = round(
        (prompt_tok_total / 1_000_000) * 0.30 + (comp_tok_total / 1_000_000) * 1.20, 4
    )

    # ── Write kappa-v6-analysis.md ─────────────────────────────────────

    lines = []
    lines.append("# Manifest v6 κ Re-Calibration Analysis")
    lines.append("")
    lines.append("**Date:** 2026-04-24  **Parent:** `38a830e` (v6 Phase 1 Commit 2)  **v6 anchor:** `60d061e`")
    lines.append("")
    lines.append(f"**Sample:** {len(sample)} instances from `benchmarks/results/locomo-mini-n20-retry-2026-04-24T00-02-12Z.jsonl` (authoritative v5 κ set; zero new Opus/GPT calls).")
    lines.append("")
    lines.append(f"**MiniMax verdicts:** {len(mm)} calls via OpenRouter `minimax/minimax-m2.7` (v6 alias: `minimax-m27-via-openrouter`); direct HTTP probe (LiteLLM proxy not in loop — isolates model behavior from middleware).")
    lines.append("")
    lines.append(f"**Prompt:** verbatim `failure-mode-judge.ts:245-258` (same as §1.3g / §1.3h / §1.3h-C).")
    lines.append(f"**Parameters:** `temperature=0.0`, `max_tokens=4096`.")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## §1 Three pairwise Cohen's κ")
    lines.append("")
    lines.append("| Pair | n | Agree | Raw % | κ |")
    lines.append("|------|---|-------|-------|-----|")
    lines.append(f"| Opus vs GPT | {k_og_det['n']} | {k_og_det['agree']} | {k_og_det['po']*100:.2f}% | **{fmt_k(k_og)}** |")
    lines.append(f"| Opus vs MiniMax | {k_om_det['n']} | {k_om_det['agree']} | {k_om_det['po']*100:.2f}% | **{fmt_k(k_om)}** |")
    lines.append(f"| GPT vs MiniMax | {k_gm_det['n']} | {k_gm_det['agree']} | {k_gm_det['po']*100:.2f}% | **{fmt_k(k_gm)}** |")
    lines.append("")
    lines.append(f"**Conservative trio κ = min = {fmt_k(k_trio)}**")
    lines.append("")
    lines.append(f"## §2 Verdict: **{verdict}**")
    lines.append("")
    lines.append("Per v6 §5.4 gate criteria:")
    lines.append("- `κ_trio ≥ 0.70` → PASS, halt with PM-RATIFY-V6-KAPPA")
    lines.append("- `0.60 ≤ κ_trio < 0.70` → BORDERLINE, halt with PM adjudication")
    lines.append("- `κ_trio < 0.60` → FAIL, halt with swap-path-re-evaluation")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## §3 Confusion matrices")
    lines.append("")
    lines.append("### Opus vs GPT")
    lines.append("")
    lines.append("| | GPT=correct | GPT=incorrect |")
    lines.append("|---|---|---|")
    lines.append(f"| **Opus=correct** | {cm_og.get('correct_correct', 0)} | {cm_og.get('correct_incorrect', 0)} |")
    lines.append(f"| **Opus=incorrect** | {cm_og.get('incorrect_correct', 0)} | {cm_og.get('incorrect_incorrect', 0)} |")
    lines.append("")
    lines.append("### Opus vs MiniMax")
    lines.append("")
    lines.append("| | MiniMax=correct | MiniMax=incorrect |")
    lines.append("|---|---|---|")
    lines.append(f"| **Opus=correct** | {cm_om.get('correct_correct', 0)} | {cm_om.get('correct_incorrect', 0)} |")
    lines.append(f"| **Opus=incorrect** | {cm_om.get('incorrect_correct', 0)} | {cm_om.get('incorrect_incorrect', 0)} |")
    lines.append("")
    lines.append("### GPT vs MiniMax")
    lines.append("")
    lines.append("| | MiniMax=correct | MiniMax=incorrect |")
    lines.append("|---|---|---|")
    lines.append(f"| **GPT=correct** | {cm_gm.get('correct_correct', 0)} | {cm_gm.get('correct_incorrect', 0)} |")
    lines.append(f"| **GPT=incorrect** | {cm_gm.get('incorrect_correct', 0)} | {cm_gm.get('incorrect_incorrect', 0)} |")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## §4 Per-cell κ breakdown (n=20 per cell)")
    lines.append("")
    lines.append("| Cell | n | MiniMax parsed | κ(Opus,GPT) | κ(Opus,MiniMax) | κ(GPT,MiniMax) |")
    lines.append("|------|---|-----------------|----------------|-------------------|------------------|")
    for row in per_cell_rows:
        lines.append(
            f"| {row['cell']} | {row['n']} | {row['mm_parsed']} "
            f"| {fmt_k(row['k_og'])} | {fmt_k(row['k_om'])} | {fmt_k(row['k_gm'])} |"
        )
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## §5 MiniMax operational metrics")
    lines.append("")
    lines.append(f"- Calls: {len(mm)} total, parsed OK: **{pct_str(mm_parse_ok, len(mm))}**")
    lines.append(f"- Routing errors (non-200 HTTP): **{mm_routing_errors}/{len(mm)}** ({mm_routing_errors*100/len(mm):.1f}%)")
    lines.append(f"- Total retries: {mm_retries}")
    lines.append(f"- Latency p50: **{lat_p50/1000:.1f} s**  |  p95: **{lat_p95/1000:.1f} s**")
    lines.append(f"- Token usage: prompt = {prompt_tok_total:,}, completion = {comp_tok_total:,}")
    lines.append(f"- Cost actual (OR MiniMax pricing $0.30/$1.20 per 1M): **~${cost_actual}**")
    lines.append("")
    lines.append(f"Per brief §3.5 operational hedge thresholds:")
    lines.append(f"- parse ≥95/100 target: **{'MET' if mm_parse_ok >= 95 else 'MISS (below target)'}** — actual {mm_parse_ok}/100")
    lines.append(f"- parse ≥90/100 halt: **{'MET' if mm_parse_ok >= 90 else 'FAIL (halt)'}** — actual {mm_parse_ok}/100")
    lines.append(f"- latency p50 ≤25s: **{'MET' if lat_p50 <= 25000 else 'MISS'}** — actual {lat_p50/1000:.1f}s")
    lines.append(f"- OR routing errors <5%: **{'MET' if mm_routing_errors < 5 else 'FLAG'}** — actual {mm_routing_errors/len(mm)*100:.1f}%")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append(f"## §6 Comparison to v5 historical baseline")
    lines.append("")
    lines.append(f"v5 κ baseline reference: Fleiss' κ=0.7458 on three-way Opus+GPT+Gemini ensemble.")
    lines.append(f"v6 κ(Opus, GPT) pairwise: **{fmt_k(k_og)}** — sanity check. If significantly different from v5 baseline range (~0.74-0.82 for a high-agreement pair), investigate.")
    lines.append(f"v6 conservative trio κ (Opus+GPT+MiniMax): **{fmt_k(k_trio)}**.")

    ANALYSIS_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {ANALYSIS_PATH}")

    # Machine-readable summary
    summary = {
        "verdict": verdict,
        "k_opus_gpt": k_og,
        "k_opus_minimax": k_om,
        "k_gpt_minimax": k_gm,
        "k_conservative_trio": k_trio,
        "minimax_parse_success": mm_parse_ok,
        "minimax_n_total": len(mm),
        "minimax_lat_p50_ms": lat_p50,
        "minimax_lat_p95_ms": lat_p95,
        "minimax_routing_errors": mm_routing_errors,
        "minimax_retries_total": mm_retries,
        "minimax_prompt_tokens_total": prompt_tok_total,
        "minimax_completion_tokens_total": comp_tok_total,
        "cost_actual_usd": cost_actual,
        "per_cell": per_cell_rows,
        "confusion_opus_gpt": cm_og,
        "confusion_opus_minimax": cm_om,
        "confusion_gpt_minimax": cm_gm,
    }
    SUMMARY_JSON.write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
    print(f"Wrote {SUMMARY_JSON}")
    print(f"\nVerdict: {verdict}")
    print(f"k(Opus, GPT)     = {fmt_k(k_og)}")
    print(f"k(Opus, MiniMax) = {fmt_k(k_om)}")
    print(f"k(GPT, MiniMax)  = {fmt_k(k_gm)}")
    print(f"k_trio (min)     = {fmt_k(k_trio)}")
    print(f"MiniMax parse    = {mm_parse_ok}/100")
    print(f"Cost             = ${cost_actual}")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
