# Protocol & Claim Freeze (2026-07-11)

Pre-registration for the three planned races. Everything below is fixed **before**
any race result exists. Companion: `2026-07-11-fable-codex-consensus.md` (§0.5 smoke
tier, go/no-go). Calibration evidence: `KorroResearch/benchmarks/locomo-mem0-parity-2026-07/calib/`
(`panel_input.jsonl`, `panel_verdicts.jsonl`, `analyze_panel.py` — this smoke, Part 2).

**Global rules (all three races).**
- **One evaluation run per frozen config.** No reruns-until-win. If a run is voided
  it is voided for a *disclosed operational reason* (crash, auth failure), not because
  of its score, and the void is logged.
- **Retry policy.** Max **1** regeneration, triggered only on a *literally empty*
  answer string (finish_reason truncation or empty content). Applied symmetrically
  wherever we control the pipeline. **First-attempt result is the reported primary;**
  retry-normalized is a disclosed secondary. Competitor artifacts we do not control
  (mem0 released answers) get first-attempt-primary treatment with the asymmetry
  disclosed — a true symmetric rerun of a managed platform is infeasible.
- **Statistics.** Paired tests only, **cluster-aware at the conversation level**
  (questions are nested in conversations; question-level independence is false).
  Report a 95% CI whose lower bound must clear the go threshold. Conversation-cluster
  bootstrap (10k resamples) is the primary interval; McNemar is reported but its naive
  p-value is treated as anti-conservative and never the sole basis for a claim.
- **Multiplicity.** Three benchmarks × one primary metric each = 3 primary tests.
  Holm–Bonferroni across the 3 primaries; per-benchmark secondaries are descriptive,
  not claim-bearing.
- **Systems enter only with a frozen, hashed answer artifact.** A system with no
  reproducible per-question answer file does not enter the matrix.

---

## Race 1 — LoCoMo (4 systems × 2 judge protocols)

