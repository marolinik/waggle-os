---
permissions:
  codeExecution: true
  fileSystem: true
---

# Plan & Execute — Structured Task Decomposition

A multi-agent workflow: planner breaks down the task, executors work on sub-tasks, summarizer consolidates results.

## When to use
- Complex tasks that benefit from decomposition
- Work that has multiple independent sub-tasks
- When you want structured progress through a large task

## How it works
This skill uses the `orchestrate_workflow` tool with the `plan-execute` template:
1. **Planner** — Analyzes the task and breaks it into concrete sub-tasks
2. **Executor** — Works through each sub-task methodically
3. **Summarizer** — Consolidates all executor results into a final deliverable

## Usage
Tell the agent: "Use the plan-execute workflow to handle [complex task]"
Or directly: `orchestrate_workflow` with template `plan-execute` and the task description.

## Output
A comprehensive result combining all sub-task outputs with a structured summary.
