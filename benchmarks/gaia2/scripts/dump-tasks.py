#!/usr/bin/env python3
"""
Sesija C Phase 3b-A — Gaia2 HF dataset → JSONL dumper.

Runs from inside the ARE-installed venv (uv-managed under
external/meta-agents-research-environments/.venv); `datasets` package is
already a transitive dep of meta-agents-research-environments.

Usage:
    python benchmarks/gaia2/scripts/dump-tasks.py \\
        --hf-config mini \\
        --hf-split validation \\
        --limit 10 \\
        --output benchmarks/gaia2/data/tasks-mini-10.jsonl

Emits one JSON record per line, schema matching benchmarks/gaia2/adapter.ts
`Gaia2HfTask` interface (HF dataset card schema verified 2026-04-30).
"""

import argparse
import json
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Dump Gaia2 HF tasks to JSONL")
    parser.add_argument("--hf-dataset", default="meta-agents-research-environments/gaia2")
    parser.add_argument("--hf-config", required=True, help="config name (mini/search/execution/...)")
    parser.add_argument("--hf-split", default="validation")
    parser.add_argument("--limit", type=int, required=True)
    parser.add_argument("--output", required=True, help="Output JSONL path")
    args = parser.parse_args()

    # `datasets` is installed via meta-agents-research-environments pyproject
    # (transitive dep). Run this script under the ARE venv.
    try:
        from datasets import load_dataset  # type: ignore
    except ImportError as e:
        print(
            f"ERROR: `datasets` not installed. Run from ARE venv:\n"
            f"  cd external/meta-agents-research-environments && uv run python {sys.argv[0]} ...\n"
            f"Underlying error: {e}",
            file=sys.stderr,
        )
        return 2

    print(f"Loading {args.hf_dataset} config={args.hf_config} split={args.hf_split} ...", file=sys.stderr)
    ds = load_dataset(args.hf_dataset, args.hf_config, split=args.hf_split)
    total = len(ds)
    print(f"Dataset has {total} examples; limiting to {args.limit}", file=sys.stderr)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    written = 0
    with output_path.open("w", encoding="utf-8") as f:
        for i, record in enumerate(ds):
            if i >= args.limit:
                break
            # Each record matches Gaia2HfTask: {id, scenario_id, split, data}
            f.write(json.dumps(record, ensure_ascii=False))
            f.write("\n")
            written += 1

    print(f"Wrote {written} task records to {output_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
