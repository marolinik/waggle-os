# Task Breakdown — Large Task Decomposition

Break a large, ambiguous task into concrete, actionable steps with clear deliverables and dependencies.

## What to do

1. **Understand the goal** — Restate the task and its definition of done. If the goal is vague, ask clarifying questions before proceeding.

2. **Identify major phases** — Break the work into 2-5 logical phases that represent distinct stages of progress.

3. **Decompose into steps** — For each phase, create specific tasks. Each task must have:
   - **Title**: Clear, action-oriented (starts with a verb)
   - **Deliverable**: What artifact or outcome marks this as done
   - **Effort estimate**: Small (< 1 hour), Medium (1-4 hours), Large (4-8 hours), XL (multiple days)
   - **Dependencies**: Which other tasks must be done first (if any)
   - **Acceptance criteria**: How to verify the task is complete

4. **Identify the critical path** — Highlight which sequence of tasks determines the minimum total time.

5. **Flag risks** — Note tasks that are uncertain, have external dependencies, or could take longer than estimated.

## Output format

```
## Phase 1: [Name]
- [ ] Task 1.1: [Title] — [Effort] — Depends: none
      Deliverable: [what]
      Acceptance: [criteria]
- [ ] Task 1.2: [Title] — [Effort] — Depends: 1.1
```

## Guidelines

- Tasks should be completable in one sitting (max 1 day)
- If a task is larger than XL, break it down further
- Order tasks so the user can start immediately with task 1.1
- Check workspace memory for prior context on the work
- Be realistic about effort — pad estimates for uncertainty
