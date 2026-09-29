Version 1.0 · 27 September 2026

Implementation specification for the agreed Waggle mental model.

# 1. Architecture boundaries

**Product layer:** Home, Workspace, Memory/Knowledge, Library/Settings and mobile companion.

**Execution layer:** Task classifier, Harness Router, Workflow Harness, durable run engine and proof-of-done.

**Capability layer:** Native tools, skills, connectors, MCP and curated marketplace through one resolver.

**Memory layer:** Hive Mind cognitive memory and bounded Context Packages.

**State layer:** Canonical durable run/checkpoint/event store, separate from semantic memory.

**Enterprise layer:** KVARK for team/shared/governed behavior.

# 2. Core domain contracts

- WorkItem: id, type(Action\|Commitment\|Decision\|Signal), source/provenance, priority, status, workspace link and attention/due metadata.

- TaskShape: category, complexity, expected artifact, required capabilities, strictness, longTask flag and budget hints.

- WorkflowHarness: id/version, phases, instructions, allowed capabilities, gates, retries, approvals, timeout policy and aggregation.

- DurableRun: run id, workspace id, harness version, task shape, status, current phase, timestamps and retry/cancel/block metadata.

- Checkpoint: phase id, attempt, persisted outputs, artifact/evidence references, gate results and resume cursor.

- ContextPackage: bounded retrieved memories/files/decisions with provenance, scope, trust and size/token budget.

- CapabilityCandidate: source type, availability, trust, match reason, auth/install action and scopes.

- ProofReceipt: machine-readable evidence proving final completion.

- HarnessRecipeVersion: parent, mutations, eval metrics, holdout metrics, promotion state and rollback target.

# 3. End-to-end execution flow

- 1\. Intent enters from Home Ask Waggle, Workspace Chat, Routine, harvested WorkItem or CLI.

- 2\. Resolve/create workspace and persist intent.

- 3\. Classify TaskShape and choose harness version.

- 4\. Build ContextPackage from workspace files/index and Hive Mind.

- 5\. Resolve required capabilities; active capabilities mount automatically.

- 6\. Missing capability requiring setup/authorization persists run as blocked and surfaces inline action.

- 7\. Create DurableRun before meaningful execution.

- 8\. Execute phase; stream user-friendly progress; collect artifacts, tool calls and evidence.

- 9\. Evaluate gates. Pass writes Checkpoint; fail follows retry/block/abort policy.

- 10\. Process restart resumes from last valid checkpoint.

- 11\. Final verification produces ProofReceipt; only then status becomes COMPLETED.

- 12\. Return result/artifacts to Workspace and run memory extraction/consolidation.

- 13\. Emit trace/eval signals for learning/evolution.

# 4. Durable run state machine

- States: QUEUED, RUNNING, BLOCKED_CAPABILITY, BLOCKED_APPROVAL, PAUSED, FAILED_RETRYABLE, FAILED_FINAL, CANCELLED, COMPLETED.

- Phase transition is persisted atomically with checkpoint/evidence references.

- Retry is phase-scoped; completed prior phases remain valid unless explicitly invalidated.

- Cancel stops new work, persists reason and retains completed artifacts/checkpoints.

- Resume validates model/capability availability and checkpoint compatibility.

- Execution state remains usable if Hive Mind is temporarily unavailable.

# 5. Harness engine

- Keep deterministic gate validation outside LLM reasoning wherever feasible.

- Gate types: tool-call evidence, source count/coverage, artifact existence/validation, structured-output checks, citation resolution, test/build results and custom domain validators.

- Knowledge Work v2 phases are composable rather than one hard-coded pipeline.

- Verification is mandatory in strict/benchmark recipes.

- User-facing progress labels map from internal phases and never expose hidden chain-of-thought.

- Every run emits trace data sufficient for evaluation and evolution.

# 6. Capability Resolver

- Search without assuming one source: native → active installed → installed inactive → curated installable → connector → MCP → marketplace.

- Rank by task match, availability, trust/risk, user policy and setup cost.

- Already-active capabilities mount silently within permission boundaries.

- Credential/scope/external-effect setup requires explicit user approval.

- Blocked run stores requested capability and resumes after successful setup.

- Manual Skills/Connectors/MCP management remains available in advanced Settings.

# 7. Hive Mind context loop

- Context Builder receives workspace id, task shape and query and returns a bounded ContextPackage.

