Version 1.0 · 27 September 2026

Waggle = me. KVARK = us.

# 1. Product definition

**Vision:** Free, open-source, desktop-first and local-first AI work partner for an individual. It understands work, surfaces attention, performs work through reliable harnesses, remembers through Hive Mind, keeps long work alive through durable execution, and improves through measured self-evolution.

**Mental model:** Home tells me what needs me. Workspace knows everything about the work. Harness gets the work done. Hive Mind remembers. Evolution makes Waggle better at doing it. Routines keep it working when I am not there.

**Boundary:** There is no Waggle Enterprise. Team, organizational memory, governance, RBAC, policy, shared models, scale and SLA come from KVARK.

# 2. Product principles

- Complexity inside, clarity outside: agents, Waggle Dance, MCP plumbing and routing are hidden from normal users.

- Workspace-first: chat, files, memory, artifacts, tasks and long work belong to a workspace.

- Local-first/private by default; core value works without Waggle cloud.

- Model-agnostic: BYOK and OpenAI-compatible endpoints remain; local inference is first-class.

- System intelligence over raw model size: memory + capabilities + harness + proof-of-done + evolution.

- Proof before claim; execution state is separate from cognitive memory.

- Progressive disclosure: advanced controls remain available but do not define the normal UX.

# 3. User-facing mental model

**Home:** What Needs Me · My Work · Routines · Ask Waggle.

**Attention Harvest:** Email/calendar/Slack/WhatsApp/Viber/Discord and future channels normalize into Action, Commitment, Decision and Signal. Duplicates merge; provenance stays visible.

**Workspace:** Central object with persistent chat sessions/tabs, files, knowledge/memory, artifacts, tasks and long work.

**Memory/Knowledge:** Default language: What Waggle knows / Trust / Review. Graphs, frames and timeline stay advanced.

**Mobile:** Companion only: attention, approvals, workspace chat, long-task status, routines and notifications.

# 4. UX changes

- Keep HomeCockpit and Workspace as the center of the product.

- Remove prominent New Agent from normal navigation. Agent spawn/coordination becomes harness behavior.

- Move Waggle Dance, Room, MCP, Platform, Benchmarks and low-level events to Settings, Command Palette or developer mode.

- Add Work Progress that maps internal harness phases to human language: Understanding, Gathering context, Researching, Checking, Writing, Verifying.

- Expose View work for evidence/progress without exposing chain-of-thought.

- Routines become a first-class Home block; Automations can remain an advanced management surface.

# 5. Harness and work execution

- Task-shape classification selects harness family, strictness, execution budget and long-task mode.

- Knowledge Work Harness v2 supports Context → Plan → Research → Evidence → Reason → Draft → Critique → Revise → Verify, with task-specific variants.

- Coding remains a first-class harness family and is hardened, but coding is not the product identity.

- Other harness families include analysis, document production, meeting work and routines.

- Proof-of-done gates validate persisted end state, evidence, sources, artifacts, tests or other deterministic criteria where possible.

- Strict/benchmark mode must never silently skip verification.

# 6. Durable long tasks

- Long work supports checkpoint, resume, retry, cancel, progress and crash recovery.

- Completed phases are not rerun after restart unless invalidated.

- Human approvals or missing capabilities block a run without destroying progress.

- Canonical run/checkpoint state is deterministic execution state, not Hive Mind memory.

- Foreground work may hand off to durable background execution and later reattach.

# 7. Skills, connectors and capability acquisition

- Preserve existing skills, starter skills, recommendations, skill creation and Connector Hub.

- Expand current skill-first Capability Acquisition into one resolver for native tools, installed/curated skills, connectors, MCP and marketplace candidates.

- Capabilities are used inline by the harness; users do not preconfigure everything.

- If a missing capability needs authorization, Waggle explains why, asks for the minimum action and resumes the blocked run.

- Users can still manually add/remove skills, connectors and MCPs in advanced/settings surfaces.

- Ship a license-reviewed curated starter skill pack for documents, research, productivity and coding.

- Where practical, UI and agent use the same validated action contract with common permission and audit behavior.

# 8. Hive Mind

- Preserve personal/workspace scopes, memory MCP and external-agent capture hooks.

- Waggle centrally retrieves relevant Hive/workspace context before execution and injects a bounded, provenance-bearing Context Package.

- Capture relevant findings, decisions, artifacts, corrections and outcomes; do not indiscriminately store every token.

- Memory belongs to the user/workspace, not the model or executor.

- Native and external executors receive equivalent context contracts.

- Promotion from personal memory to KVARK organizational memory requires explicit policy/permission.

# 9. Learning and self-evolution

- Preserve behavior learning from corrections, successes and persona effectiveness.

- Preserve EvolveSchema and iterative GEPA with running-judge and feedback-separation safeguards.

- Audit/fix production evolution so candidate instructions are executed on eval examples before actual outputs are judged.

- Add harness recipe evolution: phase structure, gates, tools, memory strategy, retries, critique and verification placement become the search space.

