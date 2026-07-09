# BEAM 1M — temporal_reasoning gap forensics (ours 0.557 vs mem0 0.618)

**FREE analysis** — no API calls. Pure re-read of existing result JSON + BEAM source.
Scripts: `scratchpad/analyze*.py`. Sources:

- OURS: `beam-1m-FULL700-gpt5-retv2.jsonl`, dedup by FIRST occurrence of `instance_id`,
  `memory_ability=temporal_reasoning` → **70 rows**, mean score **0.5571**.
- THEIRS: `mem0-memory-benchmarks/results/platform/beam_1m_results.json`,
  `question_type=temporal_reasoning` top_200 → **70 rows**, mean score **0.6179**.
- Matched by exact question text: **70/70** to theirs, **70/70** to BEAM source. 100% clean.
- Both answerer AND judge are **gpt-5** on both sides (our retv2 cell + their run). Same judge family.

Gap = **0.0607 / question = 4.25 points over 70** (theirs − ours).

---

## 0. Reference-date field: DOES NOT EXIST (critical negative finding)

BEAM temporal entries carry exactly these fields (union over all 70):

```
question, answer, difficulty, temporal_type, time_points,
conversation_references, calculation_required, source_chat_ids, rubric
```

- **No** `question_date` / `reference_date` / `time_anchor` / `as_of` / `now` field.
- `time_points` = the two EVENT dates (embedded in the gold answer, not the question).
- `conversation_references` = session numbers only.
- **Zero of 70 questions** use "as of / today / now / currently / how long ago / to date / so far"
  phrasing (regex scan, 0 hits).

**Implication:** the LongMemEval "dropped question_date → +33pp on temporal" lever is **not
applicable here**. Every BEAM-1M temporal question is an **event-to-event span** with BOTH
anchors living inside the dialogue. There is no relative-to-now category to fix. This kills
fix-hypothesis (c) up front.

---

## 1. Score distribution (70 matched pairs)

| | mean | 1.0 | 0.75 | 0.5 | 0.25 | 0.0 |
|---|--:|--:|--:|--:|--:|--:|
| OURS   | 0.557 | 31 | 4 | 8 | 4 | 23 |
| THEIRS | 0.618 | 39 | 1 | 7 | 0 | 23 |

- **we-win 8, they-win 15, tie 47.** They-win contributes **+9.50**, we-win claws back **−5.25**,
  net **+4.25** for mem0.
