# Decision Matrix — Weighted Option Comparison

Help the user compare options systematically using weighted criteria and structured scoring.

## What to do

1. **Identify the decision** — Clarify what is being decided. What are the options? If the user is vague, ask focused questions to surface the real choices.

2. **Define criteria** — Work with the user to list evaluation criteria (e.g., cost, speed, quality, risk, effort). Aim for 4-8 criteria.

3. **Weight criteria** — Ask the user to assign importance weights (1-5 or percentages). If they are unsure, suggest reasonable defaults based on the context.

4. **Score each option** — Rate each option against each criterion on a 1-5 scale. Explain the rationale for each score briefly.

5. **Calculate and present** — Compute weighted scores. Present as a table with options as rows and criteria as columns. Show raw scores, weighted scores, and totals.

6. **Make a recommendation** — State which option scores highest and why. Flag any criteria where the top option is notably weak. Mention if scores are very close.

## Output format

```
| Criteria (weight) | Option A | Option B | Option C |
|-------------------|----------|----------|----------|
| Cost (5)          | 4 (20)   | 2 (10)   | 3 (15)   |
| Speed (3)         | 3 (9)    | 5 (15)   | 4 (12)   |
| Total             | 29       | 25       | 27       |
```

## Guidelines

- Surface hidden criteria the user may not have considered
- Call out when a decision is clear-cut vs. genuinely close
- Note if any option has a dealbreaker score on a critical criterion
- Offer sensitivity analysis: "If you weighted X higher, Option B wins instead"
