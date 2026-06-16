# Continual-Memory Protocol — how Hive memory bites on agentic tasks

**Date:** 2026-06-16 · **Status:** DESIGN v2 (component of `01-DESIGN-SPEC.md` §4.3) · red-teamed — see
[`03-REDTEAM-RESOLUTIONS.md`](./03-REDTEAM-RESOLUTIONS.md) for authoritative deltas (efficiency/reliability is now the
PRIMARY memory metric; Mode-2 is co-primary; firewall extended to skill bodies + embedding gate + per-task
re-derivability gate; native-distribution headline + mechanical/blind-audited split + negative control; divergence-stress cell)
**Purpose:** Define the experimental environment that lets **Hive memory measurably lift an agentic harness** —
isolating a *legitimate transfer* effect (not answer-caching, not leakage), to a publishable standard.

---

## 1. The problem this solves

Agentic benchmarks (τ²-bench, GAIA2, AppWorld) are **stateless per task** — each task is independent, so cross-session
memory has nothing to recall. The harness's memory layers (recall, write-back, skill distillation, correction
learning) are **long-horizon**: they help *future related* tasks, not the current one. So a vanilla per-task run shows
memory as pure cost (recon r1 + r2 both reached this). To make memory bite, tasks must form an **accumulating stream**.

This creates the central dilemma — the **similarity knife-edge**:
- Tasks too **similar** → memory = caching the answer → trivial / cheating → reviewer rejects.
- Tasks too **dissimilar** → nothing transfers → no lift → claim fails.
- **The sweet spot:** tasks that share **reusable sub-structure** (procedures, domain facts, policies, entity/user
  knowledge) but have **distinct goals and distinct gold answers.** Memory carries the *reusable* part; the agent must
  still solve the *novel* part. This is the difference between **transfer/generalization** (legitimate) and
  **memorization/leakage** (cheating) — and getting it provably right is the whole game.

---

## 2. The four transfer mechanisms (what memory legitimately carries)

The protocol is built so each of these is exercised and separately attributable. None of them is a leaked gold answer.

| # | Mechanism | What accumulates | Harness layer | Example (τ² retail) |
|---|---|---|---|---|
| **M1** | **Procedural** (skills) | a reusable multi-step procedure with parameters | D1 skill distillation (`create_skill`) | distill `process_return(order)` on early tasks → reuse on later returns (different orders) |
| **M2** | **Domain knowledge** (facts/policy) | durable, re-derivable domain facts the agent discovered | write-back / cognify / KG | learns the change-fee policy via tool calls → recalls it instead of re-deriving |
| **M3** | **Correction** (mistakes) | the agent's own errors + the fix, classified durable | correction-detector / improvement signals | mis-applies a policy, gets a failure signal, records it → avoids the mistake on a similar later task |
| **M4** | **Personalization** (who) | a recurring user's preferences/context across sessions | identity + recall over the user's frames | same simulated user across sessions → recalls their plan/preferences |