| Item | Freeze |
|---|---|
| Dataset | snap-research `locomo10.json` (Maharana et al., ACL 2024). Canonical build `locomo-1540` |
| Dataset hash | build `39e415e2f3a0fa1bd3cb1804a58d0b440b50d3070b2100698437e4ec402a5b24`; canonical instance_count 1531 |
| Evaluated set | **1540 rows** (mem0's own denominator: cat1=282, cat2=321, cat3=96, cat4=841). The 1531→1540 gap = 9 duplicate-question rows mem0 scores separately; we match their denominator for parity. Cat 5 adversarial (446) **excluded** |
| Answer artifacts | Ours = `locomo-7lane-w4-judgments-N1540.jsonl` (`answer_content`), hash `1252fbde90613ebb5622f6724def7e60a433f4d8bf754829c0a0592972f079fa`. mem0 = released per-question verdicts `mem0_perq_verdicts.json` (their answers held, joined on `conv_idx` + normalized question, gold tiebreak on 11 dup groups). Systems 3 & 4 enter only if a frozen answer file exists; else the matrix is 2×2 and reported as such |
| Answerer | Per-system, frozen in each answer artifact. **Not** re-answered for this race — judge-only |
| Protocol axis (the 2) | **P1 mem0-lenient:** `mem0-memory-benchmarks/benchmarks/locomo/prompts.py` `JUDGE_PROMPT` (partial-credit: ≥1 gold item ⇒ CORRECT), gold via `preprocess_answer` (cat-3 semicolon split). **P2 Memori-strict:** `memori-repo/benchmarks/02_run_benchmark.ipynb` cell 2 `ACCURACY_PROMPT` (verbatim), raw gold |
| Judge model | P1 = gpt-5 (arm c reference) and gpt-4.1-mini (production arm b), both frozen; P2 = gpt-4.1-mini. Judge model held constant within a protocol column |
| Primary metric | Judge accuracy (J-score), cats 1-4, on the 1540 |
| Statistic | Paired McNemar per system-pair **plus** conversation-cluster bootstrap 95% CI (10 conversations) |
| Claim shape | Ordering **stability across the two protocols**, not "we win under the lenient judge." A protocol-specific win is reported as protocol-specific |

The result this race is allowed to support: *ranking is (or is not) stable when the
judge protocol is swapped.* Cross-protocol number-vs-number comparison is licensed only
because S0 calibration cleared the substitution gate (below).

## Race 2 — LongMemEval (one harness: ours + Mastra + mem0)

| Item | Freeze |
|---|---|
| Dataset | `longmemeval_s_cleaned` (HF `xiaowu0162/longmemeval-cleaned`; Wu et al. 2024, arXiv:2410.10813) |
| Dataset hash | build `a8a99545d77a236e3c7aa1f5d0ccfd94d4bcc5c2d5adbd19f938aba844586c56`; jsonl `f21f62027a10e7e08fecdb3386c5ec83f409a5e92056a48be68bbb5473e7f262` |
| Evaluated set | **500 instances, including the 30 abstention (`_abs`) questions.** No-session instances excluded in canonical build. All three systems run on the identical 500 through **our** harness |
| Answerer | Frozen per system; production-legal config (no oracle routing). Oracle numbers, if shown, are ablation-only and never carry "exceeds incumbent" language |
| Judge | LongMemEval reference judge, single model+prompt frozen (source path recorded in run manifest), applied identically to all three systems |
| Retrieval depth/budget | Held identical across the three systems (same top-k, same token budget); disclosed |
| Primary metric | **Micro accuracy** over 500 |
| Statistic | Paired, cluster-aware (question-session) bootstrap 95% CI; Holm-corrected across the 3-benchmark family |
| Claim shape | Competitive aggregate + per-type breakdown. **No LME SOTA claim** — the 500 informed method development; one final run does not restore test-set independence |

## Race 3 — BEAM (AMB harness race)

| Item | Freeze |
|---|---|
| Dataset | `mohammadtavakoli78/BEAM` (Tavakoli et al. 2024, arXiv:2510.27246, ICLR 2026) |
| Dataset hash | `beam-1M`: `cc81ed8f7624261a2fa43a335eb46159b7665074b82ddfb4e2c0783fbf2caa46`, 700 questions across **35 conversations**, 1M chat size |
| Evaluated set | **700 questions, dedup-first.** Full ordinal outcome retained per question |
| Answerer | Ours + control lanes (BM25 / oracle) through the AMB harness; frozen config |
| Judge | Nugget-graded judge; rubric nuggets carried per question; judge model+prompt frozen in run manifest. Judge ported to grade 0 / 0.5 / 1 per nugget |
| Retry policy | Max-1-on-empty, first-attempt primary (global rule). BEAM's earlier 56-failure regeneration is **not** repeated |
| Primary metric | **Mean nugget score** (0/0.5/1) over 700 |
| Secondary | Pass rate; **full ordinal distribution** (rate of 0, 0.5, 1); cost/token per question |
| Statistic | **Conversation-cluster bootstrap** 95% CI over 35 clusters (question-level McNemar is invalid here — 700 nested in 35). Aggregate win requires cluster-aware CI lower bound > 0. The contradiction-subset result (+23pp) is the headline and is reported with its own cluster CI |
| Claim shape | Contradiction-handling gain is primary; aggregate is descriptive with full distribution + cost. No permissive-threshold aggregate claim |

---

## Go / No-Go (from consensus §0.5)

- **GO** = all load-bearing smokes green (S0, S2, S5, S6′ paired, S7) **and** S0 calibration clean.
- **S7:** green ≥ +3pp vs best comparable lenient result; red if tie/lose/<1pp.
- **S6′:** Mastra repro < 41/50 kills comparability; ours trailing ≥ 3/50 = red.
- **S4:** red if mem0-OSS leads ≥ 5pp under strict LoCoMo.
- **S2:** BEAM aggregate dies unless cluster-aware CI lower bound > 0.
- **FALLBACK** to the contradiction+audit paper if any load-bearing red, two grays, or
  judge calibration fails. **No averaging failures across benchmarks.**

## Claim freeze

Headline is **not** "SOTA on three leaderboards." It is: *conflict-preserving raw-turn
memory delivers a large, reproducible contradiction-handling gain under controlled
comparison, while a protocol-fidelity audit shows conversational-memory rankings are
underidentified (judges, routing metadata, retries, budgets).* Conditional upgrade only
if the LoCoMo matrix shows stable ordering under both protocols: "leads matched LoCoMo
and BEAM comparisons." Any comparison that cannot be expressed as a single frozen
protocol above is out of scope for this package.