- Retrieval respects personal/workspace scope, provenance and trust filters.

- Context injection happens before native or external execution; child agents are not relied on to remember to call memory MCP.

- Existing hooks/MCP remain useful capture/read paths, but central Waggle injection is authoritative for harness-controlled work.

- Post-run extraction stores decisions, durable facts, outcomes, corrections and artifact references; transient reasoning is not memory.

- Memory failure degrades gracefully and never corrupts DurableRun state.

# 8. Evolution pipeline

- Evaluation datasets come from frozen benchmark examples and/or verified execution traces.

- Candidate instruction/schema/recipe must be executed through the actual target model/harness before scoring.

- Judging combines deterministic metrics and LLM rubric scoring; benchmark mode records judge model/version and configuration.

- Harness mutation may add/remove/reorder phases and alter gates, retries, tools and memory strategy within safety constraints.

- Promotion requires anchor/holdout improvement plus protected regression thresholds.

- All promoted recipes are versioned and rollbackable; production promotion is explicit by default.

# 9. Home and Attention Harvest

- Connector adapters normalize source events into attention candidates.

- Deduplication links email/thread/calendar/chat/workspace evidence into one WorkItem when confidence is high.

- Priority uses urgency, explicit due dates, commitments, decision requests, workspace relevance and user corrections.

- Each item supports dismiss, snooze, convert-to-work, link-to-workspace and classification correction.

- Routines execute through the same DurableRun/harness path and show next run/last result/block state.

# 10. Model setup and onboarding

- Model readiness requires a live verified provider/default model or live local model.

- Local setup detects hardware and recommends feasible model/quant/runtime.

- Supported local paths: managed runtime, Ollama, vLLM and custom OpenAI-compatible endpoint.

- Qwen 3.8 27B-class is the reference target, not a mandatory minimum for every machine.

- Onboarding is resumable and does not force connector setup.

- Flow: intent → model → work context/import → optional channels → first workspace → first task.

- First task demonstrates Work Progress rather than agent/harness internals.

# 11. Mobile and deployment surfaces

- Mobile navigation: What Needs Me, Work, Chat, Approvals, Routines, Notifications.

- Desktop-only/advanced by default: model administration, marketplace, MCP management, benchmarks, platform, detailed memory graph and low-level agent controls.

- Web/self-host and CLI share backend contracts with desktop; no separate execution semantics.

- Desktop remains the authoritative local host for local model, local files and local routines in 1.0.

# 12. Security, permissions and privacy

- Credentials remain in vault/secure storage; resolver never exposes secrets in prompts or traces.

- Connector actions honor scopes and existing revoke/disconnect semantics.

- High-impact external actions can require approval gates.

- Context packages are scope-filtered and telemetry uses references/metadata rather than unnecessary private content.

- Core telemetry is local-first; any future cloud telemetry is opt-in and content-minimized.

- KVARK connection uses explicit policy for personal-to-organizational knowledge sharing.

# 13. Observability and benchmark readiness

- Per run record: harness/version, model/runtime, task shape, phase durations, tokens, tool calls, retries, checkpoints, evidence and final status.

- Benchmark record also freezes dataset version, model settings, hardware/runtime, judge version and scoring configuration.

- Metrics: completion rate, gate failure rate, resume success, human intervention, latency, compute/tokens, quality score and memory contribution.

- Ablation flags independently disable memory, skills/capabilities, harness and evolution.

- Benchmark runs must support raw-model and incremental Waggle-layer comparisons under frozen configuration.

# 14. Migration from current repository

- Preserve current HomeCockpit, Workspace routing/session model, Memory Center, ModelGate, Connector Hub, skill tools, Capability Acquisition, WorkflowHarness, HarnessTraceBridge, AgentLearning, EvolveSchema/GEPA and external memory hooks.

- Change navigation so agent infrastructure is advanced rather than primary.

- Replace skill-only acquisition assumption with unified Capability Resolver.

- Add central ContextPackage injection before harness execution.

- Add DurableRun/checkpoint persistence and connect existing harness events/traces to it.

- Audit verification default and GEPA production call paths before public benchmark.

- Add Knowledge Work v2 recipes and deterministic proof validators before adding more orchestration.

# 15. Acceptance gates for Waggle 1.0

- Fresh install reaches first useful task through local or BYOK model setup without requiring knowledge of agents/MCP/harness.

