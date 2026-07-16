# Fable × Codex consensus on the SOTA path (2026-07-11)

## 0. Second opinion: gpt-5.6-sol (high reasoning) — CONCURS, stricter on 3 points

Independent verdict before seeing prior reviewer, then adjudicated: agrees on all central conclusions (C1 → cross-judge protocol-sensitivity study; C2 SOTA chase dead — "frozen one final run is ceremony, not test discipline"; C3 contradiction result is the contribution; headline = protocol shopping, "an existentially quantified loophole"). Stricter additions:
1. **C1 2×2 insufficient** unless answerer, retrieval units, token budget, preprocessing, retry behavior are also controlled or explicitly factored. Report judge-flip transition counts + human-audit a stratified disagreement sample.
2. **BEAM McNemar likely INVALID**: 700 questions nested in 35 conversations — question-level McNemar assumes independent pairs, anti-conservative. Recompute with conversation-cluster bootstrap / cluster randomization; p=0.0389 may not survive. More fundamental than the partial-credit issue.
3. **LME oracle score gets no "exceeds incumbent" language anywhere** outside an ablation; disclosure does not repair task leakage.
Approved headline (both models): contradiction-handling gain + protocol-sensitivity audit. Performance-forward variant: "competitive aggregate performance and a robust contradiction advantage in controlled evaluations."

Codex (gpt-5-era, medium reasoning) consulted via /codex with full plan context (§7 Phase 0, §8 forensics, live C1/C2 results). Full verbatim output preserved below (§4). Prompt archived: `2026-07-11-codex-consult-prompt.txt`.

## 0.5 SMOKE TIER (agreed 2026-07-11, gpt-5.6-sol converged; <$15, 1–2 days, run BEFORE funding the package)

| # | Smoke | Kill criterion | Load-bearing? |
|---|---|---|---|
| S0 | Protocol/claim freeze doc + judge-calibration panel (30 frozen answers, official vs proposed judge, need ≥90% agreement, κ≥0.80, bias ≤2/30) | Any comparison inexpressible as one frozen protocol; calibration failure forbids cross-judge comparisons | YES |
| S1 | mem0-474 forensics ($0): their repo says GPT-5 answerer+judge for LME → 474 likely off-protocol; verify artifact-level | If 474 comparable → LME bar rises to 474 | bar-setting |
| S2 | Cluster bootstrap on existing BEAM data ($0, local, 10k paired conv bootstraps) | BEAM aggregate win dies unless cluster-aware 95% CI lower bound > 0 | YES |
| S7 | C1 stage 2 (sunk, in flight) | Green ≥+3pp vs best comparable lenient result; red if tie/lose/<1pp | YES |
| S4 | mem0-OSS under strict LoCoMo, 1 conv ~150 Q (~$3), sequential 2nd conv if ±5pp | Red if mem0 leads ≥5pp | YES |
| S6′ | Paired LME 50 (stratified, frozen): Mastra exact config + ours, same 50 (~$2) | Mastra repro <41/50 kills comparability; ours trailing ≥3/50 = red | YES (paired part) |
| S5 | AMB harness spike, ours + BM25/oracle control, 40 Q (~$5, needs Gemini key) | Kill AMB plank unless ≥38/40 complete, no manual repair, ≤$0.15/Q | YES |

Settled en route: LongMemEval-V2 EXISTS (451 Q, agent-trajectory task, own harness) — excluded from scope. GO = all load-bearing green + S0 clean. FALLBACK to contradiction+audit paper if any load-bearing red, two grays, or judge calibration fails. No averaging failures across benchmarks.

## 1. Verdicts and agreement

