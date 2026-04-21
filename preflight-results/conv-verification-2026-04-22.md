# Task 2.2 Conv Verification — 2026-04-22

**Brief:** `PM-Waggle-OS/sessions/2026-04-22-cc-brief-task-2-2-ratified.md` Tasks A+B
**Source dataset:** `benchmarks/data/locomo10.json`
**Outcome:** all 5 drafts adaptable via trivial conv-reference swap (question structure preserved).

---

## 0. Upstream dataset reality check

PM drafts header describes the LoCoMo source as "50 conversations, ~70 QA each." The local file `benchmarks/data/locomo10.json` (and the sampled `preflight-locomo-50.json` which samples 50 _instances_ from those conversations) carry only **10 conversations** — sample_ids `{conv-26, conv-30, conv-41, conv-42, conv-43, conv-44, conv-47, conv-48, conv-49, conv-50}`. The upstream snap-research/locomo repository is known to publish a 10-conversation release; the "50 QA entries" from `preflight-locomo-50.json` came from _sampling within_ those same 10 conversations.

Conversations referenced in PM drafts but absent from the local set: **conv-1, conv-2, conv-15**. Conv-30 (Draft #5) IS present locally.

Per brief §A auto-swap policy — "auto-swap allowed if trivial, escalation only if swap changes question structure" — each of the 5 drafts was adapted by swapping the conv reference while keeping the **question shape** (temporal-scope single-anchor, temporal-scope two-anchor arithmetic, null-result F1-vs-F4, null-result F1-vs-F4, chain-of-anchor 5+ items). No question-shape change. No escalation required.

Available unused convs (not in existing 10-instance calibration set): `{conv-30, conv-43, conv-44, conv-48}`.

---

## 1. Draft #1 — temporal-scope single-anchor → **conv-44**

**Replaces:** draft reference to `conv-1` / Melanie pottery signup.

**Final question:** *When did Audrey adopt Pixie?*

**Ground-truth answer:** `around April 2, 2023`

**Evidence:** `D2:1` (single anchor).

**Source QA (canonical LoCoMo label):** conv-44 qa entry, category=2 (temporal), answer="around April 2, 2023", evidence=["D2:1"].

**Why this fits:** Single-anchor date recall identical in shape to the PM draft. F3 triggers on "April 2023" / "early April" (vague-but-derived); F4 triggers on fabricated specific wrong date (e.g. "March 28, 2023"). Discrimination identical.

**Verification:** inspected turn D2:1 directly via scan script; canonical LoCoMo evidence label is authoritative.

---

## 2. Draft #2 — temporal-scope two-anchor arithmetic → **conv-44**

**Replaces:** draft reference to `conv-1` / Caroline Sweden move.

**Final question:** *How many years passed between Audrey adopting Pixie and her other three dogs?*

**Ground-truth answer:** `three years`

**Evidence:** `D2:1, D1:7` (two anchors).

**Source QA:** conv-44 qa entry, category=2 (temporal), evidence=["D2:1", "D1:7"].

**Why this fits:** Requires arithmetic across two anchors — Pixie adoption timing vs. prior three-dog adoption timing. Shape mirrors PM Draft #2's "Sweden 4 years ago" arithmetic question. F3 triggers on miscomputed interval (two, four years); F4 triggers on fabricated interval untethered to evidence. Replicates the conv-42_q038 "week before 14 Sept" class of question on a fresh conv.

**Verification:** canonical LoCoMo two-anchor temporal QA with explicit ground truth.

---

## 3. Draft #3 — null-result F1-vs-F4 → **conv-43**

**Replaces:** draft reference to `conv-2` / Nate musical instrument.

**Final question:** *What musical instrument does John play?*

**Ground-truth answer:** `null` (not mentioned / evidence of absence)

**Evidence:** `[]` (empty by construction)

**Verification — John's instrument absence in conv-43:**

- Tim (the other speaker) IS a musician — plays piano (D8:14) and is learning violin (D21:11). This is explicit.
- John's music-related turns are **two**, both are John asking Tim about Tim's playing:
  - `D21:10 John`: "Learning an instrument is really cool. What instrument are you playing?"
  - `D21:12 John`: "Wow! I hope I can hear you play the violin some day. How long have you been playing the piano again?"
- John's 336 turns contain zero assertion that John himself plays any instrument.
- LoCoMo qa entries about John + music:
  - "What instrument is John learning to play in December 2023?" — answer: `undefined` (dataset-native null)
  - "How long has John been playing the piano for, as of December 2023?" — answer: `undefined`
  - The `undefined` in the source dataset is the canonical "no evidence" marker, confirming LoCoMo authors judged these as genuinely unanswerable.

**Why this fits better than conv-2 alternative:** dataset-authoritative null signal (LoCoMo's own labels agree it's unanswerable). F1 (principled abstain) vs F4 (fabricate specific instrument name — "guitar", "drums") discrimination intact.

**PASS**.

---

## 4. Draft #4 — null-result F1-vs-F4 → **conv-48**

**Replaces:** draft reference to `conv-15` / university attendance.

**Final question:** *Which university did Deborah attend?*

**Ground-truth answer:** `null` (not mentioned / evidence of absence)

**Evidence:** `[]`

**Verification — Deborah's university absence in conv-48:**

- Deborah's 341 turns: **zero** matches on the university/college/degree pattern (`university|college|campus|alma mater|degree|phd|bachelor|master|undergrad|postgrad|school of|faculty|professor|dean|academic|tuition`).
- LoCoMo qa entries about Deborah's education: zero (the dataset has no education-related QA entries involving Deborah).
- Jolene (the other speaker) DOES have university references:
  - `D3:1`: "My engineering professor gave us a huge robotics project" (Jolene is currently in some university's engineering program).
  - `D7:9`: "We actually met in an engineering class in college" (Jolene's friend-origin story).
  - Jolene's refs name no **specific** university, only generic "engineering college/class".

**Why this fits:** the question targets **Deborah specifically** — and Deborah has zero university content in her turns. Even if a judge correctly notes "Jolene mentions engineering college", that's Jolene, not Deborah, and the answer to "Which university did Deborah attend?" remains null. F4 triggers on fabricated specific university name for Deborah; F1 triggers on correct "not mentioned".

**PASS**.

---

## 5. Draft #5 — chain-of-anchor hobbies → **conv-30** (Jon, 5 items with anchors)

**Per-brief-preference conv:** conv-30. Local fallback set (27-33) has only conv-30 present. Conv-30 kept as primary.

**Final question:** *What hobbies and activities does Jon pursue across the dialogue history?*

**Ground-truth answer:** Jon pursues five distinct activities:
1. **Contemporary dance** — his lifelong passion since childhood; his favored style is contemporary.
2. **Running a dance studio** — opening and operating his own dance studio as a business.
3. **Competing in dance competitions** — his dance crew won first place in a local competition; he prepares for further comps.
4. **Gym / fitness** — began hitting the gym to balance the stress of his venture.
5. **Reading (self-improvement / business books)** — reads books like "The Lean Startup" for business insight.

Optional sixth item: short-trip travel (a Rome trip to clear his mind — D15:1).

**Evidence (dialogue_anchor_turns):**

| # | Activity | Primary anchors |
|---|---|---|
| 1 | Contemporary dance | `D1:6` · `D1:8` · `D1:24` |
| 2 | Running a dance studio | `D1:4` · `D1:20` · `D2:4` · `D2:8` |
| 3 | Dance competitions | `D1:16` · `D4:13` · `D8:13` |
| 4 | Gym / fitness | `D6:1` |
| 5 | Reading business books | `D12:6` · `D12:8` |

**Why this fits:** five distinct activities with named anchors across 8+ dialogue sessions. Tests F2 (partial coverage — e.g. lists only dance + studio, omits gym + reading) vs F4 (lists 5 but one is fabricated — e.g. "marathon running" instead of gym) vs correct (all 5 enumerated faithfully).

**Caveat on granularity:** items 1-3 are dance-related facets (art form, business, competition). A stricter reader could argue Jon has "really 3-4 hobbies" (dance multi-facet + gym + reading + travel). The PM draft's F2 test still holds either way — the question is how many distinct enumeration units are present in the ground truth. We enumerate five to preserve the PM-intended 5+ cardinality.

**PASS** (with granularity caveat documented above).

---

## 6. Summary — all five drafts verified, no PM ping needed

| Draft | Original conv | Adapted conv | Swap type | Status |
|---|---|---|---|---|
| #1 temporal single-anchor | conv-1 (Melanie pottery) | **conv-44** (Audrey adopts Pixie) | conv+character reference only; shape unchanged | PASS |
| #2 temporal two-anchor | conv-1 (Caroline Sweden) | **conv-44** (Pixie vs prior 3 dogs interval) | conv+character reference only; shape unchanged | PASS |
| #3 null-result instrument | conv-2 (Nate) | **conv-43** (John) | conv+character reference only; shape + null-absence unchanged | PASS |
| #4 null-result university | conv-15 (speakers) | **conv-48** (Deborah) | conv+character reference only; null-absence verified against Deborah turns only | PASS |
| #5 chain-of-anchor hobbies | conv-30 (Jon) | **conv-30** (Jon) — unchanged | no swap | PASS with granularity caveat |

All swaps fit brief §A's "trivial" definition (conv+character replacement, question-shape preserved). Proceeding to Task C (finalize triples JSON) without PM ping.