- Knowledge task can checkpoint, be interrupted, restart and resume without replaying completed phases.

- Missing connector can block inline, be authorized and resume the same run.

- Returning workspace task receives relevant Hive Mind context without requiring the executor to explicitly call memory.

- Strict recipe cannot report complete without required verification/ProofReceipt.

- Evolved recipe cannot become default without holdout/regression checks and rollback metadata.

- Core desktop workflow operates without Waggle cloud.

- Benchmark runner can execute raw-model and Waggle ablations with frozen configuration.

# 16. PRD-to-FRD traceability

- Home/Attention requirements → FRD sections 3 and 9.

- Workspace/Harness/Proof requirements → FRD sections 3, 4, 5 and 15.

- Skills/Connectors/Capability Acquisition → FRD section 6.

- Hive Mind/context ownership → FRD section 7.

- Self-evolution → FRD section 8.

- Models/onboarding → FRD section 10.

- Mobile/deployment → FRD section 11.

- Privacy/KVARK boundary → FRD section 12.

- Benchmark/evaluation → FRD section 13.

- Current-repo migration → FRD section 14.

# 17. Recommended implementation sequence

- Wave 0: audit current harness verification, trace bridge and GEPA execution correctness.

- Wave 1: DurableRun/checkpoint store + strict verification + proof receipts.

- Wave 2: central Hive Mind ContextPackage retrieval/injection/capture loop.

- Wave 3: Knowledge Work Harness v2 and benchmark ablation runner.

- Wave 4: unified Capability Resolver and inline blocked-run resume.

- Wave 5: UX simplification, Work Progress and Routines.

- Wave 6: onboarding/local model path and Qwen 27B tuning.

- Wave 7: email/calendar attention harvest, then Slack and additional channels.

- Wave 8: mobile companion baseline and Windows release hardening.

# 18. OSS Harvest / Build-vs-Borrow functional requirements

**FR-OSS-01:** Create an OSS Harvest record before each major feature/workstream. Record current-Waggle reuse options, OSS candidates, decision (borrow/adapt/build), rationale and owner.

**FR-OSS-02:** Decision order is mandatory: preserve existing Waggle implementation → reuse OSS unchanged → adapt/wrap OSS → contribute upstream where practical → build new code.

**FR-OSS-03:** Score candidates on license, maintenance, security/supply chain, dependency weight, Windows support, offline/local-first behavior, architecture fit, tests, performance and upstream maintenance burden.

**FR-OSS-04:** Maintain machine-readable or structured provenance inventory: repo URL, version/commit, license, modifications, attribution, security review, update strategy and responsible owner.

**FR-OSS-05:** BuilderIO/agent-native is a preferred reference for durable/background runs, shared actions, checkpoint/resume and proof-of-done where code/pattern reuse is license-compatible.

**FR-OSS-06:** Omnigent may supply/reference harness adapter and external-agent invocation patterns; integration must remain behind Waggle contracts and must not redefine Waggle architecture.

**FR-OSS-07:** Curated starter skills are harvested from suitable OSS ecosystems when possible; every imported skill receives license, provenance, safety and quality review.

**FR-OSS-08:** Connector/MCP development first searches for maintained OSS adapters/servers; Waggle wraps them behind Capability Resolver contracts when feasible.

**FR-OSS-09:** Inference remains based on Ollama/vLLM/OpenAI-compatible runtimes unless a written gap analysis justifies new inference infrastructure.

**FR-OSS-10:** Benchmark integration uses official runners/adapters/scorers where available; modifications are isolated, versioned and disclosed so published comparisons remain credible.

**FR-OSS-11:** CI/release checklist verifies license notices, attribution, dependency/security scan and provenance completeness for borrowed components.

**FR-OSS-12:** Every implementation wave begins with OSS Harvest/Build-vs-Borrow audit before coding starts.

# 19. OSS acceptance criteria

- No major capability is started without a recorded Build-vs-Borrow decision.

- No borrowed component ships without known license, pinned provenance and required attribution.

- Security/supply-chain review passes or risk is explicitly accepted before release.

- Local-first/offline and Windows compatibility are tested for reused runtime components relevant to desktop.

- Benchmark publications identify official runner/version and disclose Waggle-specific adapter changes.

- Forked/adapted OSS has an explicit upstream-sync or long-term ownership strategy.
