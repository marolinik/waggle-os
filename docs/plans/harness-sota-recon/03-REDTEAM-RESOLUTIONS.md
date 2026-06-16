# Red-Team Findings & Resolutions (continual-memory protocol + design spec)

**Date:** 2026-06-16 · **Status:** resolutions adopted into the design (v2). Authoritative deltas over `01-DESIGN-SPEC.md`
+ `02-CONTINUAL-MEMORY-PROTOCOL.md`.
**Source:** 3 adversarial reviewers (stats/methodology, leakage/validity, hostile-peer). Verdicts: stats
`needs-major-revision`, leakage `needs-major-revision`, hostile-peer `sound-with-fixes`. All praised the architecture;
the fixes below make it publishable. This doc IS the paper's "threats to validity" section in embryo.

Legend: **[ACCEPT]** change the design · **[PARTIAL]** adopt with scoping · **[NOTE]** acknowledge, no change needed.

---

## A. THE HEADLINE REFRAME (the biggest change)

**A1 [ACCEPT] — τ²-bench is saturated for an accuracy headline.** Our own prior-art (e3 P12): Qwen3.6 Plus 76.8% ≈
Opus 4.5 77.9% *raw* (~1pp); telecom ~99%. An accuracy-equivalence claim there = **equivalence-by-ceiling** (proves the
harness adds nothing). → **Resolution:**
- **Lead the memory + convergence story with EFFICIENCY (tokens/turns per task at equal-or-better accuracy) + pass^k
  RELIABILITY at high k** — both are leakage-immune AND saturation-immune. Accuracy-equivalence is **secondary**.
- Run the **accuracy-equivalence (TOST) claim ONLY on cells where raw Qwen vs Opus measurably DIVERGE** (the honest
  proving grounds: SWE-bench Verified ~15pp raw gap; GAIA2 splits where the prior arc measured −19.3pp). Closing a real
  gap is a result; matching on a saturated bench is not.
- **Pre-register a minimum-spread gate:** only run TOST on a cell where the raw A-vs-D (or C-vs-D) gap ≥ **2×δ**;
  exclude saturated cells; report per-cell **headroom (1−ceiling)** so reviewers see it isn't equivalence-by-ceiling.

**A2 [ACCEPT] — New headline shape (replaces `01-DESIGN-SPEC.md` §2 lead):**
> "On agentic task distributions where the raw open model and the raw frontier model **measurably diverge**, the Waggle
> harness + Hive memory **closes the gap** — delivering equal-or-better task success at **materially lower cost and
> higher reliability (pass^k)**, fully local + zero-egress + auditable. Where headroom exists, the small local model
> reaches **TOST-equivalence (±5pp)** with the frontier model inside the harness; everywhere, it does so **cheaper and
> more reliably.**"

Efficiency/reliability = primary & robust; accuracy-equivalence = secondary, on divergent+non-saturated cells only.

---

## B. STATISTICS & POWER

**B1 [ACCEPT] — H3 is under-powered as sized.** N≈250-400 was the CI-half-width-at-true-diff-0 figure, not a powered
TOST N, and ignored clustering. Powered TOST ≈ 800-1100 (true gap 0), 1160-1740 (gap 1pp), 2000-3100 (gap 2pp); ×DEFF.
→ **Resolution:** re-derive N from `N ≥ ((z₀.₉₅+z_power)·SD_diff/(δ−|expected true gap|))² × DEFF`, using (i) a
**pilot-measured discordance** rate, (ii) a **non-zero planning gap** (1-2pp, from the raw-gap prior), (iii) the
**cluster DEFF**. Where the divergent task pool can't reach the powered N (SWE-bench Verified=500, GAIA2=200/split),
**downgrade H3 on that cell from a binary equivalence verdict to a descriptive paired-difference CI with the ±δ band
drawn** (no "equivalent" verdict) — and say so. Pre-register the discordance + true-gap planning values.

