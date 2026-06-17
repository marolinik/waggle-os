# 13 — GPT-5.5 requires OpenAI /v1/responses for tools+reasoning (pilot finding + fix)

**Date:** 2026-06-17 · **Status:** SOLVED (config-only). Surfaced by the banking ruler pilot; matters benchmark-wide.

## Finding

The banking × gpt-5.5 reproduction (388 sims) **all-errored at $0 billed** with:

> `litellm.BadRequestError: OpenAIException — Function tools with reasoning_effort are not supported for gpt-5.5 in /v1/chat/completions. Please use /v1/responses instead.`

**gpt-5.5 cannot do function-tools + `reasoning_effort` on the Chat Completions API** — it requires OpenAI's **Responses API** (`/v1/responses`). Confirmed: a direct `/v1/responses` call with a tool + `reasoning.effort` returns HTTP 200. **gpt-5.2 is NOT affected** (retail × gpt-5.2 ran clean and PASSED the ruler) — this is gpt-5.5-specific.

**Severity = high (benchmark-wide):** gpt-5.5 is a study *arm*, not just a ruler model. Without the fix, every tool-using gpt-5.5 cell silently produces all-zero scores. The ruler pilot caught it before the priced grid — exactly its purpose.

## Fix (config-only; tau2 unchanged)

LiteLLM 1.81.9 ships a **chat→responses bridge** (`main.py::responses_api_bridge_check`): a route whose upstream model starts with `responses/` (or has `model_info.mode == "responses"`) makes a normal `litellm.completion()` (chat/completions) call route transparently to OpenAI's `/v1/responses`. So tau2 (which only calls `litellm.completion`) needs **no change** — just a new proxy alias:

```yaml
# litellm-config.yaml
- model_name: gpt-5.5-responses
  litellm_params:
    model: openai/responses/gpt-5.5      # `responses/` prefix triggers the bridge
    api_key: os.environ/OPENAI_API_KEY
```

**Verified:** a chat/completions call to `gpt-5.5-responses` with a function tool + `reasoning_effort:low` returns **HTTP 200 with a tool_call**.

**Usage:** point `--agent-llm openai/gpt-5.5-responses` for every tool-using cell. The plain `gpt-5.5` alias stays chat-completions-only (fine for non-tool judge/ping uses).

## Benchmark-wide action (before the priced grid)

- **gpt-5.5 study arms (B′/A′ tool-using cells): use `gpt-5.5-responses`.** Updated in `config/models.json`, `config/rulers.json` (banking anchor model → `gpt-5.5-responses`), and `run-ruler-banking.sh`.
- **Re-verify the other frontier arms** the same way before freezing: does **Opus 4.8** / **Gemini 3.1 Pro** accept tools+reasoning on their default litellm path, or do they need an analogous bridge/route? (Anthropic + Gemini use different tool/thinking APIs — pilot each with a 1-tool probe.)
- The banking × gpt-5.5 ruler reproduction must be **re-run via `gpt-5.5-responses`** (the earlier 388-sim all-error run is void, $0 spent).
