---
permissions:
  network: true
---

# Research Team — Multi-Agent Investigation

A coordinated 3-agent research workflow: researcher gathers information, synthesizer combines findings, reviewer validates quality.

## When to use
- Complex research questions requiring multiple source types
- Topics where quality validation matters
- When you need structured, verified research output

## How it works
This skill uses the `orchestrate_workflow` tool with the `research-team` template:
1. **Researcher** — Searches web, memory, and files for relevant information
2. **Synthesizer** — Combines the researcher's raw findings into a coherent report
3. **Reviewer** — Validates accuracy, identifies gaps, and suggests improvements

## Usage
Tell the agent: "Use the research team workflow to investigate [topic]"
Or directly: `orchestrate_workflow` with template `research-team` and topic as the task.

## Output
A validated research report with findings organized by theme, source attribution, and identified gaps.