**B2 [ACCEPT] — Define & pre-register the CLUSTER variable; Mode-1 is N=1 at the substrate level.** Phase-B tasks share
M1-M4 sub-structure (procedure-family / recurring-user / domain) and Mode-1 feeds ONE shared mind. → **Resolution:**
pre-register the cluster id (**procedure-family-id and/or recurring-user-id**, whichever dominates variance); report
**#items AND #clusters** per cell; inflate N by measured DEFF. **Build ≥3-5 independently-seeded shared minds** and add
**mind-id as a crossed random factor** so the substrate claim generalizes beyond one DB hash (a single frozen mind is
N=1 at the substrate level).

**B3 [ACCEPT] — Efficiency must be pinned, not floated as "strongest."** → **Resolution:** (i) pin the
turn/token/latency **budget as a pre-registered constant** + publish a **budget-sensitivity curve** (≥2 budgets) so the
result isn't a budget artifact; (ii) define tokens/$ as **TOTAL incl. recall + injection-scan + embedding** (the memory
tax counts against itself); (iii) pre-register efficiency as a **confirmatory endpoint with direction + min effect size
(e.g. ≥20% token reduction at non-inferior accuracy)** in the Holm family. tokens/turns = infra-independent
(comparable); **$/wall-clock = infra-dependent → descriptive only.**

**B4 [ACCEPT] — Enumerate the confirmatory family; it's ~10-20 tests, not 3.** H2 runs per (B−B⁻, A−A⁻) × mode ×
substrate × split; H3 runs per model-pair × δ. → **Resolution:** pre-register the **exact** confirmatory list (every
test that, if it fails, weakens the headline: per-substrate H2 + primary H3 at δ=±5pp for the protagonist pair + the
efficiency endpoint); **Holm across the full list**; demote secondary-δ and extra-frontier TOSTs to secondary. State
per-domain/per-substrate consistency as a **pre-specified robustness rule** ("lift positive in ≥k of m cells"), not
per-cell tests.

**B5 [ACCEPT] — pass^k trial-stochasticity.** At T=0 + fixed seed, pass^k ≈ pass^1 (the metric is inert) AND memory-ON
recall-pinning suppresses trial diversity (winning "reliability" by collapsing variance). → **Resolution:** run pass^k
at a **pre-registered T>0 / varied seed** so trials are genuinely diverse; **report inter-trial trajectory diversity for
BOTH arms** so a reviewer sees memory-ON isn't winning by variance collapse. If kept at T=0, drop pass^k.

**B6 [ACCEPT] — Phase-A/B split is a difficulty confound + researcher-DOF risk.** → **Resolution:** partition by a
**mechanical rule** (random or difficulty-stratified over native task families), **freeze at a SHA before any run**;
report the **difficulty distribution (raw-model pass-rate) of A vs B** to prove they match; add a **"Phase-B-random"
arm** (tasks drawn at random, not reuse-selected) and show the lift survives there too.