- Promotion requires holdout/anchor improvement, regression checks, versioning and rollback.

- Optimize quality together with latency, compute, retries and human intervention.

- Long-task strategy evolution is later, after 1.0.

# 10. Models and onboarding

- BYOK remains.

- OpenAI-compatible endpoint/model discovery and live verification remain.

- Local is the recommended onboarding path: hardware detection plus managed runtime, Ollama, vLLM or OpenAI-compatible local server.

- Qwen 3.8 27B-class is a primary benchmark and product-tuning target, not a mandatory minimum for every machine.

- Onboarding becomes: intent → brain/model → work context/import → optional channels → first workspace → first task.

- Email/calendar/Slack etc. are skippable and can be requested inline later.

- At least one verified working model remains a hard requirement for real work.

# 11. Deployment and KVARK

- Windows/Tauri desktop is primary.

- CLI and web/self-host remain supported secondary surfaces.

- Cloud is a later convenience layer for sync, remote long tasks, mobile and teams; core Waggle does not depend on it.

- Waggle remains free/open-source for individuals.

- Connect to KVARK for team/shared/governed work. KVARK adds organizational memory, governance, RBAC, policy, shared models, infrastructure and SLA.

# 12. Benchmark and product proof

- Primary thesis: a smaller local model inside Waggle can deliver frontier-class work because the system around the model is better.

- Use independent professional-work benchmarks where execution/scoring can be matched, plus a coding benchmark for the coding harness.

- Required ablation: raw local model → +skills → +memory → +harness → +memory+harness → +evolved harness.

- Measure correctness, completeness, evidence grounding, source fidelity, artifact quality, error/hallucination rate, latency, GPU/tokens, retries and human intervention.

- Freeze benchmark versions and constraints; publish methodology and failures. Marketing claims must exactly match measured results.

- Create a small Waggle LongWork extension only for gaps external benchmarks do not cover: interruption/resume, multi-day workspace memory, changing inputs and routines.

# 13. Release priorities

- 1\. Harness/evolution correctness audit and strict verification.

- 2\. Central Hive Mind context injection/capture loop.

- 3\. Knowledge Work Harness v2 + proof-of-done.

- 4\. Durable long tasks.

- 5\. UX simplification + Work Progress + Routines.

- 6\. Unified capability resolver and inline acquisition.

- 7\. Redesigned onboarding/local-model path.

- 8\. Attention channels and mobile companion.

- Out of scope for 1.0: Agent Fusion/council/5-hats, visible multi-agent UX, Waggle Enterprise, cloud dependency and full mobile parity.

# 14. OSS-first engineering policy

This policy is a product requirement because delivery speed, maintainability and benchmark credibility depend on not rebuilding mature infrastructure unnecessarily.

**Policy:** BORROW → ADAPT → BUILD. Before implementing any major capability, first evaluate current Waggle code and suitable open-source implementations. Preserve first, refactor second, rewrite last.

**OSS Harvest gate:** Every major implementation wave starts with a documented Build-vs-Borrow review. Building from scratch requires a short rationale showing why preservation, reuse, adaptation or upstream contribution is unsuitable.

**Evaluation criteria:** License compatibility; maintenance/activity; security and supply-chain risk; dependency weight; Windows support; local-first/offline compatibility; architecture fit; test quality; performance; upstream maintenance cost and likelihood of divergence.

**BuilderIO Agent-Native:** Prefer borrowing/adapting proven patterns or code where license-compatible for durable/background work, shared UI/agent actions, checkpoint/resume and proof-of-done instead of recreating equivalent infrastructure.

**Omnigent:** Use as an OSS reference/source for harness adapters and external-agent invocation patterns where useful. It is not Waggle's core architecture and should not become a mandatory runtime dependency without a separate decision.

**Skills:** Harvest high-quality open-source skill ecosystems for the curated starter pack, subject to license, provenance, security and quality review. Avoid rewriting equivalent skills.

**Connectors and MCP:** Search for maintained OSS connector/MCP implementations and adapters before building a new integration. Wrap/adapt behind Waggle capability contracts when feasible.

**Local inference:** Reuse Ollama, vLLM and OpenAI-compatible infrastructure. Waggle should not build a custom inference server unless a demonstrated product requirement cannot be met by existing OSS.

**Benchmarks:** Use official benchmark runners, datasets, adapters and scoring logic wherever available. Do not reimplement benchmark mechanics unless required for compatibility, and document any deviation.

**Provenance:** Maintain an OSS inventory containing source repository/version/commit, license, local modifications, attribution obligations, security review status and update strategy for every borrowed component shipped with Waggle.

**Shipping gate:** Borrowed/adapted code cannot ship until license and security review pass and required attribution/notices are included.

# 15. Updated implementation rule

Before each release priority/workstream listed in this PRD, complete the OSS Harvest/Build-vs-Borrow gate. Implementation estimates assume reuse/adaptation wherever it is technically and legally sound.