| Track | Codex | Fable | Consensus |
|---|---|---|---|
| C1 LoCoMo parity rerun | AGREE with restrictions | agree | PROCEED, reframed as protocol-sensitivity experiment: report a 2×2 matrix (both systems × strict Memori judge and mem0 judge). The claim is ordering stability across protocols, not "we won under the lenient judge." We hold mem0's per-question answers → their cells cost only judge calls. |
| C2 LME lever push to beat Mastra | DISAGREE (adaptive tuning; "one final run" doesn't restore independence) | agree — flagged same risk before consult | PARK the lever push. Ship 92.20 production-legal + oracle-inflation quantification (93.60→92.20→88.20 ladder) as a methodology contribution. No LME SOTA claim without a genuinely unseen eval. |
| C3 BEAM substrate work for avg-score lead | DISAGREE as framed (retry asymmetry, threshold sensitivity, would be tuned on judged 700) | agree | REFRAME: contradiction result (+23pp, heal-independent, p<1e-4) is the headline contribution. Aggregate reported as full ordinal distribution + first-attempt primary / retry-normalized secondary under a pre-declared policy. Substrate improvements (abstention gate etc.) only with dev/eval separation. |
| Headline "SOTA under every protocol where like-for-like exists" | NOT defensible (movable denominator = protocol shopping) | accept | New headline: **conflict-preserving raw-turn memory delivers a large, reproducible contradiction-handling gain under controlled comparison, and a protocol-fidelity audit shows conversational-memory rankings are underidentified (judges, routing metadata, retries, budgets).** Conditional upgrade if C1 matrix shows stable ordering: "leads matched LoCoMo and BEAM comparisons." |

Fable's two disagreements with Codex (minor):
1. Codex: "competitor had no equivalent regeneration opportunity" on BEAM. mem0's released file has 0 empties — their managed pipeline either never failed or retried internally and invisibly. True symmetric rerun of their platform is impossible; the feasible fix is the pre-declared policy + first-attempt-primary reporting Codex also proposes.
2. Codex treats C1 as unfinished evidence; it is in flight, and stage-1 judge decomposition already delivered half the protocol-sensitivity matrix.

## 2. New actions proposed (need user approval)

| # | Action | Cost | Yield |
|---|---|---|---|
| A | Cross-judge matrix on frozen answers: ours + mem0's LoCoMo answers under BOTH judges (completes C1 2×2); ours + mem0's BEAM answers under a second judge (gpt-4o) + judge-agreement stats (kappa) | ~$20–40 | Turns "protocol islands" into a first-class result; Codex proposals #3, #10 |
| B | BEAM reporting overhaul: pre-declared retry policy, first-attempt primary + healed secondary, full ordinal distribution (0/0.5/1 rates), cost/token disclosure | ~$0 (reporting) | Kills attacks #5, #6, #7 |
| C | Resume E2 causal ablation (store×prompt 2×2 on contradiction subset; was mid-flight: retrieval+reconciled store built, cells A/B partial) | ~$10 remaining | Codex proposal #4 — isolates conflict-preservation causally; upgrades the headline mechanism claim |
| D | Pre-registration doc: freeze metrics, comparisons, retry/exclusion rules, stat tests, stopping rules before any further runs | ~$0 (writing) | Codex proposal #5; discipline for everything after |
| E | Pareto cost–quality frontiers from existing artifacts | ~$0–5 | Codex proposal #6; converts token-budget liability into a result |
| F | External/unseen LME eval set (new generated conversations, independent adjudication) | days + $$ | Only path to any future LME SOTA claim; DEFER unless user wants it |

C1 stage 2 continues unchanged (already covers the ours×mem0-judge cells; A adds the mem0-answers×strict-judge cells).

## 3. Codex's ranked attack list (top 5 retained for the re-audit gate)
1. Test-set adaptation presented as evaluation. 2. SOTA defined after seeing favorable comparisons. 3. Attribution unsupported (answerer/judge/budget/substrate all vary). 4. Oracle-label contamination. 5. BEAM retry asymmetry.

## 4. Codex verbatim output

(preserved in full for the record)

You do not have a defensible "SOTA on all three benchmarks" path. You have: one likely protocol-specific LoCoMo win; one LongMemEval result below the incumbent under production-legal conditions; one narrow BEAM win on a permissive threshold, plus a much stronger contradiction-specific result. That can make a credible paper. Calling it universal SOTA would weaken it.

[C1 AGREE with restrictions — necessary; supports "best result in a controlled comparison under the released mem0 protocol"; does not establish dual-protocol SOTA; report paired outcomes + McNemar CI, strict judging of both systems' parity answers, factorial table (answerer/judge/top-k), category-level results, dedup sensitivity, cost parity; don't celebrate a lenient-judge win — call it "released mem0 evaluation protocol" and audit leniencies separately.]

[C2 DISAGREE — the process is not test-set discipline; classifier, abstention, method selection, miss analysis all informed by the same 500; "ONE final run" doesn't make it independent. 461/500 production-legal is below Mastra 468/500. Oracle result invalid for production-comparable claims; 0.14 macro is noise; "exceeds under oracle routing" is spin. Reframe as robustness/methodology.]

[C3 DISAGREE as framed — aggregate lead fragile: appears only after regenerating 56 failures, competitor had no equivalent opportunity, reverses under strict scoring, 3–4× context budget, significance tied to partial-credit threshold. Contradiction result is the real contribution: large, significant, mechanistically aligned, heal-independent. Center C3 on it. Substrate changes risk benchmark overfitting unless developed outside the 700 judged questions.]

[Attacks ranked: 1 test-set adaptation; 2 movable SOTA denominator / protocol shopping; 3 attribution unsupported; 4 oracle contamination; 5 retry asymmetry; 6 metric selection after outcome inspection; 7 cost-normalized inferiority; 8 permissive-judge optimization; 9 no uncertainty on tiny deltas; 10 benchmark saturation; 11 contradiction subset possibly post-hoc; 12 artifact asymmetry.]

[Do differently: stop targeting SOTA-on-all-three; three falsifiable claims instead. Genuinely untouched eval split for LME (external hold-out / pre-registration / nested CV by conversation; do NOT fabricate pseudo-held-out splits now). Separate comparison from causal attribution via factorial ablation — key question: does conflict preservation cause the contradiction gain. Normalize BEAM inference policy (pre-declare attempts/failure definitions/budgets), report first-attempt + retry-normalized + full ordinal distribution + cost. Bridge BEAM protocol islands with a cross-protocol judge matrix over the same frozen answer artifacts + judge-agreement stats (kappa, favoritism analysis, blinded human sample). Treat C1 as protocol-sensitivity: the result you want is ordering stability across protocols. Pre-register hypotheses and correction rules. Add cost-constrained Pareto frontiers.]

[Headline: "SOTA under every protocol where a like-for-like comparison exists" NOT defensible — LME production-legal is below incumbent, BEAM depends on retry+threshold, LoCoMo unfinished, denominator selective. Strongest defensible now: "Conflict-preserving raw-turn memory substantially improves contradiction handling, while a protocol-fidelity audit shows that benchmark rankings are highly sensitive to judges, routing metadata, retries, and inference budgets." If C1 succeeds under both judges matched: "Conflict-preserving raw-turn memory leads matched LoCoMo and BEAM comparisons, with a 23-point contradiction gain, while exposing substantial protocol-induced inflation in conversational-memory benchmarks."]

[Ranked proposals: 1 unseen external eval set; 2 BEAM symmetric retry rerun; 3 cross-protocol judge matrix on frozen artifacts; 4 causal ablations isolating conflict preservation; 5 pre-registration; 6 Pareto frontiers; 7 correct oracle-routed LME prominently; 8 contradiction/update as primary mechanistic result; 9 all BEAM ordinal outcomes; 10 protocol instability as central evaluation contribution. "The credible paper is not 'we won three leaderboards.' It is 'leaderboard claims in conversational memory are underidentified, and conflict preservation produces one large, reproducible capability gain under controlled comparison.'"]
