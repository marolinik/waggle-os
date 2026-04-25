# Task 2.7 backlog — agentic_error_TypeError cluster (5 instances)

**Anchor:** v6 N=400 final commit `afe6422` (this is followup, NOT a launch blocker).
**Goal:** debug-ready scope. NOT fix-now.

## What they have in common

| Field | Value (all 5) |
|---|---|
| `failure_mode` | `agentic_error_TypeError` |
| `model_answer` | `null` |
| `usd_per_query` | $0.000 (LLM never called) |
| `judge_verdict` | `null` (judge never invoked) |
| `p50_latency_ms` | 4892–4903 (±11 ms cluster) |
| Pipeline stage | error thrown between `turn.agent-loop.enter` and first LLM response |

**Conversation distribution:** conv-26 ×2 (q019, q111), conv-44 ×2 (q029, q117), conv-49 ×1 (q071) — clustered to 3 conversations (~6% of the LoCoMo conv set).

## Cross-cell forensics (KEY FINDING)

3 of the 5 instances are answerable in non-agentic cells, proving the bug is a runner-side defect, not question intractability:

| Instance | no-ctx | oracle | full | retrieval | agentic |
|---|---|---|---|---|---|
| conv-26_q019 | ✗ | ✗ | ✗ | ✗ | **TypeError** |
| conv-26_q111 | ✗ | ✗ | ✗ | **✓** | **TypeError** |
| conv-44_q029 | ✗ | **✓** | (verdict=correct, acc=0) | ✗ | **TypeError** |
| conv-44_q117 | ✗ | **✓** | **✓** | **✓** | **TypeError** |
| conv-49_q071 | **✓** | **✓** | **✓** | ✗ | **TypeError** |

`conv-44_q117` and `conv-49_q071` answer cleanly in ≥3 non-agentic cells — agentic crashes them anyway. The agent-loop entry succeeds (`turn.agent-loop.enter` emitted with `toolCount=1`), then a TS TypeError throws before the first LLM call.

## Recommended debug approach (next iteration)

1. Re-run the 5 instance IDs in isolation with `DEBUG=waggle:agent-loop:*` + verbose runner trace → capture the TypeError stack frame.
2. Inspect substrate frames for conv-26/44/49 — check for unusual JSON shapes (truncations, embedded code fences, special tokens) that the agent-loop's tool-dispatch path may be parsing.
3. Test bisect: try `--max-turns 1` and `--tool-count 0` to isolate whether it's tool-dispatch or message-shape narrowing.

## Audit posture

Counted as 5 misses in the canonical full-N pass-rate (0.2150 = 86/400). `pass_rate_completed` (86/395 = 0.21772) is descriptive only. Does NOT affect H1 (retrieval > no-context). Per v6 §9: no post-hoc exclusion.

(199 words)
