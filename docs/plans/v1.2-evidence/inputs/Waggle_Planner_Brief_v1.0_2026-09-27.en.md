# WAGGLE

> **English translation** of [Waggle_Planner_Brief_v1.0_2026-09-27.md](Waggle_Planner_Brief_v1.0_2026-09-27.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days.

## Direction for replanning and resolution of PRD/FRD v1.1

**Document for the planner · document revision 1.0 · 27 September 2026.**

**Purpose:** turn the agreed product, the detailed audit and the follow-up review into one consistent, verifiable plan. This is not a new product concept, an approval for implementation, or a confirmation that the findings have been reproduced on the current code.

**Output of the next planner pass:** draft PRD and FRD v1.2, a single delivery plan, a finding-resolution register, migrations, tests, Build-vs-Borrow decisions and an updated estimate. The specification version is not the application version number.

> **We are reducing breadth, but we are not removing the central value: a local knowledge-work harness that uses memory, reliably finishes the job, has functional learning and provides measurable evidence of quality.**

## Contents

1. Planner task and limits of authority
2. Sources, authority and claim status
3. Settled product decisions
4. Reference mental model and the smallest complete vertical
5. Deliverables and scope: reliable foundation, benchmark core, public product
6. Execution, durable state and safe resumption
7. Verification, proof of completion and truthful traces
8. Hive Mind, RAWDETAIL and external executors
9. Skills, connectors, MCP and shared UI/agent actions
10. Learning, bounded evolution and promotion
11. UX, onboarding, models, routines, channels and mobile
12. KVARK, licenses, business and data migration
13. Benchmark and the right to a marketing claim
14. OSS-first: Build-vs-Borrow process
15. Waves, dependencies and estimation method
16. Mandatory acceptance tests
17. Resolution matrix C1–C22
18. Resolution matrix A1–A29
19. Matrix of all proposed cuts from the audit
20. What the planner delivers and what remains open
21. Final checklist
22. Source register

## 1. Planner task and limits of authority

**DIR-01 — Planning before implementation.** Read this document and its sources, verify the relevant claims at an exactly named revision of `marolinik/waggle-os` and return corrected specifications and a plan. For now, do not change the runtime, do not publish a release, do not change the license, do not trigger billing/refunds, do not change the repo's visibility and do not launch paid benchmark studies without separate approval. Writing planning artifacts is the task; executing the plan is the next step.

The first goal is not to produce the largest possible backlog. The first goal is to distinguish between: what already works, what exists but is not wired, a real defect, an extension proposal, and an old decision that the user has replaced with a new one. Do not conclude that a function works from a file name; do not conclude that it does not exist because it lacks the exact name from the FRD.

For an important finding, record: the reviewed commit, path/symbol, input, current output, reproduction test or verification limitation, expected behavior and the smallest required change. If a finding from an earlier audit has already been fixed, mark it as closed with evidence, not as new work.

Proposals in this document that are not direct user decisions are marked as **planner direction** or **contract proposal**. Elaborate them in the draft; do not present them as already implemented functions or additional user approvals. Deviation is allowed with a clear reason, an alternative and the impact on the product, tests and schedule. Silently dropping differentiation is not allowed.

## 2. Sources, authority and claim status

### 2.1. Order of precedence

| Label | Source and role | Usage rule |
|---|---|---|
| D | Explicit user decisions in the conversation of 27.09.2026. | Authority for product direction. Do not reopen what has already been settled. |
| S1 | Detailed audit `…agent-ac748482c5af17ddf.md` | Main technical input. Its findings are audit claims tied to the reviewed revision; revalidate before changing code. |
| S2 | `cryptic-mixing-prism.md`, 04.09.2026. | Historical plan for Waggle Teams and reuse inventory. Old pricing, the Teams/cloud default and "LOCKED" decisions do not override the newer agreement. |
| S3 | `…rustling-milner.md` | Summary of S1, not an independent second confirmation. Use for readability; do not duplicate evidence. |
| S4 / S5 | Waggle PRD/FRD v1.1 of 27.09.2026. | Existing specification drafts to be refined. Do not copy audit content into them without resolution. |
| P | Follow-up review and this document | Analysis, corrections and proposed implementation contracts. They are not new results of executed tests. |

In its introduction S1 states a read-only review, but in §1–§7 it mixes confirmed spot-check findings, estimates and proposals. S3 explicitly states that it is a summary of the same work. S2 proposes Waggle Teams, per-seat billing and a cloud-model default; that product direction has been superseded by newer decisions. [S1: introduction, §1–§7; S2: §4; S3: "How the review was done"]

### 2.2. Mandatory labels in revised documents

Use the statuses **DECISION**, **CONFIRMED AT REVISION**, **AUDIT FINDING — TO VERIFY**, **PARTIAL/UNWIRED**, **PROPOSAL**, **DEFERRED** and **UNKNOWN**. "Exists", "ready" and "works end-to-end" are not synonyms.

Example: zero occurrences of `ContextPackage` does not mean there is no retrieval. S1 W2 explicitly requires preserving the existing `recallMemory` engine and its seven paths. The new subject of work is the contract, budget, provenance, durable reference and the wiring of executors. [S1: C8, A26, W2]

Example: Stripe products, a pricing page or tier branches do not prove that active subscribers exist. Before any migration of money or accounts there must be an inventory of the actual state, with authorized access. [S1: C2, A2, WB; P: resolution]

### 2.3. Limitations of this document

This document was assembled from three fully attached planning documents, earlier specifications and decisions made in the conversation. It is not a new executed audit of the repo. Test counts, commit gaps, model specifications, provider prices, license status, API terms and public benchmark results do not become confirmed current facts by being repeated here. The planner verifies them only where they affect a decision.

The detailed audit in table §3 has **24 rows of cut/deferral proposals**, although the summary describes "25 cuts". §19 of this document addresses every existing row; do not invent an additional cut to match the headline number. [S1: §3; S3: L13]

## 3. Settled product decisions

The following decisions come from the user's explicit agreement; they are not proposals by the author of the old Teams plan.

| ID | Decision | Consequence for the plan |
|---|---|---|
| D-01 | **Waggle is free/open-source for the individual.** | Do not reintroduce a paywall for local memory, harness, skills, basic evolution, approvals or routines. The exact license implementation requires review. |
| D-02 | **Waggle = me; KVARK = us.** | There is no separate Waggle Team/Enterprise product. Team and enterprise capabilities come through connecting to KVARK. |
| D-03 | **KVARK remains exclusively on-prem.** | Model calls, evaluation and organizational context must not silently end up with a cloud model provider. No cloud fallback in KVARK mode. |
| D-04 | **Waggle is desktop-first/local-first.** | Windows/Tauri is primary. CLI and web/self-host are supported separate installation paths. Cloud convenience is a later phase. |
| D-05 | **BYOK remains in individual Waggle.** | Local-first is not a prohibition of a voluntarily chosen external model or of all online connectors. Show where data goes. |
| D-06 | **Knowledge work is the primary job.** | Research, analysis and business artifacts carry the first proof of value. Coding is a supported type of work, not the product's identity. |
| D-07 | **Home is preserved, not redesigned from scratch.** | What Needs Me / My Work / Routines / Ask Waggle. Verify and complete the existing parts. |
| D-08 | **Workspace is the central object.** | Chat lives inside the Workspace, with the existing sessions and tabs. Do not create a new parallel conversation ontology. |
| D-09 | **Technical agents stay below the surface.** | Spawn, Waggle Dance, orchestration and MCP plumbing are not mandatory steps for an ordinary user. Advanced access remains. |
| D-10 | **Skills and connectors are used inline.** | The agent recognizes the needed capability; the user can add it themselves. "Inline" does not mean that OAuth or secrets are handled in LLM text. |
| D-11 | **External executors remain an optional capability.** | Claude Code/Codex/Hermes are engaged as needed; the result returns to the same Workspace. Do not assume that every task depends on them. |
| D-12 | **Hive Mind remains the memory foundation.** | Preserve the existing retrieval and isolation; close the central context/capture flow, without rewriting the memory engine. |
| D-13 | **Evolution is part of the product thesis.** | Do not reduce it to inactive modules or a demo. Real candidate execution, evaluation, activation and rollback to the previous version are required. |
| D-14 | **Long-running work and routines are part of the product.** | Distinguish a durable run, cognitive memory and a schedule. A laptop that is turned off does not execute local work. |
| D-15 | **The reference target is the Qwen 3.8 27B class.** | Verify the exact model ID, revision, quant and runtime. An older model is a control baseline, not a silent substitute for the target. |
| D-16 | **Fusion is not in this scope.** | No council/5-hats/agent-fusion program. Preserve existing useful subagents, without a new product around them. |
| D-17 | **BORROW → ADAPT → BUILD.** | First existing Waggle, then suitable OSS, then new coding with a justification. No automatic fork or framework migration. |
| D-18 | **Benchmark is key evidence, not decoration.** | The frontier-class thesis is a hypothesis until the result supports it. Do not design the test so that Waggle must win. |

Future billing for an individual convenience service, hosted compute or ecosystem has not been ruled out, but it is not the job of this release plan. It does not change D-01 and does not turn KVARK into a public cloud inference product.

## 4. Reference mental model and the smallest complete vertical

### 4.1. Architecture map for planning

**User world:** Home provides attention and continuation of work; the Workspace holds sessions, files, context, tasks and results; Routines run approved repeatable jobs; Settings/Advanced enable direct management of models and capabilities.

**Execution world:** intent → task shape → selection of a versioned procedure → context assembly → capability resolution → phase execution → evidence/proof → result in the Workspace. The native agent, subagents and optional external executors sit behind the same work contract.

**Horizontal layers:** the durable runtime spans the entire work; Hive Mind provides and receives cognitive context; permissions/provenance apply to every action; observability collects traces; learning/evolution proposes verified changes to future behavior.

**Boundary:** KVARK connects the organizational world without automatic spillover of personal memory. It is not another local tier flag. OSS-first is an engineering policy, not an instruction for the runtime agent to fetch and build arbitrary code on its own when something is missing.

The last picture is a **target mental model**, not evidence of implementation. The arrows should not be understood as a single linear pipeline: durable work is not a phase after the final answer, nor is memory used for the first time only at the end. [D; S4/S5; P: diagram resolution]

### 4.2. Reference knowledge-work vertical

**DIR-02 — One complete job before expansion.** In an existing Workspace, the user requests a research brief or a business report based on attached sources and prior decisions. Waggle selects an existing relevant skill, assembles context, performs the job with a local model, shows understandable progress, saves a checkpoint, survives a controlled interruption, resumes without duplicate external actions, generates the artifact, shows the level of actual verification and saves the permitted findings in the right scope.

A second pass receives a new source or a correction. The result is updated with the exact provenance of the changes. A third, isolated evaluation pass compares the same model without the full Waggle path against the same model in Waggle. This is not a standalone public benchmark, but an integration acceptance scenario.

The initial complete set should contain **two recipe variants for two kinds of deliverable: research brief and document production**, as W3 proposes, instead of all families at once. Feasible analysis is included in them; the document does not need a separate, entirely new "analysis engine". [S1: W3; P: focus]

## 5. Deliverables and scope

### 5.1. Three mandatory milestones

| Milestone | Content | What must not be claimed |
|---|---|---|
| G1 — Reliable internal candidate | Reproduced and fixed critical problems, truthful statuses/verifications, individual approvals, scope tests, actual activation of permitted overrides. | "The entire new Waggle vision is complete." |
| G2 — Benchmark-ready knowledge-work core | Production path, reference local model, existing skills, central context, durable run, two recipe paths, proof of completion, basic progress and a completed first controlled A/B. | "Frontier-class" from a small development sample or merely because the runner works. |
| G3 — Public product | Supported user flows, onboarding, selected channels, routines, a verified bounded learning/evolution path, KVARK boundaries, licenses and a qualified Windows candidate; a completed relevant study for performance-led messaging. | Marketing of a broader scope, channels, privacy or quality than the shipped package and results support. |

**Planner direction:** set G1 → G2 → G3 as the working baseline. The S1 option "ship current main as Solo 1.0, then the PRD as 2.0" is not approved by this. The existing fixed build may be a controlled preview with clear limitations. The public release number and the formal GO remain a separate decision.

It is not a condition for G3 that the local model beats frontier. The condition is that the job works, that the study was conducted according to the rules and that the message matches the result. A negative result is not a reason to skip publishing the methodology or to change the test after looking at the final answers.

### 5.2. What gets narrowed, and what is not deleted

For G2, do not require a new mobile application, all mail/chat ecosystems, arbitrary graph evolution, a full competitive coding program or a complete overhaul of the Team server. But do not reduce G2 to a demonstration chat without a real context/durable/proof flow.

For G3, plan at least one genuinely useful mail/calendar scenario and basic routine management. The first selected ecosystem should be proposed based on existing adapters, permissions and feasibility, not by automatically building Gmail and Outlook at full parity. An API-key connector can prove the blocked/resume mechanism, but it is not sufficient evidence of the value of the Home mail/calendar product.

Broad recipe evolution remains for later. Bounded evolution of approved variants must not disappear without an explicit presentation of the trade-off. Preserve the native coding path if it exists and works; verify its actual level. "No big coding program" is not "Waggle cannot do anything without a cloud coding agent".

## 6. Execution, durable state and safe resumption

**Source of the problem:** S1 C8, C12–C14 and A4–A11. The following contracts are a proposal for making them concrete; adapt the names to existing types with an explicit compatibility map.

### 6.1. Conversation is not the same as a work run

**DIR-03 — Modes without fake verification.** Separate the interaction type (`conversation` or `work`) from the execution mode (`normal`, `strict`, `benchmark`). Do not force a greeting, a short clarification or a small answer through the entire multi-phase research workflow. Detected work gets a run and the appropriate procedure. Misclassification must be visible and correctable, without silently launching expensive long-running work.

| Mode | Proposed behavior | Invariant rules |
|---|---|---|
| Normal conversation | Existing lightweight agent flow; retrieval and permitted tools as needed. | Do not fabricate verification; scope, egress, approvals and the actual budget apply. |
| Normal work | Selected shorter or longer recipe; only justified phases. | Mandatory gates of the specific task are not optional decoration. Do not present failed work as verified complete. |
| Strict work | All mandatory checks; a defined evidence minimum; explicit blocking/partial when evidence or budget is lacking. | No skipping verify, no self-reported tool success, and no relaxing of security rules after a retry. |
| Benchmark | The same production semantics of the tested configuration, a locked manifest, the selected ablation profile and independent grading. | Does not unlock broader data/tools/approvals. The full Waggle configuration does not skip the mandatory verify. |

No mode grants greater authority. Propose and measure a latency budget per task shape; do not adopt the earlier general goal of ten minutes as evidence that a user job finishes within that time.

### 6.2. Order of run creation

**DIR-04 — The run exists before side effects, blocking and durable context.** Proposed order:

1. Resolve the user/Workspace and save the intent with a stable request identity.
2. Classify the job and select the initial recipe/version. For lightweight chat, the session path remains.
3. Create a `DurableRun` with scope, mode, budget limits and an initial permission envelope.
4. Assemble and durably link the `ContextPackage` to the run; record source references and versions.
5. Resolve capabilities; if they are missing, the run can already transition into a durable `BLOCKED_*` status.
6. After the corresponding grant, re-check authorization and fresh availability, then resume the same run.
7. Execute the phase; gates read the server-observed journal; the checkpoint is written at a confirmed boundary.
8. Completion produces the result and a verification record; memory consolidation follows as a separately recorded operation.

The ContextPackage may be prepared in memory before step 3, but durable references and resumption obligations must not depend on any package that is not linked to the run. After a restart, do not silently reconstruct the "same" context from new sources.

### 6.3. Minimal data contracts

| Contract | Minimum fields / responsibilities |
|---|---|
| DurableRun | `runId`, `workspaceId`, `sessionId`, request fingerprint, status, interaction/mode, recipe/model/runtime versions, budget limit/spent, context reference, cursor, timestamps, schemaVersion. |
| PhaseAttempt | Run/phase/attempt identity, input references, start/end, actual tool/evidence outputs, gate results, interruption reason. |
| Checkpoint | Confirmed phase boundary, phase result, artifact/evidence/context references and hash, budget spent, next step, schema version. |
| ToolAction / ToolAttempt | A stable intended action separated from an individual attempt; status, parameters/fingerprint, grant, provider token and receipt where they exist. |
| RunEvent | `runId`, monotonic `seq`, phase/attempt, type, user-facing label, status, evidence references and time. No secrets in the payload. |
| ProofReceipt | Subject and level of verification, verifier versions, observed evidence, mandatory and optional gates, warnings, unresolved items. Not a general seal of truth. |

SQLite `runs.db` is a natural candidate from the audit, but the final choice goes through §14. Do not add a new database if existing storage can demonstrably satisfy the same contract; do not store execution lease/lock state in semantic memory.

Atomicity applies to a confirmed transaction in the selected run store. Do not claim that the same SQLite transaction atomically covers an external email, a filesystem artifact and a separate `.mind`. For such boundaries, plan idempotent linking, outbox/reconciliation or another clearly described solution. An artifact hash confirms content, not business accuracy.

### 6.4. Statuses and process lifecycle control

Proposed minimal canonical states: `QUEUED`, `RUNNING`, `BLOCKED_CAPABILITY`, `BLOCKED_APPROVAL`, `FAILED_RETRYABLE`, `FAILED_FINAL`, `CANCELLED`, `COMPLETED`. Preserve the existing API contract through a state map; do not delete `starting`, `waiting_for_approval`, `interrupted` or `cancelling` without reviewing the callers.

`interrupted` from the old version must not automatically become either `COMPLETED` or an unconditionally repeated `RUNNING`. During migration, preserve the interruption reason and verify whether safe resumption is possible. Defer `PAUSED` until real semantics exist: waiting for approval is not the same as a user pausing the process.

**DIR-05 — The phase is the initial unit of recovery.** An unfinished phase restarts from the last valid checkpoint, using already confirmed outputs. Already executed side-effecting actions are not blindly repeated. There is no requirement to resume between two hidden model thoughts or arbitrarily in the middle of the agent loop.

Detach means that the UI detaches while the approved background job continues. Cancel means a request that no new actions start, a controlled stop and a terminal record. Loss of the SSE connection is not, by itself, a user decision to cancel. When a specific foreground path still intentionally terminates the job when the connection closes, the UX must say so clearly; the durable path requires a separately contracted resumption. [S1: A9, existing R3-008 behavior]

For reconnect, use an event sequence (`sinceSeq` or a compatible equivalent). Replay and duplicate events must not duplicate text, cards or side-effecting actions. Provide a run-scoped event bus; a global `harnessId` is not sufficient for two concurrent Workspaces.

### 6.5. Idempotency: an important correction to A7

**DIR-06 — Stable identity of a business action.** The audit's proposal `runId + phaseId + attempt + callIndex` identifies an attempt, but it is not a sufficient key for the same external action on retry. Changing `attempt` yields a new key; regenerating the plan can change the order of calls. Therefore, separate:

- `actionId`: a server-persisted identity of one intended/approved action, stable across retries.
- `attemptId`: the identity of an attempt to execute that action.
- `providerIdempotencyKey`: tied to the stable action, if the service supports it for the specific operation.

Identical arguments are not a sufficient reason to deduplicate all future actions: two approved daily routines may legitimately send two similar reports. Each approved occurrence of a routine has its own occurrence/action identity. A new `actionId` must not serve as a shortcut for the model to bypass an unresolved earlier attempt of the same action.

Proposed statuses for an action: `planned`, `approved`, `dispatching`, `succeeded`, `failed`, `unknown_outcome`. If the process crashes after provider success but before local confirmation, the status may be unknown. In that case, first check the provider state/receipt or ask the user to verify. For a non-idempotent service without the possibility of reconciliation, do not promise universal exactly-once and do not perform a blind retry.

A run must have only one authorized active executor for the same phase. Propose lease/fencing or another solution for the race between a restart and the old process. Save the budget already spent in the checkpoint; a restart does not reset spending to zero.

## 7. Verification, proof of completion and truthful traces

**Source:** S1 spot-checks, A4–A5, A17–A18; P: the difference between technical and substantive confirmation.

### 7.1. Defects that first require reproduction tests

S1 reports: verify skipped by default and in the catch; `VERDICT: FAIL` passes the regex; any bash call passes as a test; `run_harness` counts as verification; a budget stop disables verification. Link each finding to a specific red test and record whether it still exists at the selected revision. [S1: L5–L10]

In addition, verify the entire `HarnessTraceBridge` flow: the actual `ok`, duration, context and outcome must not become fabricated constants. In the follow-up review of the conversation, a mapping of a completed phase to `verified` and of tool records to `ok:true`/`durationMs:0` was observed; this is an additional candidate for verification, not new evidence of an executed test in this document.

**DIR-07 — The server is the authority for execution evidence.** The model may propose a claim, a plan or a phase output. It cannot itself produce an authoritative record that a tool was called, a file was created, a test passed or a permission was obtained. Gates read the actual executor/journal and confirmed artifacts.

### 7.2. Three levels instead of one "verified"

| Level | Example of valid confirmation | What is not confirmed by it |
|---|---|---|
| Execution/structural | The DOCX exists and can be parsed; required sections exist; the tool finished with an observed status. | That the conclusions are correct. |
| Verification of defined elements | Amounts, dates, cited quotations and references match the marked sources; a formula or test result has been verified by an appropriate validator. | All possible interpretations of the sources and every business recommendation. |
| Substantive review | A defined rubric for completeness, source fidelity and conclusions has been reviewed; explicit uncertainties remain. | A mathematical guarantee that there is no error, or regulatory approval of the document. |

Do not treat `VERDICT: CONDITIONAL` either as unconditional success or automatically as the same case as `FAIL`. The recipe must define whether supplementation or user review is required, or whether a result with a clearly stated limitation is allowed. In strict mode, a mandatory gate that has not passed blocks `COMPLETED`. A partial artifact remains available without a label saying that it is fully verified.

For knowledge work, the first deterministic checks should target things they can actually verify: file parsing, presence of required sections, references that resolve, accuracy of extracted numbers/dates, matching quotations, units and explicit contradictions. Source count by itself is not quality. An arbitrary source quota on every task is not the goal.

**DIR-08 — A budget stop does not create success.** When there are no resources for a mandatory check, preserve evidence of what was completed and why the job is incomplete. The user may approve additional budget or accept a clearly labeled draft; the system must not retroactively delete the mandatory gate.

### 7.3. Hygiene of historical traces

Mark existing `verified` records without sufficient evidence as legacy/unqualified for evaluation. Do not delete the history of the user's work. Record the provenance of the status, verifier version and qualification state. Only qualified traces may be candidates for a particular eval set; even then they are not automatically declared a gold answer.

A change of taxonomy requires a migration map and a test that the dashboard no longer counts `gate_passed` as substantively confirmed results. In particular, distinguish failures of the model, tools, infrastructure, budget and evaluator.

## 8. Hive Mind, RAWDETAIL and external executors

**Source:** S1 C10–C11, A26, W2; S2 §3.3. The follow-up plan should not replace the existing retrieval with a new engine.

### 8.1. What is preserved, what is wired

**DIR-09 — Preserve retrieval first.** The initial obligation is to map the existing `recallMemory`, prompt assembler, scope rules, hooks, Weaver, memory MCP and extraction paths. If an equivalent of part of the `ContextPackage` behavior already exists, wrap it in a typed contract instead of duplicating it.

Proposed `ContextPackage`: identity/version, run/workspace/session, query/task shape, selected source/frame IDs, revisions/hashes, scope/provenance, trust/taint labels, token budget and priority, the permitted payload for the executor and reasons for omitting important sources. References are the first choice; copy private content only when necessary and permitted.

The context is a reproducible snapshot to the extent that permissions and retention allow. **A snapshot does not override deletion or revocation of access.** If a source has been deleted or revoked, or its scope has changed, resumption must not use the old copy just because the checkpoint points to it. Mark the invalidation and request a new resolution.

### 8.2. Three storage responsibilities

| Layer | Permitted role |
|---|---|
| Source material / RAWDETAIL | Verbatim evidence needed for retrieval and exact citation, when retention is permitted. It is not automatically a "learned fact". |
| Derived memory | Facts, decisions, preferences, relationships, summaries, confirmed outcomes and learned corrections with provenance. |
| Execution state | Runs, checkpoints, retries, grants, leases and budgets. Not a semantic memory frame. |

Preserve the RAWDETAIL path that is covered by existing memory tests; do not remove it because of our earlier overly broad sentence "do not store every token". Temporary hook content may have an operational purpose, but it is not automatically promoted into long-term facts. Define a separate channel, TTL and retrieval exclusion where needed; do not lose provable sources. [S1: C11]

The system works with available user messages, visible outputs, tools and artifacts; it does not assume access to the private hidden reasoning of external models. Memory consolidation must be idempotent per run/output version, so that a restart does not produce duplicate conclusions.

### 8.3. Scope and prevention of double injection

Test personal and each workspace separately. In particular, reproduce the reported copying of workspace run summaries into the personal mind. A derived fact inherits the restrictions of its source; a classifier or evolution cannot declare it public on its own. [S1: A26]

The proposed `WAGGLE_CONTEXT_INJECTED` marker serves coordination, not authorization. Pair it with the run/context ID and the expected execution path. A hook must not accept untrusted content that claims to be "already verified context" and therefore skip the scope/taint check.

### 8.4. External executors remain, without unproven promises

**DIR-10 — Same Workspace, explicit executor.** For Claude Code/Codex/Hermes verify: detection, authorization, context handoff, working directory, tool permissions, timeout/cancel, return of the actual result and capture with the exact workspace/run identity. A launcher or hook package alone does not prove this entire flow.

The native agent remains the main individual execution path. An external executor is an optional child job that returns status, output, artifacts and known limitations. Do not label its internal actions as server-verified if Waggle receives only a textual summary.

Do not require all external harnesses to work automatically with the local Qwen endpoint: support for a specific harness, protocol, authorization and runtime should be qualified. In KVARK mode, an executor that requires an unapproved cloud endpoint is not available. The name "external agent" is not permission for organizational context to leave the boundary.

## 9. Skills, connectors, MCP and shared UI/agent actions

**Source:** S1 C13–C16, A12–A15, W4; D-09/D-10/D-17.

### 9.1. One resolver contract, not necessarily one big rewrite

**DIR-11 — Shared capability model.** The inventory covers native tools, active and inactive skills, approved starter packs, connectors, MCP and marketplace candidates. Existing searches may remain behind a shared interface until the need to physically merge all engines is proven.

First filter candidates by permissions, egress, readonly rules, availability and trust. Only then rank by task fit, reliability, setup and runtime cost. The order "native → skill → connector …" is a proposed tie-breaker/reuse preference among usable candidates, not a rule that a wrong native tool must beat a suitable connector.

### 9.2. Permission envelope without old paywalls

Do not blindly copy the audit's A12 precedence with `tier` as an individual boundary. The proposal is an **intersection of applicable restrictions**: system security and egress limits; KVARK policy/ACL when connected; user-approved scope; Workspace and role/read-only restrictions; capabilities of the specific tool. The resolver never expands permissions.

Do not build a large Solo policy engine to make this work. Use the existing grants, allowlist/denylist and confirmations, with an explicit contract. Minimal user control is not an "optional user policy feature" that we can defer entirely.

### 9.3. Inline setup is continuity of work

Proposed definition: a card explains what is missing, why, the required scope and the consequence. A secret is entered in a protected field, or OAuth in the system browser. The run remains durable. After a valid callback, the SetupCompleted event is bound to the right request; the model does not see the token; the same job resumes only with a valid grant.

A durable capability request contains the run/request ID, the proposed tool, the extent, the state and the deadline. OAuth state/nonce, callback origin, PKCE where applicable and mapping to the right run must be verified server-side. A closed window, a callback for another run or expired consent do not become a successful authorization.

For MCP binary and remote marketplace installations, in the first scope it is permitted to show the proposal inline and complete the installation in Settings with SecurityGate and the user. Returning to the job must not lose the intent. Do not install arbitrary unverified executable code in the background just to make the UX look "magical".

### 9.4. Shared actions and the UI agent

**DIR-12 — The same functionality through the UI, the agent and a routine.** For Waggle's own actions, define/reuse the same typed action/service contract: input schema, scope, side-effect class, validation, approval, result, audit and idempotency. A UI click, the agent and a routine must not have three inconsistent implementations of the same business action.

This is not a requirement that the agent click its own DOM when a reliable internal action API exists. UI/browser automation of external applications remains a separate capability with its own permissions and tests. The agent does not confirm its own approval or bypass a security screen.

BuilderIO/agent-native is a named candidate for these patterns; verify the specific code and claims about durable/replay functions before borrowing. This document does not confirm that this project has a ready engine that we can simply plug in.

### 9.5. Skills and learning

Preserve the existing skill create/distill/audit/hygiene/retire/recommend paths when they are active. Importing a package is not the same as successful use on Qwen: verify dependencies, tool naming, model-specific instructions and artifacts. Load relevant parts, not the entire catalog into every prompt.

The user can add a skill/connector directly in Advanced. Self-evolving skills have versions and verification; by changing instructions they cannot add network scope or a new executable binary, or bypass approval. Distinguish permission for experiments on instructions from permission to install software.

## 10. Learning, bounded evolution and promotion

**Source:** S1 C10, A16–A19, W3e; P: a bounded recipe scope instead of complete deferral.

### 10.1. First confirm that existing learning has an effect

**DIR-13 — Active behavior, not module names.** For `AgentLearning`, `EvolveSchema`, GEPA and deployment overrides, build a map: who calls it, what it produces, where it is stored, how the active version is selected and which subsequent run uses it. If a module has no callers, that is a functional gap, not a finished feature. If it is being replaced by another existing module, preserve the intended behavior and remove false UX claims.

Separate acceptance: an evolved persona/skill/spec override actually enters the next effective prompt; the built-in persona does not shadow it. Rollback restores the previous active version. An already started run remains bound to its version; it is not subject to a silent hot-swap. [S1: L11, C10]

For ComposeEvolution, verify that the winning schema is not merely returned as a result field, but is actually used in instruction evaluation and subsequent execution. The final score must be derived comparably; do not subtract different metrics or samples and call it an "accuracy improvement".

### 10.2. Minimal closed experimental flow

The proposed mandatory flow is: development examples → baseline executed through the target runtime → candidates → actual target outputs → deterministic checks and/or grader → paired comparison → validation/promotion control → versioned registry → explicit activation → next run → monitoring/rollback.

The `makeRunningJudge` guard is useful, but its presence is not sufficient without a test that the candidate is executed. The similarity of the candidate prompt text to the expected answer is not what gets graded. Save the outputs and the model/runtime manifest so that this can be verified. [S1: W0, W3e]

### 10.3. Bounded recipe evolution for the first serious scope

**DIR-14 — Evolution within the permitted space.** The proposal is a small registry of approved variants for research/document work, not a generator of arbitrary graphs. The basic procedure can be compared with an additional contradiction check or a permitted retrieval/review variant. Candidates may change instructions, the arrangement of approved optional phases and budgets within limits.

Immutable invariants: scope, egress prohibitions, approvals, budget cap, mandatory gates, contamination boundary and the meaning of success. A recipe that obtains a better score by skipping a security check is not a candidate for promotion.

The planner evaluates this bounded scope separately. It is not already contained in S1 W3e, which explicitly excludes recipe evolution. If even the bounded part is proposed for later, show which user outcome and public claim are thereby dropped; do not rename prompt optimization as "evolves the entire way of working".

### 10.4. Evaluator, data and rights

A local evaluator is the default for the local profile. A single local user model may perform the generator and rubric evaluator roles separately, with an explicitly labeled bias risk. **A second model family is a desirable independent control, not an absolute prerequisite for free Waggle to work on a single machine.** For the final evidence, verify quality deterministically or by independent/human review according to the protocol.

A Waggle cloud/BYOK judge requires separate approval for the data that is sent, minimization, redaction and budget. In KVARK mode, that egress is not permitted beyond the on-prem boundary. The new evaluation must not use the legacy Anthropic-key condition as a hidden mandatory dependency. [S1: L13, A16]

User corrections are a signal, not a ready-made gold answer. User confirmation is a different kind of signal from tool success. Each eval example has provenance, workspace/persona scope, usage rights and qualification. Personal work does not spill over into a shared eval set without permission.

### 10.5. Promotion policy and hidden test

**DIR-15 — Comparing like with like.** The baseline and the candidate must be re-graded on the same examples and budgets. Define quality, the minimum practical difference, the permitted regression per task shape, latency/compute and the procedure for grader errors. Errors on harder examples must not disappear from the denominator because the scorer returns `null`.

Separate development/training, validation/promotion and the sealed final benchmark test. Repeatedly selecting the winner against the same holdout over time makes it part of the optimization; therefore, limit re-use in advance and record every look. The number "at least 30" from A17 is not universal evidence of sufficient statistical power.

The first promotions are explicit and rollbackable. Later automatic promotion may be the topic of a separate policy after evidence. Continuous improvement does not mean permission for uncontrolled changes to the user's way of working or permissions.

## 11. UX, onboarding, models, routines, channels and mobile

### 11.1. UX: preserve what exists, hide internal complexity

**DIR-16 — No large UI rewrite as the default solution.** Check the existing HomeCockpit, Workspace routing, sessions/tabs, ChatWorkCanvas, MemoryCenter, Sidebar and command catalog. Do not build new surfaces merely because the audit or an earlier sketch used a different name. [S1: W5; S2: reuse inventory]

The user's main path remains Home → Workspace → work/result. Routines are visible from Home and manageable; Settings/Advanced enable control of capabilities. Agents, Waggle Dance and spawn should not be mandatory navigation. Role/mode may remain an optional, understandable choice; the user does not have to choose among some twenty personas before the first task.

Apply the proposal "zero occurrences agent/MCP/harness/swarm" from A23 to unnecessary technical instruction in the everyday path, not as a prohibition on truthful naming. An approval must clearly state when the work is executed by Claude Code or when a connector sends data externally. Do not hide security-relevant information for the sake of cleaner copy.

Work Progress shows the phase intent, actual status, blocker, cost/budget when relevant, result and View work reference. Do not invent a completion percentage or remaining time. Also show the failure/partial path. Do not show private reasoning; show sources, actions, decisions awaiting approval and evidence.

A new surface must have tests for keyboard, focus, readability, screen-reader statuses and stream interruptions. WCAG 2.2 AA is the proposed acceptance target from A24, not a claim that the entire current product is compliant. English-only UI is an audit proposal that requires an explicit decision; centralizing new strings can be done without introducing a full i18n project.

### 11.2. Onboarding: rearrange the proof of value, do not rewrite the runtime

Preserve the existing resumable wizard and ModelGate where they are of good quality. Proposed flow: what do you want to do → how to run the model → first Workspace and selected sources → optional mail/calendar connection → first real task. Merging two steps is allowed if it reduces friction. Do not ask for persona/harness/MCP just for the sake of configuration.

Before a model exists, onboarding uses deterministic screens; it does not claim that it is already driven by a functional LLM. The first job must show an artifact or a useful result, not just a "hello" test. However, installing a multi-gigabyte model on a slow connection is not a criterion that can universally be reduced to ten minutes.

**DIR-17 — Readiness is live evidence.** The check of the selected model should confirm a real response; for the work profile, also check a relevant tool/structured-output round-trip. The presence of a key or a catalog entry is not a successful generation. Cold start, timeout, unavailable service and incompatible tool format have different messages; do not present a format-only check as "verified". [S1: A20–A21]

### 11.3. Model, runtime and hardware ladder

The Qwen 3.8 27B class remains the user's reference target. The planner confirms the exact official ID and revision, license, supported quant, model format, tool calling and compatibility with the pinned runtime. The audit states that the earlier evidence is on a different, MoE configuration; do not carry scores or hardware behavior over between them. [S1: C19]

**A model that fits on disk is not necessarily a model that runs usably.** The hardware ladder should state disk for download/cache, RAM/VRAM or unified memory, weight format/quant, context/KV-cache budget, CPU offload, concurrency and measured latency on representative work tasks. Do not assume a universal minimum of "24 GB GPU" from a single rough estimate.

Proposed installation paths: the existing managed local runtime on a supported Windows profile; optionally an already installed Ollama; a validated OpenAI-compatible endpoint; BYOK. vLLM is a candidate for an appropriate self-host/server path or endpoint, not an unverified mandatory one-click native Windows installation. The file `path` and the API `base_url` are different fields and experiences.

Resumable download, checksum, free disk space, interrupted installation, rollback and a real health check belong to installation quality. Downloading a model has an internet dependency; an offline package prepared in advance is a separate supported profile. A weaker local model may be a fallback with honest limitations, not a disguised substitute for the reference benchmark model.

### 11.4. Attention and channels

**DIR-18 — One WorkItem, clear sources.** Attention normalizes Action, Commitment, Decision and Signal. These are not automatic orders to the agent. A WorkItem has status, provenance, source time, relevant Workspace, confidence/priority reason and user correction. Duplicates are merged only with sufficient evidence; an incorrect merge must be reversible.

The first step may use the existing Gmail/GCal/Outlook/Slack connectors, but the plan must name one initial scenario and the actual authorization path. Background incremental sync is not the same as a health probe or a manual fetch. The following are required: cursor/delta persistence, handling of a lost cursor, dedup, revoked credentials, retention and labeled eval examples for precision/false positives. [S1: W7]

For each channel, state the profile: approved live API, bot/forward, export/import, direct local source or roadmap. Audit claims about WhatsApp/Viber/Discord terms remain subject to official verification for the specific use-case. Do not repeat a blanket "no API" and do not use user tokens/scraping as an unexplained production default.

The prompt-injection scanner is defense-in-depth, not evidence that the content is not malicious. Harvested email remains data with a taint/provenance label. Text in it cannot change policy, request copying of the vault or grant approval for sending files. Convert-to-work does not execute an unapproved external effect.

### 11.5. Routines and the old TOOLLESS Loops

**DIR-19 — A trigger is not new intelligence.** A routine is a schedule/event trigger for an allowed work recipe, with its own occurrence identity, budget, Workspace, policy and result channel. It does not have to have a separate "routine harness family". The existing CronStore/LocalScheduler and management UI are the first candidates for reuse. [S1: C15, W5]

The old TOOLLESS Loops L2 remains detection/proposal within its limitation. An approved routine may start a tool-using work run through the same permission/durable layer. This requires an explicit delineation or a superseding ADR, not a silent expansion of the old loop's authority.

Define the timezone and the behavior on a missed slot, daylight saving time change, restart and duplicate event: skip, one catch-up or another bounded rule. Approval for a daily draft is not automatically approval for sending. The user sees the next slot, the last result, the blocker and pause/disable of the routine itself; this is not the same as a mid-phase pause of the executor.

### 11.6. Mobile companion and local-first

The existing IM channels are the proposed first remote-control scope: status, result, forwarding into a WorkItem and approve/deny where securely wired. This is not a finished mobile Workspace UI nor a new native application. A review of the actual responsive web behavior remains necessary; the existence of an icon rail is not evidence of phone usability.

Pairing and allowlist must map the user to the appropriate scope. Approval via message is bound to the run/action, payload fingerprint, expiry and a unique token; quoting or replaying an old message must not confirm a new action. A provider account or sender name alone is not sufficient evidence.

A desktop that is offline cannot execute local routines or respond to the phone. Do not expose the loopback sidecar to the public internet for the sake of a single mobile checkbox feature. LAN/VPN/relay/native/PWA variants are explicit alternatives with security and product scope. A Waggle-owned cloud relay is a later service, not a hidden dependency of the local product.

## 12. KVARK, licenses, business and data migration

### 12.1. The KVARK connection is a real capability boundary

**DIR-20 — Team through KVARK, without tier pretense.** A flow is needed for validating the connection and identity, allowed organizational capabilities, token storage and revocation. `ENTERPRISE=true` in the local config is not sufficient. Check S1 A27 on `createKvarkTools` callers and the existing KvarkClient before adding new modules.

Personal and organizational work have an explicit boundary of sources, memory and execution. "Connect to KVARK" does not automatically copy the personal mind, private emails or personal runs into the organization. Disconnect/revocation terminates further access, including cached organizational context according to policy. Do not automatically fall back to a personal BYOK model when on-prem KVARK is unavailable.

KVARK-native organizational functions are not subject to rewriting in free Waggle. The planner states the required contract/interface changes, the responsible owner of the KVARK dependency and the unavailable UX. Do not promise team functionality just because a Team tab is displayed.

### 12.2. Tier, Stripe and old team code

Inventory the TRIAL/FREE/TEAMS/ENTERPRISE branches, gates, www copy, checkout/webhooks, licenses, team-sync and the secondary server/worker. Individual protection, approvals and reasonable control of work must not remain behind the TEAMS paywall.

Do not delete the entire team backend in order to change a slogan. For each component the planner proposes: keep as a KVARK adapter, extract, retain legacy compatibility or remove with a test. The multi-user BullMQ/Postgres/Clerk path does not become a separate new Waggle Team product.

This plan grants no authority to cancel billing or issue refunds. First verify whether real customers, active subscriptions and obligations exist. If they exist, create a separately approved migration communication/financial plan. If they do not exist, do not estimate a fictitious customer migration as a mandatory large workstream.

### 12.3. Licensing and publication

D-01 determines the intent of a free/OSS product, but does not automatically resolve all rights over the code and dependencies. Establish ownership and approved licenses, root/per-package NOTICE, old proprietary markings, imported code/skills, models and native binaries. Do not change someone else's license and do not keep a key free feature secretly closed contrary to the agreement.

Verify the repo state (private/public), attestation, signing and publication permissions against the current configuration. S1 claims a particular state on its snapshot; do not copy it as a permanent fact. SBOM/THIRD_PARTY_NOTICES and model/runtime provenance must match the actually shipped package. [S1: C5, A28, OSS gate]

### 12.4. Minimal migration map

| Subject | Requirement for the plan |
|---|---|
| `agent-runs.json` → durable store | Schema version, dry-run, snapshot, status mapping; an old interrupted run does not repeat unknown side effects. |
| Cron leases / Loop state | Separate the schedule from the execution state; migration of occurrence identity, with no duplicate catch-up. |
| Persona/spec/skill override | Effective active-version pointer, compatibility, pinned version for a started run and rollback. |
| Legacy verified traces | Qualification/migration without deleting history; exclusion of unreliable rows from the gold/eval path. |
| Context and memory scope | Scope/provenance are preserved; revocation and erasure also apply to checkpoint/reference copies. |
| WorkItems, journal and artifacts | Retention/GC, export/delete and referential integrity; no new undefined durable copies. |
| Tier/billing/team-sync | Real inventory before change; read-compatible config migration; no financial side effects without approval. |

**DIR-21 — Rollback is not a restoration of erased rights.** A code rollback must not revive deleted personal data, revoked consent or erased credentials. The backup/downgrade plan must state how it respects the current erasure/revocation state. A sent email is not "rolled back" by restoring the database. The audit requires including new stores in the existing erasure/export mechanisms; this is a technical requirement, not a claim that legal compliance is thereby automatically proven. [S1: A2–A3]

## 13. Benchmark and the right to a marketing claim

**DIR-22 — Product evidence through the real product.** The tested Waggle must execute the task through the same production sidecar/runtime path as the user. A separate benchmark adapter may translate input, start an isolated run and collect output. It must not covertly use a better separate harness that the public application does not have. [S1: A25, W3]

### 13.1. Choosing the first benchmark

Keep the existing τ² and GAIA2/ARE adapters where usable, but verify whether they cover the main knowledge-work outcome. GDPval, APEX-Agents, FORTE and OdysseyBench from the earlier conversation are **candidates for verification**, not an already approved and implemented suite. This document does not confirm their current sizes, licenses, runner openness or leaderboard numbers.

For the first choice, return a short evidence card: official source/version, availability of tasks and references/scorers, usage permission, artifact/tool environment, possibility of local execution, grading method, existing published baseline configurations and integration effort. Select one primary professional-work test, not six mandatory suites from day one.

According to S1, the old `feature/harness-sota-bench` branch lags significantly behind. First review the diff and cherry-pick/adapt useful adapters; do not automatically require a large rebase of the entire old runtime just for the sake of the runner. [S1: W3]

### 13.2. Two separate comparisons

| Question | Correct experiment | Boundary of the conclusion |
|---|---|---|
| What does Waggle add to the same model? | Same model/revision/quant, same data and controlled resources; minimal baseline vs Waggle; then selected ablations. | Effect of the system and of individual layers in that environment. |
| How does it compare to a competing system? | A fully named frontier configuration/harness, the same benchmark/protocol or a clearly labeled reference to someone else's published measurement. | System-to-system result, not evidence that Qwen has become a better base model. |

A "raw model" on a tool benchmark requires a minimal sufficient tool adapter; do not deprive the baseline of access to required files so that Waggle wins. If vanilla chat without tools is compared with a tool agent, call it that and do not present it as a controlled effect of the harness alone.

A published leaderboard score is not automatically comparable with a standalone local run. Confirm the dataset split, scorer version, model ID, reasoning/budget, tools, number of attempts and harness. An API model in a neutral runner is not the same as the finished Claude/ChatGPT product.

### 13.3. Development A/B, then a locked study

The first development sample serves to find errors and estimate cost, not to produce a public "beats" headline. Propose the number of tasks after reviewing task variance and resources. Then freeze the hypothesis, metric, sample, budgets, stopping criteria and analysis before the final test.

The ablation space may cover skills, memory, harness and the evolved variant, but do not require every combination in the first final run. Choose the minimum that matches the primary hypothesis and at least one way to check where the lift comes from. A small development sample does not replace the full evaluation required by the official protocol.

Benchmark mode does not switch off security boundaries. The full Waggle configuration keeps its mandatory gates. A baseline without the Waggle harness is scored by the same independent scorer; do not covertly inject the Waggle verification pipeline into it and then claim it is "raw". Every profile must be listed in the manifest.

### 13.4. Contamination, memory and fairness

Final test data, rubrics and gold answers do not enter training/evolution memory. Each independent task gets a clean scope, unless the benchmark explicitly requires continuity. A memory benchmark gets the same allowed history per protocol, not additional knowledge just for Waggle.

Learning may create local traces during evaluation for diagnostics, but does not use them for the next test example if the protocol does not allow it. Evolution is done on the development set; final versions are frozen. Run reset covers `.mind`, caches, persisted artifacts, actions and knowledge from previous examples, with a verifiable manifest.

### 13.5. Statistics and the meaning of the marketing message

**DIR-23 — "No difference detected" is not the same as "they are the same".** S1 cites the earlier `N=114, p=0.11` and the wording "matches", as well as the withdrawn claim about the GAIA2 lift. These numbers are carried here only as a warning from the audit. An unobserved statistical difference is not by itself evidence of equivalence. [S1: C18, §7]

The plan should link metric and procedure: paired analysis for paired tasks; McNemar only when it fits a binary outcome; effect intervals for scores; equivalence/non-inferiority only with a practical margin specified in advance and an appropriate design. Do not prescribe the same test for all metrics. Repeated comparisons, stochastic seeds, evaluator variability and the number of observed candidates must be part of the analysis.

Allowed messages depend on the result: "measured lift against our baseline"; "in this sample, no difference was established"; "confirmed non-inferiority within the defined margin"; "outperformed configuration X on benchmark Y under conditions Z". No general "beat the frontier" based on a single subcategory or on different protocols.

### 13.6. Cost and manifest

Record the code SHA, model/quant/runtime, hardware, dataset and scorer revision/hash, tool/skill versions, context and token limits, attempts/seeds, timeout and pause/recovery mode, complete output, grader output and cost. Separate model inference, evaluator, tool/API, GPU time, energy/hardware assumptions and human labor where they are estimated.

Local is not automatically zero cost. Do not call free/OSS software "free compute". Verify the provider price in the current official source before making a claim; the audit reports a mismatch between cost tables. In the test, do not send real business emails or perform unapproved actions on user accounts; use an isolated fixture/test environment. [S1: A29]

**A performance-led launch requires a completed study, not a guaranteed win.** Six branches and an arbitrary total of N≈1500 are not mandatory in advance; they depend on the goal, the official test and the budget. A separate Waggle LongWork public benchmark may come later; internal crash/resume acceptance is not deferred by this.

## 14. OSS-first: Build-vs-Borrow process

**DIR-24 — Preserve → Borrow → Adapt → Build.** Before each larger area, create a short record: existing Waggle, OSS candidates, evidence that the capability exists, license/maintenance/security, Windows and local-first behavior, dependency weight, API fit, tests, performance, update/exit strategy and a reasoned decision. One document per wave is sufficient if it covers the actual separate choices; a material new dependency decision requires an addendum.

| Candidate / source | What we are looking for | Condition and what we do not assume |
|---|---|---|
| Existing Waggle | Home/Workspace, skills, connectors, retrieval, approvals, crons, run registry, tracing, evolution, runtime and installer. | Confirm callers and the E2E path. Do not "preserve" a no-op as a finished capability. |
| BuilderIO/agent-native | Shared UI/agent actions, state/event model, reliable-mutation and proof patterns; durable behavior only if actually implemented. | Check the specific files/commit/licenses; do not copy code with unclear rights. No mandatory change of the Waggle framework. |
| Omnigent | Adapter contracts, result return, external-agent invocation and observability patterns. | No mandatory Python runtime in the standard no-Python Windows package; per-file rights and maintenance. Not a new foundation for Waggle. |
| OSS skill ecosystems | Curated knowledge-work packages and compatible skills. | Distinguish individual repos/packages and their licenses; "all Cowork skills are OSS" is not a shipping permission. |
| OSS connectors/MCP | Maintained adapters, auth and capability implementations. | Scope, supply chain, service terms and isolation; not every MCP binary as a silent install. |
| Ollama/vLLM/OpenAI-compatible | Inference infrastructure and model lifecycle. | Separate native desktop setup from server endpoint integration. Do not build our own serving without a documented reason. |
| Benchmark projects | Official tasks, runners, environment and scorer. | Pin versions and permissions; disclose modifications. Do not reimplement the scorer to get a more favorable result. |
| Durable engine candidates | The smallest sustainable way to handle checkpoint/run lifecycle. | Measure fit. SQLite is a candidate; it has not been decided in advance that we must build 600–1000 LOC. |

The old S2 states a different treatment of `anthropics/knowledge-work-plugins` and document skills. This is a historical license finding that should be confirmed on the downloaded version, not ignored or generalized. The same applies to GluoMem. In this scope, Hive Mind remains the production memory foundation; do not introduce the research line as a second parallel engine without reason. [S2: §3.2 P4, §3.3]

The inventory includes repo/package, exact commit/version/hash, license, modifications, notices, maintenance owner, security review and update strategy. Model weights and native binaries are also components. An automatic vulnerability scanner is not complete security verification; an unresolved finding has an owner, a decision and a usage restriction.

## 15. Waves, dependencies and estimation method

### 15.1. Keep the original wave IDs for traceability

| Stream | Direction for replanning | Deliverable it contributes to |
|---|---|---|
| WB + OSS | Immediate inventory of licenses, tier/kvark boundaries, old contracts and reuse decisions. Business direction locked; the concrete migration is verified. | G1/G3 |
| W0 | Red tests and truthfulness fixes; status, verifier, override, scope and trace risks. | G1 |
| W1 | Run store, server-driven phases, stable actions/journal, gates/proof, budgets, restart and detach. | G2 |
| W2 | Existing retrieval → ContextPackage/reference contract, isolation, capture and external handoff. | G2; extended integrations G3 |
| W3 | Two knowledge-work recipe paths, router, validators and production adapter. | G2 |
| W3e | First real prompt/schema/skill activation and paired evaluation; then a separately estimated bounded recipe path. | G2/G3 |
| W4 | Shared resolver facade and inline setup/blocked resume; initially the smallest useful safe capability scenario. | G2 minimal, G3 fully supported |
| W5 | Preserve Home/Workspace; basic Work Progress in G2, remaining IA/copy and routines polishing before G3. | G2/G3 |
| W6 | Live model readiness and the exact target runtime early; change of the onboarding experience and hardware ladder in parallel. | G2/G3 |
| W7 | One selected mail/calendar scenario, incremental sync and attention precision; channel expansion later. | G3 |
| W8 | Separate the existing IM companion minimum from final Windows hardening; fresh release evidence. | G3 |
| B1–B3 | B1 benchmark selection/protocol early; B2 development A/B as soon as the vertical works; B3 locked study after the freeze. | G2/G3 |

Proposed critical path for evidence of the core: W0 → minimal W1 + W2 contract → W3 production knowledge flow → W3e verified activation and selected ablations → B2/B3. Do not wait for all channels and full mobile development before the first honest test. W5 basic progress, W6 target readiness and the W4 minimal capability path must arrive together with this vertical, not as cosmetics after it.

For the public product, the qualified W4/W5/W6/W7/W8/WB and OSS deliverables are added. The revised plan must show real dependencies, not just equally long lanes for the sake of a pretty Gantt chart.

### 15.2. Estimate from the audit: starting input, not a new agreement

| Wave from S1 | Classic engineering days | AI-orchestrated engineering days |
|---|---:|---:|
| OSS | 9–11 | 4–5 |
| W0 | 6–8 | 3–4 |
| W1 | 39–52 | 17–24 |
| W2 | 18–24 | 9–12 |
| W3 | 34–46 | 16–22 |
| W3e | 18–26 | 10–14 |
| W4 | 26–36 | 11–16 |
| W5 | 23–34 | 11–16 |
| W6 | 18–25 | 9–13 |
| W7 | 40–45 | 15–19 |
| W8 | 8–10 | 5–7 |
| WB | 18–24 | 8–11 |
| **Total for the original reduced scope** | **257–341** | **118–163** |

The table is taken from S1 §4; the sum is arithmetically correct. The author says that overlap has already been removed. **Do not reduce the sum with a blanket "AI will do it much faster" discount, but also do not adopt it as the estimate for this corrected scope.** Bounded recipe evolution and a completed public study are not included in the same way in the original trimmed scope; a narrower initial channel scope may reduce another part.

The audit states a critical-path floor of 35–47 working days and 12–17 calendar weeks for its plan, with assumptions about founder review and parallel worktrees. These assumptions are not the user's confirmed available capacity. Replace the P50 label with "expert range" if there is no substantiated probabilistic model. [S1: §6]

Correct the calendar error: **12–17 calendar weeks from 27.09.2026. gives 20.12.2026–24.01.2027.**, before additional explicit pauses. Do not use January–February from the original summary without a separately accounted-for reason.

### 15.3. How to return a new estimate

**DIR-25 — Estimate from work, dependencies and evidence.** For G1, G2 and G3, show separately: remaining units of work, what is preserved/borrowed, test/migration effort, human review, CI/compute, calendar dependencies and external blockers. Do not claim a "completion" percentage from the number of modules.

Each wave has a concrete owner/role, input contract, output, exit tests, compatibility/migration, risk, rollback and affected receipt list. Hotspot files have a merge owner; parallel agents work behind agreed interfaces. Changes in `chat.ts` or `agent-loop.ts` cannot all be treated as independent streams without an integration cost.

Licenses, OAuth/provider requirements, signing and managed security review must have evidence of their actual status. Do not assume the duration of those procedures from an old document; it depends on the concrete path. Tests and model downloads have a compute/network cost separate from code-writing time.

### 15.4. Release evidence and integration discipline

S1 reports a large gap between `main 2af0904d` and older qualified candidates. This is an audit snapshot, not a current commit count. The planner must re-establish the reference code SHA and which evidence is valid. Do not carry a historical GO over runtime changes without appropriate verification.

Red test before the fix, green after. Verify the original build/lint/test command set from S3 against the current `package.json` before use; do not copy unavailable commands. Crash-injection must also be tested on the packaged Windows candidate, not only in the developer Node environment.

Choose the number of freezes according to dependencies and requalification cost; the three freezes from S1 are an assumption, not an immutable requirement. Public installer/signature, router, persona, auth and security receipts must state the exact revision, commands, environment, limitations and result. Do not use the old persona score as an overall knowledge-work benchmark.

## 16. Mandatory acceptance tests

The following tests are **proposed criteria for the new plan**, not a claim that they have already been executed. The planner assigns each one a location, fixture, environment, owner and G1/G2/G3 milestone. Set numerical thresholds for quality/latency/precision before the locked test based on the baseline and risk, not after the fact to suit a convenient result.

| Test | Scenario and measurable expected outcome | Link |
|---|---|---|
| AT-01 | Verify output `FAIL`, an invalid verdict and missing evidence do not lead a strict run to successful completion. `CONDITIONAL` follows the explicit recipe policy. | DIR-03/07 |
| AT-02 | A plain bash `echo` is not a passed coding test; a nonzero exit code is not success. The test gate uses the observed journal. | DIR-07 |
| AT-03 | A budget stop before the mandatory verify leaves a clear partial/blocked outcome and a preserved budget; no fully-verified label. | DIR-08 |
| AT-04 | An activated persona/skill/spec override enters the next real prompt; rollback changes the next run; an existing run stays on the pinned version. | DIR-13 |
| AT-05 | The evolved schema is used in target execution, and the candidate prompt is executed before scoring. The test recognizes the prompt-as-output case. | DIR-13/15 |
| AT-06 | Two concurrent Workspace runs of the same harness have different run IDs; events, context and trace outcomes do not mix. | DIR-04/09 |
| AT-07 | Crash after a confirmed phase: restart continues with the next phase using the same references; the previous phase's spend is not lost. | DIR-04/05 |
| AT-08 | Crash after provider success, before local ack: the same action identity is reconciled; no blind duplicate sending. An unknown outcome remains visible. | DIR-06 |
| AT-09 | Two processes attempt to take over the same run; only one may start a new side effect under valid ownership. | DIR-06 |
| AT-10 | SSE reconnect and replay do not duplicate cards or actions. Detaching approved background work is not a cancel. Cancel prevents new actions. | DIR-05 |
| AT-11 | A missing connector blocks an already created run. A valid setup returns the same run; a callback for a different request or an expired grant does not start the work. | DIR-04/11 |
| AT-12 | Decline/expiry/revoke of an approval is preserved across restart; the model, a hook and an IM message cannot reverse it on their own. | DIR-11 |
| AT-13 | A document and a run summary from Workspace A do not appear in personal or Workspace B retrieval without explicit permission. The test contains sentinel data. | DIR-09 |
| AT-14 | A RAWDETAIL quote remains available in the allowed scope; temporary hook text is not automatically a long-term fact. Re-running the same extraction does not duplicate memory. | DIR-09 |
| AT-15 | A revoked/deleted source from checkpoint context is not used after resume. There is no "snapshot is stronger than erasure" exception. | DIR-09/21 |
| AT-16 | An optional external executor receives a real context package and returns the result to the same Workspace; no key leakage and no claim about unobserved internal tool actions. | DIR-10 |
| AT-17 | An existing skill is found and used without a manual trip to the catalog. A missing binary capability is not installed without the designated trust/approval flow. | DIR-11 |
| AT-18 | UI, agent and routine invoke the same selected business action through the same permission/validation contract; the agent does not get a shortcut around confirmation. | DIR-12 |
| AT-19 | An email/source with prompt injection does not change policy, does not exfiltrate the vault and does not authorize sending. The test also checks the path in which the scanner detects no keyword. | DIR-11/18 |
| AT-20 | Key present but generation does not work: onboarding is not "ready". A selected local model passes generation and the relevant tool round-trip; an interrupted pull is recoverable. | DIR-17 |
| AT-21 | A research/document fixture yields a file that opens, with the required sections and resolvable sources; a deliberately wrong number/citation is caught by the appropriate validator or remains explicitly unconfirmed. | DIR-02/07 |
| AT-22 | A new document changes the conclusion in the continuation of the same Workspace; the result states the new source version and does not lose previously confirmed decisions without reason. | DIR-02/09 |
| AT-23 | A routine after a sleep/restart/DST scenario follows the specified misfire policy, has no duplicate occurrence action and does not reset the budget. | DIR-19 |
| AT-24 | The attention classifier and dedup are evaluated on a labeled holdout; precision, false positives and merge errors are reported. The threshold is locked before final scoring. | DIR-18 |
| AT-25 | A paired IM user receives the allowed status and may confirm only the corresponding unexpired request. Replay/forward of someone else's confirmation does not produce a grant. | DIR-11/18 |
| AT-26 | KVARK connect activates only allowed organizational capabilities; an unavailable on-prem model does not trigger a cloud fallback. The personal mind is not copied automatically. | DIR-20 |
| AT-27 | Migration of the old config/run schema is repeatable; rollback does not duplicate actions and does not restore erased data or revoked permissions. | DIR-21 |
| AT-28 | The benchmark uses the production path; memory/gold from task X does not affect independent task Y. The manifest and offline recount match the saved outputs. | DIR-22/23 |
| AT-29 | Baseline and candidate are scored on the same examples; a candidate with a quality regression or an exceeded cap is not promoted; holdout access is logged. | DIR-14/15 |
| AT-30 | A clean supported Windows profile runs the shipped local product without developer Node/Python/Docker prerequisites; uninstall/repair, notices, signed artifact and fresh receipts match the candidate. | DIR-24/25 |

For a purely local/offline profile, add measurement of unapproved egress. For a BYOK/live-channel profile, the measurement confirms **allowed destinations and minimization**, not the impossible claim that network traffic is zero. KVARK tests have a separate on-prem model/evaluator boundary.

## 17. Resolution matrix C1–C22

Source of all C labels: **S1 §1, L26–L47**. The statuses below are direction for the revised plan, not confirmation that the code change has been made.

| Finding | Resolution | Planner obligation |
|---|---|---|
| C1 — Version identity | **ACCEPT** | Separate the document revision, the existing installer and the future production release. The new PRD/FRD are a v1.2 draft; do not automatically change the public application's version number. |
| C2 — Free vs Teams/Stripe | **RESOLVED BY PRODUCT; MIGRATION** | D-01/D-02 apply. Inventory gates and real users before migration; do not revive Waggle Team as an "open founder decision". Future convenience monetization is not abolished. |
| C3 — Cloud "and teams" | **ACCEPT** | Remove the separate Waggle cloud-teams scope. Teams are tied to KVARK, which remains on-prem. |
| C4 — Mobile/loopback | **CLARIFY** | Not a logical prohibition of mobile, but an unresolved network/auth scope. IM-first is a proposal, not the same as a finished PWA/native companion. |
| C5 — OSS vs proprietary/private | **ACCEPT VERIFICATION** | The free/OSS decision is given; the concrete rights, NOTICE and publication mechanics must be resolved against the current state. |
| C6 — Channel API/ToS | **VERIFY PER CHANNEL** | Official specific use-case and live/bot/import/roadmap profile. Do not repeat blanket legal claims and do not introduce unofficial inbox access by default. |
| C7 — Three "Harvest" concepts | **ACCEPT SEPARATION** | Memory import/Harvest remains a technical term where it exists; Home Attention; engineering Build-vs-Borrow. Renaming internal code is not automatically required. |
| C8 — Run after block/context | **ACCEPT** | Create the run before durable blocking and pinning of the context reference; §6.2 gives the corrected order. |
| C9 — Priorities vs waves | **ACCEPT** | One dependency plan for PRD and FRD; §15 is the new working basis, not two misaligned lists. |
| C10 — Dead learning/schema | **WIRE OR REPLACE** | Prove effective behavior. Do not keep a no-op; do not remove a user capability without a shown replacement or a scope decision. |
| C11 — RAWDETAIL | **CLARIFY** | Verbatim retrieval evidence is not the same category as a learned fact. Preserve the regression-verified path, scope, TTL and deletion. |
| C12 — Status mismatch | **ACCEPT** | Canonical/legacy map and API compatibility; PAUSED only with defined semantics. Do not equate an unknown action outcome with success. |
| C13 — Resolver order/rank | **CLARIFY** | Permissions first, task fit next; lane order is a preference/tie-breaker among valid candidates, not a blind priority list. |
| C14 — Inline vs old ADR | **NEW ADR** | Inline continuity, browser OAuth and durable blocking. Do not claim that OAuth completes in chat text; replace the conflicting ADR, stating the migration impact. |
| C15 — Routines/TOOLLESS | **CARVE-OUT** | The old loop remains toolless; an approved routine is a trigger for tool-enabled durable work under a different contract. No silent acquisition. |
| C16 — Persona/agent UI | **CLARIFY** | An optional understandable role may remain; technical persona configuration is hidden. No mandatory choice of an expert before the first job. |
| C17 — Coding family | **PRESERVE, QUALIFY** | Verify native and external paths separately. No large new coding program; do not reduce everything in advance to cloud executors. |
| C18 — Frontier claim | **ACCEPT WARNING; CORRECT MATCHES** | Hypothesis until evidence. A nonsignificant result is not by itself evidence of equivalence. Earlier illustrative tables are not measurements. |
| C19 — New target model | **RE-BASELINE** | The Qwen 3.8 27B target remains; confirm ID/runtime/quant and hardware ladder. The old MoE result is a separate control. |
| C20 — Worker parallel semantics | **EXPLICIT BOUNDARY** | Inventory the secondary worker. The local core has a single set of contracts; keep/isolate the legacy team worker or tie it to KVARK, without new Solo duplication. |
| C21 — Unmeasurable criteria | **ACCEPT** | Operationalize through §16 and locked thresholds; do not give arbitrary global quality percentages. |
| C22 — Release drift | **ACCEPT** | Establish the current SHA, ancestor/receipt relation and new qualification path. A historical receipt is not a current GO. |

## 18. Resolution matrix A1–A29

Source of the A labels: **S1 §2, L53–L126**. All changes relative to the original proposal are stated explicitly.

| Addition | Direction | Concrete consequence |
|---|---|---|
| A1 — Receipts per wave | **ACCEPT WITH BATCHING** | List of touched surfaces and the candidate freeze plan; the number and duration of freezes are not proven in advance. |
| A2 — Data migration | **ACCEPT** | Runs, cron execution state, overrides, trace qualification and config migration; subscribers only if they actually exist. |
| A3 — Erasure/export | **ACCEPT** | New stores and references enter the deletion/export rules; a technical test is not a blanket legal certification. |
| A4 — ExecutionMode | **ACCEPT/REFINE** | Separate conversation/work and normal/strict/benchmark. A mode does not expand permissions. |
| A5 — Server evidence | **ACCEPT** | Gates read the executor ledger; the actual verdict/status/exit-code/artifact. A model-supplied tool list is not authoritative. |
| A6 — Phase atomic unit | **ACCEPT** | Phase-level resume with prior outputs; a side-effect journal prevents blind repetition. |
| A7 — Idempotency key | **CORRECT THE DESIGN** | A stable actionId separate from attemptId; provider capability and unknown-outcome reconciliation; no universal exactly-once promise. |
| A8 — runs.db | **CANDIDATE + ADR** | Evaluate the SQLite solution first against the reuse/borrow criteria; retention/GC and schema versions are mandatory. |
| A9 — Detach/reattach | **ACCEPT** | Explicit background semantics, sinceSeq/replay and cancel separated from connection loss. |
| A10 — Persist budget | **ACCEPT** | Consumption persists across restart; token/compute/judge costs do not vanish in a new attempt. |
| A11 — WorkProgress events | **ACCEPT** | Per-run bus, seq, phase/attempt and evidence reference; no mixing of parallel workspaces. |
| A12 — Capability envelope | **MODIFY THE TIER PART** | Intersection of security, KVARK (where applicable), user and workspace constraints. Do not retain the individual TEAMS paywall as a permission rule. |
| A13 — Injection | **ACCEPT WITH LIMITATION** | Scan + taint + provenance + permission boundary. The scanner alone is neither a guarantee nor an approval for a side effect. |
| A14 — Threat model/install | **ACCEPT** | Binary/MCP threat model, secrets test and bounded installation. |
| A15 — Individual approvals | **ACCEPT** | Persisted block, expiry/deny/revoke; IM confirmation only with secure binding of identity and action. |
| A16 — Evolution privacy/cost | **ACCEPT/REFINE** | Local default, consent/cap for Waggle BYOK; KVARK has no cloud judge fallback. |
| A17 — Dataset governance | **ACCEPT/REFINE** | Frozen data/hash, provenance, qualified outcomes, correction ≠ gold. "≥30" is not universal sufficiency. |
| A18 — Promotion statistics | **ACCEPT/REFINE** | Paired baseline/candidate, metric-appropriate CI, practical margin, regression and resource limits; keep the test separate from repeated tuning. |
| A19 — Executor ≠ judge | **MODIFY THE ABSOLUTE CONDITION** | Actual execution is mandatory. A different model family is desirable, not a mandatory requirement for a single local machine; the independence limitation is reported. |
| A20 — Live readiness | **ACCEPT** | The selected model generates; the work profile has a relevant tool/protocol test. |
| A21 — Hardware ladder | **ACCEPT** | Model/quant/runtime/context/RAM/VRAM/disk and measured latency; interrupted pull recovery. |
| A22 — Failure UX | **ACCEPT** | An equally clear View work for partial, blocked, cancelled and failed; no fake progress percentage. |
| A23 — Copy lint/switch | **ACCEPT WITH EXCEPTIONS** | One understandable advanced access path; do not hide the name of the external executor or the data egress when it matters for consent. |
| A24 — A11y/i18n | **ACCEPT THE GOAL, FLAG THE DECISION** | Tests for new surfaces and centralized strings; an English-only release is a proposal for confirmation, not a historical user decision. |
| A25 — Benchmark statistics | **ACCEPT/REFINE** | Production path, manifest, contamination firewall, recount, appropriate statistical design. McNemar/TOST are not mandatory for every metric. |
| A26 — Context specifics | **ACCEPT/REFINE** | Token budget/provenance, hook precedence without an auth shortcut, scope leak fix. Memory regression under the same protocol, not an arbitrary "± noise". |
| A27 — KVARK connect | **ACCEPT** | Live capability/auth contract, storage/revoke and no-sharing default; not just a tier check. |
| A28 — SBOM/notices | **ACCEPT** | Pinned provenance of native binaries/models; CI/release checks the shipped package, with reasoned handling of findings. |
| A29 — Prices | **ACCEPT THE CHECK** | Verified official price/dates for every cost claim; separate cloud bills from local costs. |

## 19. Matrix of all proposed cuts from the audit

The labels **R01–R24** are introduced here for traceability; the original S1 §3 table does not have them. They follow the order of all 24 rows. "Defer" below means a proposed scope for the new plan, not permission to remove existing supported behavior.

| Row | Subject of the original cut | Resolution for replanning |
|---|---|---|
| R01 | WhatsApp/Viber/Discord inbox | Support only a qualified API/bot/forward/import scenario. Reduce the first scope; do not give a blanket legal conclusion without a current official source. |
| R02 | Native/PWA/mobile remote | A new application and remote infra are not G2. IM-first is a possible G3 minimum; name responsive web and full mobile capabilities separately. |
| R03 | Harness recipe evolution | Not complete removal. Separately evaluate a bounded registry of approved variants; full graph/topology evolution later. |
| R04 | "Evolved recipe" gate | The condition must match the delivered scope. Prompt/skill/schema promotion and a bounded recipe result have different evidence. |
| R05 | Meeting/routine families | Defer new specialized families. Routines as a trigger of the existing recipe path remain; a meeting document may use the existing document/research flow. |
| R06 | Coding hardening/benchmark | Not a big new coding program; preserve and qualify the existing native/external paths. A public coding comparison may come after the KW study. |
| R07 | Semantic citation entailment | A universal entailment engine later; do not defer targeted number/citation/provenance checks and an honest level of content review. |
| R08 | Waggle LongWork benchmark | Defer a new public dataset/product; internal crash/resume/change-input tests are mandatory. |
| R09 | Full six-arm N≈1500 study | No upfront-mandated N or six arms. Run a minimal rigorous study for the selected public claim; runner-only is not sufficient. |
| R10 | PAUSED/mid-phase/backoff | Mid-phase and true pause may come later. Phase-level retry/resume, safe side effects, a resource cap and a reasoned retry policy remain. |
| R11 | Inline MCP/remote installs | Resolve/propose inline; a Settings trust/install flow in the first scope is acceptable if the work is not lost. No silent binary install. |
| R12 | Waggle-owned OAuth client | Choose a verified/approved path or a clearly documented BYO-client pilot. API-key E2E is technical evidence, not a substitute for the mail/calendar value scenario. |
| R13 | Rank by user policy | A large new policy engine may come later; minimal user scope, grants and denial remain indispensable. |
| R14 | Personal→KVARK promotion | Initial no-sharing and an explicit connection/scope contract; broad organizational promotion on the KVARK side later. |
| R15 | Cloud sync/remote tasks | Outside the first individual local release scope; do not delete the strategic later option. KVARK remains on-prem. |
| R16 | Qwen tuning in onboarding | Separate benchmark tuning from the UX wizard; the qualified target and the hardware ladder must be connected before a public claim. |
| R17 | llama.cpp/LM Studio | OpenAI-compatible presets if tests confirm the required protocol; no new separate integration for the sake of a logo list. |
| R18 | AgentLearning/improvement wiring | The functional goal remains. Fix/wire it or replace it with another existing module; dead code is not a feature, but deletion is not "solved learning". |
| R19 | EvolveSchema default | Verify the actual output→execution→deploy flow. Preserve the useful effect, not a no-op; do not activate it in every chat just for the sake of naming. |
| R20 | Agent-Native preferred source | A named candidate for reuse/pattern; concrete rights and capability per file/commit. No mandatory dependency and no blanket rejection of ideas. |
| R21 | Omnigent reference only | No mandatory Python core dependency. Adapter reuse that is permitted on license and technical grounds remains an option after review. |
| R22 | Durable engines — build 600–1000 LOC | Do not accept the conclusion upfront. Build-vs-Borrow decides; a simple SQLite engine may win, but tests are the criterion, not LOC. |
| R23 | Merging the two MCP servers | May come later if it does not block the scope/auth/context contract. Do not refactor for the sake of aesthetic symmetry. |
| R24 | OSS record per PR | One short record per larger decision/wave, with an addendum for a materially new component. No bureaucracy for every small PR. |

## 20. What the planner delivers and what remains open

### 20.1. Requested package for the next planning pass

The paths are **proposed locations in the user's repo**, not a claim that this document has already created them.

| Proposed artifact | Mandatory content |
|---|---|
| `docs/Waggle_PRD_v1.2_DRAFT.md` + DOCX | The agreed product, clear statuses of existing/new, G1/G2/G3 scope, target user flows and an aligned KVARK boundary. |
| `docs/Waggle_FRD_v1.2_DRAFT.md` + DOCX | Contracts for run/context/action/proof/evolution/resolver, modes, state map, migrations, failure/privacy and tests. Not just descriptive wishes. |
| `docs/plans/WAGGLE-DELIVERY-PLAN-v1.2.md` | Wave/PR slicing, dependencies, owners/roles, exit criteria, risk/rollback, receipts and the G1/G2/G3 estimate. |
| `docs/plans/WAGGLE-AUDIT-DISPOSITION-v1.2.md` | C1–C22, A1–A29 and R01–R24: status, evidence, decision, owner, wave, acceptance and a link to the spec requirement. |
| `docs/plans/WAGGLE-BUILD-VS-BORROW-v1.2.md` | Actually reviewed source/commit/license, preserve/borrow/adapt/build decisions and the most important upstream/security costs. |
| `docs/plans/WAGGLE-BENCHMARK-PROTOCOL-DRAFT.md` | Primary test candidate, hypothesis, baseline/configurations, data split, contamination protection, metrics/statistics, budget and publication condition. |
| `docs/plans/WAGGLE-MIGRATIONS-v1.2.md` | All store/config/override/tiers changes and rollback with the erasure/revocation boundary. May be an FRD appendix if fully covered. |

It is not mandatory to produce seven unconnected large documents. A shorter appendix is acceptable when it retains clear ownership and links. But no topic may disappear behind "we will detail it later".

The PRD/FRD must receive stable requirement IDs. For every significant plan row, record: **D/DIR or C/A/R source → PRD requirement → FRD contract → wave → acceptance test → evidence of completion**. File names are not a substitute for that matrix.

### 20.2. Mandatory architecture decision records

Propose an ADR for: (1) conversation/work and modes, (2) durable store/phase resume/action idempotency, (3) detach/cancel and the earlier R3-008, (4) inline capability/OAuth and the earlier held-action/D3 contract, (5) RAWDETAIL/context/hook scope and precedence, (6) active override/promotion/rollback, (7) Routines vs TOOLLESS Loops, (8) individual tiers and the KVARK boundary, (9) secondary worker parity, (10) release/privacy profile boundaries.

An ADR does not serve to re-decide whether Waggle is free. It serves to implement that decision in the existing code. For each old decision, state what is being replaced, why, the risk and the migration test.

### 20.3. Genuinely open items

The planner should present them as a short decision queue with a recommendation and impact; it does not halt all other work because of a single item and does not re-ask for decisions already made.

| Open | What should be proposed/verified | What is not reopened |
|---|---|---|
| Public naming/GO | Preview/RC/final name and number after comparing the actual candidate state. | Free individual Waggle and the new product thesis. |
| License implementation | Ownership, final license/notices texts and publication mechanics. | The purpose of the free/OSS core. |
| Actual subscribers | Authorized inventory; migration only if obligations exist. | There is no future separate Waggle Team/Enterprise SKU. |
| Benchmark budget | GPU/API/evaluator and human review cap; scope of the first formal study. | The need for executed fair evidence, not just a runner. |
| Exact model/hardware configuration | Valid model ID/revision/quant/runtime and priority test devices. | The Qwen 3.8 27B-class target does not change silently. |
| First mail/calendar scenario | Ecosystem, scopes, OAuth path and user value. | The Home + attention direction. |
| Mobile minimum | A qualified IM scenario or a reasoned alternative network path. | A new cloud dependency is not tacitly permitted. |
| UI language | English-only first release or additional scope, with centralized strings. | Technical complexity does not return to onboarding. |
| Thresholds/modes | Task-level quality, latency, resource and classifier thresholds before the final test. | Unverified mandatory work must not be falsely marked as completed. |

### 20.4. Boundary between recommendation and approval

This document confirms that the plan should be elaborated in the stated direction. It does not approve every proposed numerical threshold, storage schema, cloud call or release date. The planner returns concrete contracts and risky remaining decisions for review, and does not claim that the user has already chosen every implementation alternative.

Do not end the plan with the generic question "do you want me to start". Finish with a completed package and a short list of actual blocking decisions. Coding and expensive/external actions wait for the next explicit approval.

## 21. Final checklist

- [ ] The user's explicit decisions are separated from old "LOCKED" records and new proposals.
- [ ] Every C1–C22, A1–A29 and each of the 24 actual cut rows has a resolution.
- [ ] Code findings have a named commit and evidence, or the status "unverified".
- [ ] "A module exists" is nowhere used as evidence of an E2E function.
- [ ] Free Waggle, KVARK on-prem and individual BYOK are not mixed up.
- [ ] The existing Home/Workspace/skills/retrieval/runtime are the starting point, not the subject of an automatic rewrite.
- [ ] A run is created before blocking and before pinning durable context.
- [ ] Action identity is stable across retry; an unknown outcome is not a blind resend.
- [ ] Approval, permission and revocation do not depend on the model's statement.
- [ ] Verify/gate/completion/content-quality levels are not a single inaccurate boolean.
- [ ] RAWDETAIL, derived facts and execution state are clearly separated.
- [ ] Personal/workspace/organizational scope also applies in the trace, checkpoint and evolution dataset.
- [ ] External executors are optional and qualified, and the result is bound to the same Workspace.
- [ ] Learning/evolution actually affects the next run, with an active pointer and rollback.
- [ ] Bounded recipe evolution has a separate realistic scope, not just a label.
- [ ] A correct baseline, production path and contamination protection exist in the benchmark plan.
- [ ] "Matches/beats/frontier-class" is conditioned on methodology and the actual result.
- [ ] A model that fits on disk is not automatically declared usable.
- [ ] Channels and mobile have concrete permitted scenarios, not just logos.
- [ ] Routines have an occurrence identity and a misfire policy, and do not expand TOOLLESS permissions.
- [ ] OSS adoption has a concrete license, provenance and maintenance plan.
- [ ] Migration/rollback does not restore deleted data or revoked permissions.
- [ ] G1, G2 and G3 have separate outcomes, costs and critical path.
- [ ] Estimates are updated for the corrected scope; the old total range is not presented as a new agreement.
- [ ] The plan and specifications are delivered; nothing has been silently implemented, charged or published.

## 22. Source register

References `[S1: C8]`, `[S1: A7]` and `[S1: W2]` point to the original labels in the documents. The L labels in this document correspond to the numbered text renderings provided with the attachments in the conversation; paths/symbols in the audit must be re-linked to a concrete code SHA before implementation.

**S1 — Detailed audit (main technical input).**

File: `procitaj-d-projects-waggle-os-docs-waggl-rustling-milner-agent-ac748482c5af17ddf.md`.

Title: *Waggle PRD/FRD v1.1 (2026-09-27): critique, feasibility and plan input*. Key ranges: spot-check L5–L18; C1–C22 L26–L47; A1–A29 L53–L126; cuts L130–L157; waves/estimates L161–L238; questions L242–L271.

SHA-256: `b7f03ff7eb35c7fb1c8e069cb32814a961755306e2217255c0e6229abcda8b08`.

**S2 — Historical Teams plan and reuse inventory.**

File: `cryptic-mixing-prism.md`.

Date in the document: 04.09.2026. Key ranges: skill licenses L38; internal inventory L41–L64; old thesis/billing/cloud L66–L77; proposed deliverables L79–L119. Used as a dated source, not as a current verification of the market or of licenses.

SHA-256: `1757e0dec3a7a3a40ace9d85ed554fd614cf12909a278a12fbee88d91aeb1a05`.

**S3 — Summary of S1.**

File: `procitaj-d-projects-waggle-os-docs-waggl-rustling-milner.md`.

Key ranges: method L11–L18; findings L20–L80; release plan/estimates L83–L131; proposed next steps and tests L133–L152. Not an independent audit. The earlier `Pasted markdown.md` is the same/related summarized material, not an additional source of confirmation.

SHA-256: `95c26d1b35c341aff7efe14a749ba6e33e22facdd58e55b048892811e50b85a2`.

**S4 — Baseline PRD.** File: `Waggle_PRD_v1.1_2026-09-27.docx`.

SHA-256: `69f8d0cc88fd2953c47118d30bc268f4774b882d88c4e1c0a608b2f9defba969`.

**S5 — Baseline FRD.** File: `Waggle_FRD_v1.1_2026-09-27.docx`.

SHA-256: `1b9fae5596983c2980750e8794dd731478306b440667c4b9403e001b672c8dd0`.

**D — User decisions, conversation of 27.09.2026.** Source for §3: free/OSS; desktop/local-first Waggle + BYOK; Workspace/chat/Home/routines; hidden agents; inline capabilities; Qwen 27B target; memory/evolution/durable; benchmark for real marketing; KVARK for team/enterprise and exclusively on-prem; no Fusion in this scope; OSS-first addendum.

**P — Resolutions and proposed contracts from the subsequent review.** Source for G1/G2/G3, stable action vs attempt, the three levels of verification, the bounded recipe evolution path, distinguishing equivalence from an unestablished difference, and the refinement of permissions/scope. These solutions are proposals for elaboration and evidence, not results of executed tests.

---

**Final instruction to the planner:** return a coherent plan for the same Waggle, not for the old Waggle Teams and not for a new framework. Preserve the existing parts that actually work, fix incorrect wiring and status claims, add the minimum necessary execution/context/evolution contract and measure the outcome early. Do not build everything from scratch; do not shorten the work by removing the reason the product exists.
