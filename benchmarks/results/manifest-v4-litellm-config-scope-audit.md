# Manifest v4 §11 LiteLLM Config Scope Audit

**Date:** 2026-04-24 · **Target:** PM-RATIFY-LITELLM-SCOPE gate.

**a. §11 frozen (verbatim).** MD (`manifest-v4-preregistration.md:313-321`):
cells.ts, substrate, SYSTEM_AGENTIC, agent-loop, "Judge ensemble + routing
(judge-*.ts, config/models.json, **`litellm-config.yaml` judge aliases**)",
qwen route, test suite. YAML (`manifest-v4-preregistration.yaml:352-374`)
lists 16 flat paths; line 371 = **`litellm-config.yaml`** (unqualified);
line 374 = `"no other file modifications"`.

**b. rpm: 20 target.** `litellm-config.yaml:361-364` (gemini-3.1-pro alias
inline) or a new sibling alias — both inside the frozen file.

**c. Verdict: IN_SCOPE.** MD narrow ("judge aliases") and YAML strict agree.
P2 blocked → fallback to P4 per brief.
