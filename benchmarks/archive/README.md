# benchmarks/archive/

Long-term archival folder for launch-claim-supporting benchmark runs.

## Retention contract (per H-AUDIT-1 ratification §Q5)

- **Tier 2 only.** This folder holds gzipped JSONL from runs that support a
  published LoCoMo or SWE-ContextBench claim (e.g. H-42a/b Stage 2 full-run
  when it lands). Sprint-internal probes (Stage 1 mikro-eval, Stage 2 4-cell
  mini, reruns) stay in `benchmarks/results/` and are pruned at sprint close.
- **12 months minimum** from commit date. Longer at PM discretion for
  EU AI Act / legal / compliance alignment.
- **Gzipped JSONL only.** Expected ≤300MB per full run (~20-30% of raw).
- **Includes `reasoning_content`** when Stage 2 thinking=on runs land here —
  external reviewers asking "why did the model answer this way on item N"
  need the provider's reasoning chain. Exclusion rules (§2.4 of design doc)
  apply to the read path, not to the archive write path.

## Naming

```
h-42a-stage-2-full-YYYY-MM-DD.jsonl.gz   # Stage 2 main-run artifact
h-42b-stage-2-full-YYYY-MM-DD.jsonl.gz   # Comparative run (if cut)
```

## NOT gitignored

Both the folder and its contents ARE committed — see `.gitignore` exemption
rule (Sprint 11 A2).

## Sprint 11 state

Empty. Sprint 11 only provisions the folder. Real archival files land in the
sprint that executes H-42a/b.
