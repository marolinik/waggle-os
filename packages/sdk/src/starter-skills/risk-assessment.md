# Risk Assessment — Project Risk Identification and Ranking

Systematically identify, evaluate, and plan mitigations for project risks.

## What to do

1. **Understand the project context** — Review workspace memory and recent sessions to understand the project scope, timeline, dependencies, and goals.

2. **Identify risks** — Scan for risks across these categories:
   - **Technical**: Technology failures, integration issues, performance problems, security vulnerabilities
   - **Schedule**: Delays, dependencies, resource constraints, scope creep
   - **External**: Vendor dependencies, market changes, regulatory issues, third-party API changes
   - **People**: Key-person dependency, skill gaps, availability, communication breakdowns
   - **Scope**: Unclear requirements, changing priorities, feature creep

3. **Evaluate each risk** — For every identified risk:
   - **Likelihood**: Low (unlikely) / Medium (possible) / High (probable)
   - **Impact**: Low (minor inconvenience) / Medium (significant delay or cost) / High (project failure or major setback)
   - **Risk score**: Likelihood x Impact (use 1/2/3 scale, so max score is 9)

4. **Plan mitigations** — For each medium and high risk:
   - **Mitigation strategy**: How to reduce likelihood or impact
   - **Owner**: Who is responsible for monitoring and acting
   - **Trigger**: What signals that this risk is materializing
   - **Contingency**: What to do if the risk occurs despite mitigation

5. **Build risk matrix** — Present as a visual grid:

```
            | Low Impact | Medium Impact | High Impact |
High Likely |            |               |   [Risk 1]  |
Med Likely  |            |   [Risk 3]    |   [Risk 2]  |
Low Likely  | [Risk 5]   |   [Risk 4]    |             |
```

## Guidelines

- Be thorough but realistic — do not list catastrophic scenarios with negligible likelihood
- Focus mitigation effort on high-score risks
- Review workspace context for risks already identified or encountered
- Revisit the assessment periodically — risks change as the project evolves
