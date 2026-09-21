# Decision Matrix — Weighted Option Comparison

Compare options systematically with verified arithmetic.

## Required execution

1. Open this workflow through `read_skill` with the exact name `decision-matrix`.
2. Collect the options, criteria, weights, and raw scores. Ask focused questions if any are missing; do not invent user preferences.
3. Call `calculate_decision_matrix` exactly once. Send ordered `criteria` objects with `name` and `weight`, and ordered `options` objects with `name` and scores in matching criterion order.
4. For requested two-option sensitivity, include `sensitivityCriterion` with the exact criterion name.
5. Treat the calculator result as the **sole numeric authority** for weighted cells, checksums, totals, ranking, ties, and sensitivity. Never calculate, repair, or reconcile those values yourself. If the tool reports an error, explain the invalid input and stop.

## Answer

- Show each criterion and weight, then each option's raw and returned weighted scores.
- Copy each returned checksum, total, ranking, and tie exactly.
- Recommend from the verified winner while flagging the weakest critical criterion and close results.
- If sensitivity is returned, report its tie weight, first whole-number weight where the winner changes, changed winner, and corresponding totals.
- Keep interpretation separate from verified numbers so the result remains auditable.
