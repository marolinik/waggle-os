# Qwen3.6 Thinking-Mode Stability Matrix

**Generated:** 2026-04-21T14:05:12.178Z
**Model:** `qwen3.6-35b-a3b-via-openrouter`
**Backend:** litellm
**Cells executed:** 40 of 40
**Total spend:** $0.085343

## Outcome distribution

| Outcome | Count | % |
|---|---|---|
| `converged` | 36 | 90.0% |
| `loop` | 2 | 5.0% |
| `truncated` | 0 | 0.0% |
| `empty-reasoning` | 0 | 0.0% |
| `error` | 2 | 5.0% |

## Stage-2-unsafe cells

Cells classified as `loop`, `truncated`, or `error` must be avoided for Stage 2 LoCoMo full-run or mitigated with a larger `max_tokens` ceiling. `empty-reasoning` cells warn but may recover at a higher ceiling.

| Thinking | max_tokens | Shape | Outcome | Rationale |
|---|---|---|---|---|
| on | 8000 | direct-fact | error | inference error: http_500: Internal Server Error |
| on | 8000 | temporal-scope | loop | reasoning_content repeats phrase ≥3 times in final 1K chars; content empty |
| on | 32000 | temporal-scope | error | inference error: timeout: This operation was aborted |
| off | 8000 | temporal-scope | loop | reasoning_content repeats phrase ≥3 times in final 1K chars; content empty |

## Recommended Stage 2 configuration

**Recommended:** thinking=`off`, max_tokens=`16000` (avg latency 27609ms across all 5 shapes).

All safe configurations (ordered by max_tokens ascending):

| thinking | max_tokens | avg latency ms |
|---|---|---|
| off | 16000 | 27609 |
| on | 16000 | 28802 |
| off | 32000 | 22792 |
| off | 64000 | 23041 |
| on | 64000 | 17942 |

## Full matrix (all 40 cells)

| thinking | max_tokens | shape | outcome | compl_tok | latency ms |
|---|---|---|---|---|---|
| on | 8000 | direct-fact | error | 0 | 85 |
| on | 8000 | multi-anchor-enumeration | converged | 3271 | 23414 |
| on | 8000 | chain-of-anchor | converged | 3200 | 39004 |
| on | 8000 | temporal-scope | loop | 8000 | 80304 |
| on | 8000 | null-result-tolerant | converged | 2506 | 17176 |
| on | 16000 | direct-fact | converged | 213 | 1973 |
| on | 16000 | multi-anchor-enumeration | converged | 4048 | 50086 |
| on | 16000 | chain-of-anchor | converged | 4032 | 29618 |
| on | 16000 | temporal-scope | converged | 4697 | 32588 |
| on | 16000 | null-result-tolerant | converged | 4097 | 29745 |
| on | 32000 | direct-fact | converged | 217 | 4617 |
| on | 32000 | multi-anchor-enumeration | converged | 3550 | 46281 |
| on | 32000 | chain-of-anchor | converged | 1934 | 13044 |
| on | 32000 | temporal-scope | error | 0 | 180003 |
| on | 32000 | null-result-tolerant | converged | 1097 | 8723 |
| on | 64000 | direct-fact | converged | 228 | 1961 |
| on | 64000 | multi-anchor-enumeration | converged | 2003 | 11734 |
| on | 64000 | chain-of-anchor | converged | 3611 | 30095 |
| on | 64000 | temporal-scope | converged | 3378 | 26090 |
| on | 64000 | null-result-tolerant | converged | 2704 | 19829 |
| off | 8000 | direct-fact | converged | 213 | 8738 |
| off | 8000 | multi-anchor-enumeration | converged | 2674 | 18401 |
| off | 8000 | chain-of-anchor | converged | 3437 | 26549 |
| off | 8000 | temporal-scope | loop | 8000 | 81122 |
| off | 8000 | null-result-tolerant | converged | 2566 | 15057 |
| off | 16000 | direct-fact | converged | 213 | 1813 |
| off | 16000 | multi-anchor-enumeration | converged | 5204 | 35675 |
| off | 16000 | chain-of-anchor | converged | 4511 | 46432 |
| off | 16000 | temporal-scope | converged | 3155 | 37576 |
| off | 16000 | null-result-tolerant | converged | 917 | 16547 |
| off | 32000 | direct-fact | converged | 216 | 2373 |
| off | 32000 | multi-anchor-enumeration | converged | 3485 | 27699 |
| off | 32000 | chain-of-anchor | converged | 2623 | 34611 |
| off | 32000 | temporal-scope | converged | 2973 | 26639 |
| off | 32000 | null-result-tolerant | converged | 2009 | 22637 |
| off | 64000 | direct-fact | converged | 218 | 2265 |
| off | 64000 | multi-anchor-enumeration | converged | 1242 | 12946 |
| off | 64000 | chain-of-anchor | converged | 3679 | 45716 |
| off | 64000 | temporal-scope | converged | 3764 | 27675 |
| off | 64000 | null-result-tolerant | converged | 2365 | 26602 |

---

*End of stability matrix report. CSV source at `preflight-results\qwen-stability-matrix-2026-04-21T14-05-12-175Z.csv` for scripting.*
