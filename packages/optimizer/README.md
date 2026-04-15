# @waggle/optimizer

Thin wrapper around [@ax-llm/ax](https://github.com/ax-llm/ax) that exposes a
handful of typed LLM-program primitives (`summarizer`, `classifier`,
`prompt_expander`). Consumed by the Waggle server's `optimizer-service.ts`
to run Ax programs with vault-resolved API keys.

## Why this package still exists

The Skills 2.0 verification doc asked whether this package should be archived
in favor of the evolution stack in `packages/agent/` (GEPA loop, evolve-schema,
iterative-optimizer, judge, compose-evolution). The answer is **no** — the two
systems solve different problems:

| `@waggle/optimizer` | `packages/agent/src/iterative-optimizer.ts` + friends |
|---|---|
| Runs a fixed Ax program (e.g. "summarize this text") once | Evolves a prompt across many trials by proposing mutations and scoring with a judge |
| One-shot execution | Closed loop: generate → judge → gate → deploy |
| API: `optimizer.summarize(text)` | API: `runEvolutionCycle()`, `iterateUntilBudget()` |
| 132 lines | 500+ lines across 10+ files |

The agent-side GEPA / EvolveSchema stack is the "learn to write better prompts
over time" system. This package is the "please execute this typed Ax program
now" utility. The server uses the latter for deterministic summarization,
classification, and prompt expansion tasks that do **not** need a feedback
loop.

Production consumer: `packages/server/src/local/services/optimizer-service.ts`
— see the `execute()` method.

## Programs

- **summarizer** — `textToSummarize → summaryText`
- **classifier** — `textToClassify → intentCategory`
- **prompt_expander** — `briefPrompt → expandedPrompt`

## When to extend

- **Need a new one-shot Ax program?** Add a signature in `src/signatures.ts`.
- **Need a closed-loop optimizer that evolves prompts?** That's evolution —
  use `packages/agent/src/evolution-orchestrator.ts`, not this package.
