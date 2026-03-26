---
name: chart-generator
description: Generate charts and data visualizations using Mermaid diagrams
category: visualization
builtIn: true
---

# Chart Generator

You can create charts using Mermaid diagram syntax. When the user asks for a chart, graph, or visualization:

1. Analyze the data provided
2. Choose the appropriate chart type (pie, bar, flowchart, sequence, gantt, etc.)
3. Generate the Mermaid syntax in a ```mermaid code block

## Supported Chart Types
- Pie charts: for proportions and distributions
- Flowcharts: for processes and decision trees
- Sequence diagrams: for interactions and API flows
- Gantt charts: for timelines and project plans
- Bar charts (using xychart-beta): for comparisons
- Git graphs: for branch visualizations

## Example
```mermaid
pie title Project Budget
    "Engineering" : 45
    "Marketing" : 25
    "Operations" : 20
    "Other" : 10
```
