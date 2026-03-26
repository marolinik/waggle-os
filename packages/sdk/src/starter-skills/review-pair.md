# Review Pair — Writer + Reviewer Cycle

A 2-agent workflow with revision: writer produces a draft, reviewer critiques, writer revises.

## When to use
- Document drafting that benefits from review
- When quality and accuracy matter more than speed
- Any writing task where a second opinion improves output

## How it works
This skill uses the `orchestrate_workflow` tool with the `review-pair` template:
1. **Writer** — Creates an initial draft based on the task
2. **Reviewer** — Critiques the draft for accuracy, clarity, completeness
3. **Reviser** — Incorporates reviewer feedback into a final version

## Usage
Tell the agent: "Use the review pair workflow to write [document]"
Or directly: `orchestrate_workflow` with template `review-pair` and the writing task.

## Output
A polished document that has been through a draft-review-revise cycle.