**Critical property — re-derivability (the leakage firewall's backbone):** M2/M4 carry knowledge the agent **could
re-obtain from the environment** by querying tools (the policy is in the system; the user can be re-asked). Memory only
**saves the re-derivation.** Therefore the memory-OFF arm can *still* solve the task (by re-deriving), just less
efficiently — so memory's contribution shows up first as **efficiency** (fewer tool-calls/tokens/turns) and
**reliability** (pass^k), and converts fail→pass (accuracy) only where re-derivation exceeds the turn/latency budget.
This is the most defensible memory claim: *memory makes the agent more efficient and reliable at things it could
eventually do anyway, and unlocks the long ones.* Nothing memory carries is an answer the agent couldn't earn.

---

## 3. Protocol structure — two phases, two mind-construction modes

### 3.1 Phases
- **Phase A — Experience stream.** The agent solves an ordered stream of `N_exp` domain tasks. With memory ON, the
  harness accumulates M1–M4 into the mind as a side effect of *solving* (its own observations, its own distilled
  skills, environment failure signals, the simulated user's turns). **Gold answers and oracle metadata never enter the
  mind** (§5).
- **Phase B — Held-out test.** A disjoint set of `N_test` tasks in the same domain, whose **goals are not in Phase A**
  but whose **solutions reuse M1–M4** established in Phase A. The mind is **frozen read-only** during Phase B. All arms
  are evaluated on the **identical** Phase-B set (paired).

### 3.2 Two mind-construction modes (report both — they answer different questions)
- **Mode 1 — SHARED FROZEN MIND (primary, for H3 convergence).** One canonical mind is built once from Phase A
  (deterministically / by a fixed neutral builder), frozen, and read **identically** by every H3 arm (Qwen+mem,
  Opus+mem, GPT+mem, …). The memory substrate is *byte-identical* across models ⇒ **the model is the only variable** ⇒
  the cleanest possible "substrate ≫ subject" isolation. This maps exactly to the prior memory result (Qwen 73.4 ≈
  Opus 73.1 on identical substrate) and **defeats "the better model wrote better memories"** by construction.
- **Mode 2 — SELF-BUILT MIND (supporting, for H2 + product realism).** Each agent runs Phase A itself and accumulates
  its **own** mind, then is tested on Phase B with that mind frozen. This is the realistic product scenario ("your
  agent learns your workflows over time") and is the home of the **learning-dynamics** result (§7.3). It conflates
  memory-write quality with model quality — so it is *supporting*, never the headline equivalence number.

> **H3 headline runs in Mode 1. H2 (does memory help) runs in both. Mode 1's frozen mind is the apples-to-apples spine.**

### 3.3 Arm × mind-state map (on the identical Phase-B test set)
| Arm | Model | Harness | Mind state (Phase B) | Proves |
|---|---|---|---|---|
| D | Qwen | raw | none | model floor |
| (ladder) | Qwen | Waggle | empty | H1 (harness>raw) |
| B⁻ | Qwen | Waggle | **empty** | H2 control (memory-off) |
| **B** | **Qwen** | **Waggle** | **frozen shared (Mode 1)** | **H2 treatment + H3 protagonist** |
| A⁻ | Opus | Waggle | empty | H2 control (Opus) |
| **A** | **Opus** | **Waggle** | **frozen shared (Mode 1)** | **H2 (Opus) + H3 ceiling** |
| C / E | Opus | raw / native | none | model ceiling / commercial baseline |

H2 lift = (B − B⁻) and (A − A⁻), paired on Phase B. H3 convergence = TOST(A vs B) on Phase B, both with the **same
frozen shared mind**.

---

## 4. Task-stream construction (per substrate)

General recipe: choose a domain; build Phase A to seed M1–M4; build Phase B so its solutions *reuse* M1–M4 but its
goals/golds are novel. Quantify and report the **goal-overlap (low) vs structure-overlap (high)** between A and B (§6).

### 4.1 τ²-bench (primary)
- **Domain = one of {retail, airline, telecom}** (recurring procedures + policy KB + a simulated user).
- **Phase A:** `N_exp` tasks drawn so that core procedures (returns, exchanges, rebooking, plan-changes) and policy
  facts recur, and a subset of **recurring user identities** appear (M4). The agent distills procedure skills (M1),
  banks policy facts (M2), and hits correctable failures (M3).
- **Phase B:** held-out tasks whose goals differ (different orders/itineraries/customers) but whose solutions reuse the
  same procedures + policies + (for M4 tasks) the recurring users' preferences.
- **User-sim pinned** identical across all arms (a τ² confound).

### 4.2 GAIA2 / ARE (secondary robustness + Phase-2 arena)
- **Split = Adaptability and/or Search** (Adaptability rewards re-planning, which recalled prior plans help).
- **Phase A:** a stream of scenarios sharing app-API procedures + stable world facts. **Wire Hive memory into the ARE
  worker** (currently unwired) so write-back/recall happen around `runAgentLoop`.
- **Phase B:** held-out scenarios reusing those procedures/facts.

### 4.3 Sizing (ties to the stats in `01-DESIGN-SPEC.md` §7)
- `N_test ≥ 250–400` paired (the TOST/H3 binding constraint; ±5pp primary).
- `N_exp ≈ 150–300` (enough to populate M1–M4 meaningfully; report mind size: #skills, #facts, #corrections, #users).
- Substrate budget check: τ² ~540 tasks/3 domains, AppWorld 750, GAIA2 800/split — enough for A+B per domain; **pool
  domains or add AppWorld** if a single domain is too small for `N_exp + N_test`. Flag in Phase 0.

---

## 5. Leakage firewall (protocol-specific; assert as ex-ante invariants)

Every one of these is a programmatic assertion + a spot-audit, pre-registered, code-frozen at a SHA.
1. **Mind built from agent-earned content only:** the agent's own tool observations, its own distilled skills,
   environment failure signals, and the simulated user's conversational turns. **NEVER** the benchmark's gold answer,
   oracle events, DB-target state, or task `category`/`evidence` metadata.
2. **Assert no gold substring** from any Phase-B task appears in any frame in the mind (exact + normalized match).
3. **Phase A ⟂ Phase B at the goal level:** no Phase-B task's goal/gold is reachable by copying a Phase-A solution
   (verified by the goal-overlap audit §6). Phase-B golds are disjoint from Phase-A golds.
4. **Frozen mind in Phase B:** read-only; no write-back during evaluation; identical bytes across Mode-1 arms (hash the
   mind DB and record it per row).
5. **Scope-bound recall, agent-non-overridable** (per the existing `gopId`-style binding); spot-audit 0 cross-task
   gold contamination.
6. **Injection-scan recalled memory** before it reaches the model (production `scanForInjection`).
7. **Local embedder, T=0, fixed seed**; per-row record the mind hash + builder provenance.

---

## 6. The answer-caching / over-similarity defense (the reviewer's sharpest attack)

A skeptic will say "your lift is just memory regurgitating near-duplicate answers." Pre-built defenses:
1. **Quantify A↔B overlap on two axes and publish it:** **goal/answer overlap** (must be LOW — distinct golds; report
   max n-gram / embedding similarity between Phase-B golds and any Phase-A artifact) vs **structure overlap**
   (procedures/policies/entities reused — HIGH; that's the legitimate transfer). The claim lives in *low-goal-overlap,
   high-structure-overlap* tasks.
2. **Near-duplicate control set (diagnostic, excluded from headline):** a small set of Phase-B tasks that ARE near-dups
   of Phase-A tasks. Memory-ON should ace them — this is the **"memory is actually working"** sanity check. They are
   **reported separately and excluded** from the H2/H3 headline (they WOULD be answer-caching).
3. **Re-derivability proof:** show the memory-OFF arm can still solve the **same** Phase-B tasks (by re-deriving from
   tools) at a measurable efficiency cost — proving memory carried re-derivable knowledge, not unobtainable answers.
4. **Mechanism-attribution ablation (§7.4):** show the lift survives with M1/M2/M3 alone — if it were answer-caching,
   it would collapse to a single trivial lane; spread across mechanisms = genuine transfer.

---

## 7. Metrics

### 7.1 Accuracy (Phase B, paired)
pass^1 and **pass^k** (k pre-registered), memory-ON vs memory-OFF (H2) and Qwen-vs-Opus both memory-ON (H3, TOST).

### 7.2 Efficiency (the strongest, hardest-to-dismiss memory story)
**tokens/task, turns/task, tool-calls/task, $/task, wall-clock** on Phase B — memory-ON vs OFF. The headline efficiency
claim: *memory makes the agent materially cheaper and faster at equal-or-better accuracy* (the Pareto move).

### 7.3 Learning dynamics (supporting, Mode 2)
During Phase A, plot pass^k and cost/task vs **stream position**, memory-ON vs memory-OFF (OFF = each task with a fresh
empty mind). Control the position↔difficulty confound: **randomize stream order across ≥5 seeds, average the curves,
stratify by task difficulty.** Deliverable = "the agent gets better and cheaper with experience" curve.

### 7.4 Mechanism attribution (pre-empts "which component?")
Ablate the memory write/read lanes: **M1-only (skills), M2-only (facts), M3-only (corrections), M4-only (user)**, and
all-on. Reports which mechanism drives the lift per task family. (Also nets the "graphDistances dead-lane" caveat from
recon r5.)

---

## 8. pass^k semantics under memory (define precisely to avoid a confound)
- **Phase B (frozen mind):** the k trials per task are independent — the mind is read-only and identical for every
  trial. pass^k is well-defined and clean. ✅ This is why the headline uses the frozen-mind design.
- **Phase A (Mode 2, growing mind):** memory updates **only between distinct tasks**, never between retrials of the
  same task; all k retrials of a task read the mind state **frozen at that task's start.** This keeps pass^k
  well-defined while the mind still grows across the stream.

---

## 9. Statistics (consistent with `01-DESIGN-SPEC.md` §7)
- **H2 (memory lift):** paired (Phase-B tasks identical across arms), cluster-bootstrap CI, one-sided / McNemar on
  paired pass/fail; effect size in pp + efficiency deltas with CIs.
- **H3 (convergence):** **TOST** on paired (A − B) over Phase B, 90% CI ⊆ [−δ, +δ], δ=±5pp primary / ±3pp secondary,
  pre-registered; **with the shared frozen mind (Mode 1).**
- **Multiplicity:** the M1–M4 attribution + the per-domain cells are exploratory (BH/FDR); H2 and H3 are confirmatory
  (Holm). Pre-register the split.

---

## 10. Validity threats specific to continual memory → mitigations
| Threat | Mitigation |
|---|---|
| Answer-caching via over-similar tasks | §6 goal-vs-structure overlap audit; low-goal-overlap headline; near-dup control excluded |
| Gold/oracle leakage into the mind | §5 firewall (assert no gold substring; agent-earned content only; frozen+hashed) |
| "Better model writes better memories" confounds H3 | Mode-1 **shared frozen mind** — byte-identical across models |
| Position↔difficulty confound (dynamics) | randomize order ×≥5 seeds, average, stratify by difficulty |
| pass^k ill-defined with a growing mind | freeze mind per-task for retrials (§8) |
| Memory helps only trivially (one lane) | mechanism-attribution ablation (§7.4) must show spread |
| Substrate too small for A+B | pool domains / add AppWorld (§4.3); flag in Phase 0 |
| Memory **hurts** (irrelevant recall as noise/cost) | report it honestly; it's a real finding and a tuning signal — pre-register that a null/negative is publishable |

---

## 11. Implementation notes (feeds the Phase-0 plan)
- **Mind build/freeze:** populate via the production `packages/hive-mind-core` write path during Phase A; export +
  hash the SQLite mind DB; load read-only for Phase B. For Mode 1, build once with a fixed builder and reuse the same
  DB file (record its hash per row).
- **Harness wiring:** Phase B arms call the real `runAgentLoop` + `Orchestrator.recallMemory` (the production path);
  memory-OFF = same loop, recall disabled / empty mind. Pin the model (disable model-pilot), fixed decoding params.
- **Reuse:** `benchmarks/harness/` runner/JSONL/seed/budget/lock/health/streak + `judge-runner` + `stats/*` +
  `preregistration`. New: the Phase-A→B stream builder, the overlap-audit tool, the mind-freeze/hash utility, the
  efficiency-metric capture (already available via `runAgentLoop` `onToolUse`/usage callbacks).
- **Substrate source-of-truth:** main `packages/hive-mind-core`.

---

## 12. One-paragraph summary (for the spec)
The agent first works a **stream of domain tasks** (Phase A) during which the harness banks four kinds of *re-derivable*
knowledge — procedures, domain facts, its own corrections, and recurring-user context — **never gold answers**. It is
then tested on a **held-out set whose goals are novel but whose solutions reuse that knowledge** (Phase B), with the
mind **frozen**. The headline convergence run gives **every model the byte-identical frozen mind** (so the model is the
only variable). Memory's contribution is measured as **accuracy (pass^k), efficiency (tokens/turns/$), and
learning-dynamics**, defended against answer-caching by an explicit **goal-overlap-low / structure-overlap-high** audit
plus a re-derivability proof and a mechanism-attribution ablation.