- **Both sides have exactly 23 zeros; 16 are the SAME questions** (shared irreducible floor).
- The gap lives in the **partial-credit band**: mem0 converts partials into clean 1.0 (39 vs 31),
  and **mem0 has ZERO 0.25s and only one 0.75**. Its answers are bimodal — nail it or miss it.
  Ours smears across 0.25/0.5/0.75 (16 partials vs mem0's 8). That smear IS the gap.

### Nugget-level contingency (135 matched nuggets, pass = score ≥ 0.5)
both-pass 69 · ours-only-pass 14 · **theirs-only-pass 17** · both-fail 35. Net −3 nuggets at threshold.

### Date-range nugget is the tell
Every temporal question has 2 rubric nuggets: a **count** ("state: N days") and a
**date-range** ("state: from D1 till D2").

| date-range nugget | mean | 1.0 | 0.5 | 0.0 |
|---|--:|--:|--:|--:|
| OURS   | 0.582 | 32 | **7** | 22 |
| THEIRS | 0.689 | **42** | **0** | 19 |

**mem0 never receives a 0.5 on a date-range nugget** — it either states the range cleanly (1.0)
or misses it (0.0). Our 7 × 0.5 are cases where we mention both dates but phrase them as a
counting window ("April 4–13", "16 full days if excluding both dates") or bury them in a hedge,
and the judge downgrades to partial. This is a **presentation tax**, not a knowledge gap.

---

## 2. Taxonomy — this benchmark is ~94% duration arithmetic

BEAM's own `temporal_type` (ours vs theirs mean):

| temporal_type | n | ours | theirs | gap |
|---|--:|--:|--:|--:|
| duration_calculation | 52 | 0.567 | 0.659 | **+0.091** |
| inferential_duration_calculation | 14 | 0.536 | 0.571 | +0.036 |
| basic_sequence | 1 | 1.000 | 1.000 | 0 |
| simple_sequence | 1 | 0.000 | 0.000 | 0 |
| basic_sequence_understanding | 1 | 0.000 | 0.000 | 0 |
| duration_comparison | 1 | 1.000 | 0.000 | −1.000 |

My text-classifier collapses to the same story: **64/70 duration-span, 0 relative-to-now,
0 absolute-date-recall, 0 frequency.** The (a)/(c)/(d) categories the brief worried about
**do not occur**. 100% of the gap is inside **duration/span calculation** — "how many
days/weeks/hours between event X and event Y".

- By difficulty: easy (n=56) gap +0.067, medium (n=14) gap +0.036. Gap is not concentrated
  in hard questions — it's in ordinary two-date subtraction.

---

## 3. Failure-mode distribution of the 15 they-win losses (= the 9.5 gross gap)

Every they-win case read manually (full answer + judge reason + mem0 answer). One primary
mode each; point loss = theirs − ours.

| mode | cases | points | % of 9.5 |
|---|--:|--:|--:|
| **MISSING-DATE (over-abstention)** — we said "insufficient information", mem0 committed & was right | 5 | **4.00** | 42% |
| **WRONG-DATE (wrong anchor retrieved)** — we cited a different date than gold | 3 | **3.00** | 32% |
| **FORMAT / JUDGE-NOISE** — correct content, docked on date-range phrasing or a garbled nugget | 4 | 1.25 | 13% |
| **WRONG-SPAN (interpretation)** — had both anchors, wrong unit/count | 1 | 0.75 | 8% |
| **HEDGING (buried answer)** — correct value present but under a conflicting primary answer | 2 | 0.50 | 5% |

**74% of the loss = over-abstention + wrong-anchor.** Both are single-date-selection problems.

### Behavioral asymmetry (the root cause in one line)
- **Abstention:** ours 10/70, theirs 10/70 — but on **5** of ours mem0 committed to the
  right date and won (+4.0). On the 4 both-abstain cases neither can (true retrieval floor).
- **Hedging:** **ours 16 hedge/"if-you-meant"/conflict answers; theirs 0.** mem0 emits a single
  terse declarative sentence *every time*. On our 16 hedges we actually average 0.641 vs their
  0.500 (hedging helps when info genuinely conflicts) — but in the 3 clean-answer duration cases
  it costs us 0.25 each, and the judge's literal nugget-matching rewards mem0's commit-always style.

mem0's edge is **stylistic + dispositional**, not retrieval depth: commit to one date pair, state
it as "N days — from Month D, YYYY to Month D, YYYY", never hedge.

---

## 4. Worked examples

**EX1 — MISSING-DATE (conv 27, ours 0 / theirs 1.0).**
Q: "How many days after I started my regular Tue/Thu soccer practices did I reserve Riverside Park…"
Gold: March 20 → September 5 = 169.
OURS: *"I don't have enough information… On March 15 you said you'd start practicing Tue/Thu, but no
exact first practice date was recorded. If you tell me the exact date…"*
THEIRS: *"169 days. You started your Tue/Thu practices on March 20, 2024, and reserved… September 5,
2024 — 169 days later."*
→ We HAD the Sept 5 anchor and a March-adjacent start signal but refused to commit; mem0 asserted
March 20 and won both nuggets.

**EX2 — MISSING-DATE (conv 26, ours 0 / theirs 1.0).**
Q: "How many days between launching 'Mindful Steps' and selling 320 copies?" Gold Oct 20 → Nov 10 = 21.
OURS: *"I don't have enough information to answer this question."* THEIRS: clean 21 days, Oct 20–Nov 10.

**EX3 — WRONG-DATE, both anchors (conv 9, ours 0 / theirs 1.0).**
Gold Feb 1 → Apr 25 = 84. OURS: *"83 days… planned on 2024-01-26 (mem 9,11)… started on 2024-04-18
(mem 23)."* THEIRS: Feb 1 → Apr 25 = 84. We selected the wrong two memories entirely; the arithmetic
(83 over Jan26→Apr18) was internally consistent but both anchors were wrong.

**EX4 — WRONG-DATE, end anchor (conv 14, ours 0 / theirs 1.0).**
Gold Mar 15 2023 → Aug 1 2023 = 139. OURS: *"301 days… met Amy Mar 15 2023… started thinking about
Suzanne on January 10, 2024."* We grabbed a mention 5 months past the true event. mem0: exactly 139.

**EX5 — HEDGING buries the correct answer (conv 21, ours 0.75 / theirs 1.0).**
Q: "days between when I scheduled the home inspection and when the roof repair completed?" Gold Mar 28
→ Apr 3 = 6. OURS: *"19 days. You scheduled the inspection on March 15 (for March 28)… If you meant
from the inspection date itself (Mar 28 to Apr 3), that's 6 days."* → led with the **mention date**
(Mar 15) not the **event date** (Mar 28); the correct "6 days" is present but demoted, so the count
nugget scored 0.5. THEIRS: *"6 days — from the home inspection scheduled for March 28 to… April 3."*

**EX6 — FORMAT tax, correct content downgraded (conv 5, ours 0.75 / theirs 1.0).**
OURS: *"10 days. Sprint 2 ended April 3, 2024. Sprint 3's mid-sprint review April 13, 2024. That's a
10-day gap (**April 4–13**)."* Judge: date-range nugget 0.5 — *"gives the range as April 4–13"* instead
of "from April 3 till April 13." THEIRS: identical facts, phrased "from April 3 to April 13" → 1.0.
Pure phrasing; content identical.

**EX7 — JUDGE-NOISE, identical content scored oppositely (conv 33, ours 0.5 / theirs 1.0).**
Nugget text (garbled in gold): "from 6 PM till 2 PM". OURS: *"4 hours — from 2 PM to 6 PM"* → judge
scored this nugget **0** ("does not state 'from 6 PM till 2 PM'"). THEIRS: *"2 PM–6 PM"* → judge scored
the SAME nugget **1.0** ("semantically matches… despite different wording"). Same content, opposite
score. This is irreducible gpt-5-judge variance, and it happens to break our way ~never.

**EX8 — We WIN by committing where mem0 abstains (conv 12, ours 1.0 / theirs 0).**
Q: "days between finishing resume optimization and starting at MedPsych Clinic?" Gold Mar 10 → May 1 =
52. OURS: committed 52 days. THEIRS: *"I don't have enough information."* → The exact inverse of EX1/2;
proves the benchmark rewards commitment and that our retrieval CAN surface the anchors — we just
under-commit inconsistently.

**Bonus — irreducible floor (16 both-zero).** Several require an inferred anchor the source itself
hedges (conv 7 gold: *"inferred from the initial planning session batch anchor"*), or a gold that is
a trick (conv 10: study-start AFTER the exam), or genuine retrieval misses both sides share (conv 7/9/
11 both abstain). These ~16 are not cheaply recoverable by either system.

---

## 5. Ranked fix candidates (impact out of 70 × score; net gap to close = 4.25)

Impacts are stated as **gross recoverable** (they-win points the fix targets) and **realistic net**
(after discounting genuinely-absent anchors and offsets to our we-win credit).

**FIX 1 — Anti-abstention commit policy for duration questions.** [HIGHEST ROI, prompt/policy-level]
When a question is a two-event span and at least one anchor is present, **do not emit "insufficient
information" — commit to the single best-supported date pair.** mem0 wins 5 of our abstentions by
doing exactly this (EX1, EX2). Gross **+4.0** (5 cases). Realistic **+2.5 to +3.5** (conv 30/31 may
lack a genuinely-absent second anchor / time-of-day). Cheap, and our own EX8 proves committing works.
Guardrail: keep abstaining on the 4 both-abstain cases where NEITHER anchor exists.

**FIX 2 — Single clean, unhedged answer + canonical restatement.** [EASY, prompt-only]
Force the output shape mem0 uses: `"<N> days — from <Month D, YYYY> to <Month D, YYYY>."` Kill
"if you meant…", "X full days if excluding both dates", and counting-window phrasings ("April 4–13").
Targets the 7 × 0.5 date-range partials + the buried-answer hedges. Gross **+1.75** (FORMAT 1.25 +
HEDGING 0.5). Realistic **+1.0 to +1.5**. Apply ONLY when a single unambiguous date pair exists —
keep genuine contradiction-surfacing (it earns us net-positive partial credit on the we-win set).

**FIX 3 — Event-date vs mention-date disambiguation (wrong-anchor).** [HARD, retrieval/extraction]
Root cause of WRONG-DATE (EX3/EX4) and the EX5 hedge: we anchor to when a date was *mentioned*
("scheduled ON Mar 15") instead of the *event* it refers to ("scheduled FOR Mar 28"), and we
mis-select among duplicate mentions. Resolve each temporal anchor to its referent event date and
dedupe. Gross **+3.0** (conv 9/14/23) + de-hedges EX5. Realistic **+1.5 to +2.5**. Most durable —
also lifts event_ordering / multi_session_reasoning, which share date-selection.

**FIX 4 — Day-count convention alignment.** [EASY, small]
conv 34 both produce 137 vs gold 136 (inclusive/exclusive off-by-one); conv 9 gives 83 vs 84. Adopt
the gold convention (calendar-day difference, endpoint-inclusive where the gold is). Realistic
**+0.25 to +0.5**. Low priority — most day-count misses are downstream of wrong dates (Fix 3), not
arithmetic.

### Bottom line
FIX 1 + FIX 2 are both prompt/policy-level, low-risk, and together target ~5.75 gross / **~3.5–5.0
net** — enough to **erase the 4.25 gap and likely pass mem0** without touching retrieval. FIX 3 is
the durable lever to pull clearly ahead and generalizes to the other lossy abilities. ~13% of the
loss (FORMAT/JUDGE-NOISE, EX7) is gpt-5-self-judge variance that only disappears by mimicking mem0's
terse declarative style — which FIX 2 does. No retrieval-widening is indicated: the anchors are
present (EX8, and the headroom forensics), the problem is date-selection and answer disposition.