**B7 [ACCEPT] — Learning-dynamics seeds & mind-ordering.** 5 seeds is too few at the curve tail, and a single Phase-A
ordering bakes one mind. → **Resolution:** ≥20 seeds OR a **mixed-effects trend with seed as random effect** (report
slope CI, not eyeballed curves); stratify-by-difficulty; build the headline mind from a **difficulty-balanced,
order-randomized** Phase-A and average headline results over **≥3 Phase-A orderings** (or scope "conditional on the
pre-registered stream" + show stability under ≥1 alternate ordering).

---

## C. LEAKAGE / INTERNAL VALIDITY (the firewall holes)

**C1 [ACCEPT — critical] — Skills bypass the firewall.** Skill bodies are LLM-authored markdown; only secret/path
redaction runs — **no gold/answer-content audit.** A Phase-A skill can encode a Phase-B-determining procedure, AND in
Mode-1 it smuggles builder-model reasoning into the "shared" mind. → **Resolution:** extend the firewall to **ALL
written artifacts** (skill bodies, write-back frames, correction details, identity/awareness), not just ingest frames:
(a) exact+normalized **gold-substring assertion** over every artifact; (b) **embedding-similarity gate** — max cosine
between any banked artifact and any Phase-B gold below a pre-registered threshold, per row; (c) Mode-1 shared mind built
with a **NEUTRAL fixed builder** (a non-subject model or deterministic non-LLM extraction), pinned + reported — OR strip
M1 skills from the Mode-1 mind and prove the lift survives on M2/M3/M4; (d) **blind manual audit of ≥30 recalled
skills** (contains a generalized method, not a Phase-B answer).

**C2 [ACCEPT — critical] — Re-derivability is asserted, not enforced; the accuracy lift lives on non-re-derivable
tasks.** § "memory only saves re-derivation" vs "converts fail→pass where re-derivation exceeds budget" = the accuracy
lift is exactly the smuggled-answer boundary unless proven. → **Resolution:** add a **per-Phase-B-task re-derivability
gate**: run the memory-OFF arm (or an oracle probe) with the budget **raised 3-5×**; **only tasks where unbounded-OFF
reaches the gold may enter the accuracy headline**; tasks where even unbounded-OFF fails are flagged "memory supplied
unobtainable knowledge" and **excluded** (report the count — a high count is itself a finding). **Lead with efficiency
(leakage-immune); accuracy fail→pass is supporting, on the re-derivable subset only.**

**C3 [ACCEPT] — Mode-1 builder neutrality.** "Byte-identical mind ⇒ model is the only variable" holds ONLY if a
model-neutral builder wrote it; the LoCoMo 73.x precedent built context INLINE (no LLM-distilled skills) so it can't
vouch for a skill-bearing mind. → **Resolution:** pin + report the builder identity; **builder-sensitivity check** —
build the Mode-1 mind once with Opus-authored and once with Qwen-authored skills, show H-results hold under BOTH; or
restrict the Mode-1 mind to **structured facts/retrieved snippets only (no `create_skill` prose)**. If equivalence
depends on builder family, the convergence is not substrate-driven — and we say so.

**C4 [ACCEPT] — User-sim turns are goal-conditioned (M4 paraphrase leakage).** The τ² user-sim is seeded with the task
intent; its turns can paraphrase the target (substring audit misses paraphrase). → **Resolution:** filter user-sim
turns before banking — **only personalization signals (preferences, prior choices) bank for M4, never goal statements**;
assert embedding-similarity of banked user turns vs Phase-B golds below threshold; audit a sample of recalled M4 frames.

**C5 [ACCEPT] — Near-dup must GATE the headline set, not just be a diagnostic.** Excluding obvious near-dups doesn't
prove the headline set is near-dup-free. → **Resolution:** for **every** headline Phase-B task, compute max
embedding-similarity(gold, top-K retrieved Phase-A artifacts); **pre-register a cutoff and EXCLUDE** any task exceeding
it; report excluded count + lift with/without exclusion. Keep the near-dup *positive control* (memory CAN cache) but
**report it prominently** with a pre-registered expected effect (a weak positive control is a red flag, not a footnote).

**C6 [ACCEPT] — Mechanism-spread is attribution, NOT a leakage defense.** Distributed leakage (a piece in a skill + a
fact + a user turn) survives the spread test. → **Resolution:** reframe §7.4 as **attribution only**; remove any
implication that mechanism-spread evidences non-leakage. Leakage defense = substring + embedding gates + re-derivability
+ negative control.

**C7 [ACCEPT] — Goal/structure-overlap audit is author-defined & circular.** → **Resolution:** pre-register the overlap
metric + thresholds BEFORE building B; freeze the A/B split at a SHA; **disjoint reviewer or hypothesis-blind LLM
classifies each B task** as goal- vs structure-overlap from task text alone (report inter-rater κ); add a
**negative-control family** (LOW structure-overlap, design PREDICTS no lift) — **if lift appears there, the split is
leaking and the result is void.**

**C8 [ACCEPT] — Firewall assertions don't exist in code yet.** A pre-reg listing unimplemented invariants is a
promissory note (tunable after pilot). → **Resolution:** **implement + unit-test every firewall assertion** (frame +
skill + write-back + identity substring AND embedding gates, scope-binding, frozen-mind hash) **BEFORE Phase-0
pre-registration; freeze at a SHA; emit each assertion's pass/fail into `events.jsonl` per row** so the audit proves
they ran on the priced run.

---

## D. CONSTRUCT / EXTERNAL VALIDITY (the "benchmark built to win" attack)

**D1 [ACCEPT — critical] — The headline must not run ONLY on a team-built synthetic stream.** HAL (our own rigor anchor)
warns against self-constructed agent comparisons. → **Resolution:** **demote the continual-memory protocol to the
MECHANISM demonstration (H1/H2: does the harness/memory help, and how).** Put the **headline model-comparison (H3
convergence + efficiency/reliability) on the UNMODIFIED, externally-authored native task distribution** (native
τ²/GAIA2/SWE, run as-is, no Phase-A/B re-cut) wherever the claim is about *models*. The continual protocol carries the
*memory-mechanism* claim; the native distribution carries the *model-convergence* claim. Add a **falsifiable
pre-registered prediction the design can FAIL** (e.g. "if convergence holds on the frozen-mind cell but the gap REOPENS
on the native distribution, the convergence is protocol-induced and we report that"). A design that cannot lose is not a
benchmark.

**D2 [ACCEPT] — Mode-2 is co-primary; report the residual honestly (the Ensue move).** Headlining Mode-1 (which hides
the model's advantage) and footnoting Mode-2 (where the better model writes better memory) is cherry-pick-shaped. →
**Resolution:** Mode-2 (self-built mind) is **co-primary for the product claim** with its own pre-registered margin.
Pre-commit: **if Mode-2 shows a gap while Mode-1 shows equivalence, the published conclusion is "the substrate equalizes
the model GIVEN identical memory, but the better model still builds better memory"** — the residual IS the headline.
Mode-1 = controlled mechanism isolation, explicitly NOT the product claim.

**D3 [ACCEPT] — Convergence is near-tautological under Mode-1; add a divergence-stress cell.** Feeding both models the
same recalled answer → mechanical convergence. → **Resolution:** add a pre-registered **"divergence-stress" cell** —
Phase-B tasks where recalled memory is **PARTIAL/AMBIGUOUS** (the model must decide what to reuse vs re-derive).
Convergence THERE is real; per task, label "answer mechanically present in recall" vs "required novel composition" and
**lead the convergence claim on the novel-composition subset.** Stop citing the LoCoMo/QA 73.x convergence as support
for the agentic headline (different construct; LoCoMo audited-broken).

**D4 [ACCEPT] — External-validity language bounded.** Drop "your agent gets better at YOUR workflows." → **Resolution:**
claim only "**within repeated-domain agentic streams with reusable sub-structure**"; show the lift on **≥2 domains with
different structure-overlap profiles** and report the lift's sensitivity to the structure-overlap ratio (quantifies how
engineered the win is).

**D5 [ACCEPT] — Arm-A harness neutrality (the Anthropic rebuttal).** Arm A (Opus-in-Waggle) being the "fair" baseline
assumes the harness is model-neutral; a harness/prompt-assembler tuned on Qwen would underserve Opus → inflate
convergence (flips "equalizes" → "handicaps Opus"). (Mitigating fact: PromptAssembler is tier-adaptive — frontier tier
gets no scaffold, r1 §Layer-7 — but this must be *verified*, not assumed.) → **Resolution:** pre-register that the
harness/assembler/tool-pool were **NOT tuned per-model**; run a **harness-neutrality check** — show arm A (Opus-in-Waggle)
≥ arm E (Opus-native) on ≥some cells, else **concede the harness costs Opus and report arm E as co-primary** for the
Opus ceiling. **Sweep reasoning/thinking effort and publish the curve** (HAL: more effort often *hurts*).

**D6 [ACCEPT] — Derivative-bench comparability (the Sierra rebuttal).** A re-cut of τ² is a derivative benchmark not
comparable to Sierra's leaderboard. → **Resolution:** **ruler-validate** that our native-distribution run reproduces
published τ²/SWE numbers within tolerance before claiming any delta; clarify the **τ²-bench license** before
redistribution; keep the continual re-cut clearly labeled as our protocol, distinct from native numbers.

---

## E. REPRODUCIBILITY & MINOR

**E1 [ACCEPT] — Pin the Qwen checkpoint.** Floating DashScope alias = irreproducible (and `-via-openrouter` silently
serves 3.5). → **Resolution:** **headline subject = local-vLLM with a pinned weight hash**; DashScope secondary.
**E2 [ACCEPT] — Pin reranker ONNX + embedder weights** (recall-affecting; documented OSS/main drift point) + hash them
per row alongside the mind hash. **E3 [ACCEPT] — Disclose the `graphDistances` dead lane** (contextual scoring = const
0, 20% of 'balanced') in the substrate description so a reviewer doesn't "discover" it. **E4 [ACCEPT] — Always bind
"equivalent within ±5pp (TOST, 90% CI)" inline** — never bare "statistically equivalent." **E5 [ACCEPT] — δ on a
saturation-robust scale** (risk-difference/log-odds) and drop saturated cells from the equivalence family. **E6
[ACCEPT] — Pin active write paths** in Phase A (only the named M1-M4 mechanisms; disable uncontrolled heuristic
pattern-write-back, or attribute it). **E7 [ACCEPT] — Cost denominator** includes ingestion + any best-of-N; report the
**measured** cost ratio, never a vague "~1/N." **E8 [ACCEPT] — GAIA2 memory-wiring integration test** (memory-OFF on the
new wiring reproduces the no-memory baseline within tolerance) before trusting any GAIA2 memory cell. **E9 [ACCEPT] —
Mind-population minimums** per mechanism (gate Phase A on achieving ≥X skills/facts/corrections/users) so M3/M4
attribution isn't underpowered by construction. **E10 [ACCEPT] — Human-anchor sizing** for equivalence: a 50-100-item
human-κ check cannot certify a ±3pp margin (its CI is wider than the margin) — size the dual-coded human sample to the
margin or state the achievable margin honestly.

---

## F. WHAT THE RED-TEAM CONFIRMED IS STRONG (do not weaken)
- The **fairness spine** (Opus in the full stack = arm A; publish the residual A−B) — the best credibility asset.
- **Efficiency + pass^k as the memory story** — leakage- AND saturation-immune; now elevated to PRIMARY (A1/B3).
- **Two-mode design** (shared frozen mind isolates the model; self-built carries product realism) — kept, with Mode-2
  co-primary (D2) and builder-neutrality closed (C3).
- **TOST with a pre-registered decision-relevance margin** — the correct inferential choice (sizing fixed in B1).
- **Frozen read-only mind in Phase B + per-task freeze for retrials** — pass^k is well-defined (B5 adds T>0).
- **Refusal to headline "small beats frontier raw" or LoCoMo**, pre-registration discipline, confirmatory/exploratory
  split, "null is publishable" — methodological maturity above the genre median.

---

## G. NET EFFECT ON THE DESIGN
The bones survive; the headline gets **stronger and more honest**:
1. **Primary = efficiency + reliability (pass^k) Pareto** (robust to saturation + leakage), on both native distributions
   and the continual protocol.
2. **Accuracy-equivalence (TOST) = secondary**, only on **divergent, non-saturated** cells with **powered N or an
   honest descriptive-CI downgrade**, only on the **re-derivable subset**, with a **divergence-stress** sub-cell.
3. **Model-convergence headline runs on the native unmodified distribution**; the **continual protocol proves the
   memory mechanism** (H1/H2) with an enforced (not asserted) firewall + mechanical/blind-audited split + negative
   control.
4. **Mode-2 co-primary**; residual reported honestly (Ensue move).
5. **Arm-A neutrality verified** (or arm-E co-primary).
These become edits to `01-DESIGN-SPEC.md` (§2 claim, §6 metrics, §7 stats, §9 firewall, §13 risks) and
`02-CONTINUAL-MEMORY-PROTOCOL.md` (§3.2 modes, §5 firewall, §6 caching defense, §7 metrics, §9 stats) — applied next.
