# Task 2.2 — 14-Instance Merged Calibration Labels

**Datum:** 2026-04-22
**Composition:** 9 retained from Sprint 9 original 10 (instance #9 Frank Ocean case dropped per PM Option C ratification 2026-04-22) + 5 new PM-authored triples finalized by CC post-conv-verification.
**Source retained:** `PM-Waggle-OS/calibration/2026-04-20-failure-mode-calibration-labels.md`
**Source new:** `preflight-results/pm-custom-triples-2026-04-22.json` + `preflight-results/conv-verification-2026-04-22.md`
**F-mode distribution:** 3 correct · 1 F1 · 2 F2 · 4 F3 · 3 F4 · 1 F5 = 14

Original Methodological note on model_answer synthesis (Path A from the Sprint 9 calibration labels) applies to the 5 new instances identically.

---

## Instanca 1: `locomo_conv-26_q109` (single-hop)

**Question:** What did Mel and her kids make during the pottery workshop?
**Ground truth:** pots
**Context excerpt:** "Last Fri I finally took my kids to a pottery workshop. We all made our own pots, it was fun and therapeutic!"

**Synthesized model_answer:** "Mel and her kids made their own pots at the pottery workshop."

**human_label:**
- `verdict`: **correct**
- `failure_mode`: **null**
- `rationale`: "Model contains the required fact (pots) with equivalent phrasing. Extra context (Mel, kids, workshop) is factually aligned with ground truth, no fabrication."

---


## Instanca 2: `locomo_conv-41_q123` (single-hop)

**Question:** What did Maria plan to do later on the evening of 7 July, 2023?
**Ground truth:** have dinner with friends from the gym
**Context excerpt:** "Well, I'm off to have dinner with some friends from the gym. Talk to you later!"

**Synthesized model_answer:** "Maria planned to go to the gym for an evening workout."

**human_label:**
- `verdict`: **incorrect**
- `failure_mode`: **F3**
- `rationale`: "Model misinterprets the context: 'friends from the gym' signals where Maria knows the friends from, not that she is going to the gym. The answer derives from present substrate but gets it wrong — classic F3 misreading of existing context, not fabrication."

---


## Instanca 3: `locomo_conv-50_q141` (single-hop)

**Question:** Which city is featured in the photograph Dave showed Calvin?
**Ground truth:** Boston
**Context excerpt:** "That's Boston, Cal! Check this out, I took this picture last month, and got a great shot."

**Synthesized model_answer:** "The photograph features Chicago, showing the iconic skyline near Lake Michigan."

**human_label:**
- `verdict`: **incorrect**
- `failure_mode`: **F4**
- `rationale`: "Model names a city that does not appear in the context (Chicago, Lake Michigan) and fabricates a geographic descriptor (skyline, lake) without any supporting excerpt. This is outright invention of substrate — F4, not F3, because the answer's content has no origin in the ground truth material."

---


## Instanca 4: `locomo_conv-42_q030` (multi-hop)

**Question:** What kind of writings does Joanna do?
**Ground truth:** Screenplays, books, online blog posts, journal
**Context excerpt:** Multiple sessions — screenplay printed (S2), started a book (S17), journal is her rock (S18), online blog post about a hard moment (S18).

**Synthesized model_answer:** "Joanna writes screenplays and books."

**human_label:**
- `verdict`: **incorrect**
- `failure_mode`: **F2**
- `rationale`: "Model correctly identifies two of four required elements (screenplays, books) with no fabrication or incorrect claims, but omits the other two (online blog posts, journal) which are explicitly evidenced in D18:1 and D18:5. Partial coverage without fabrication — F2."

---


## Instanca 5: `locomo_conv-49_q015` (multi-hop)

**Question:** What kind of unhealthy snacks does Sam enjoy eating?
**Ground truth:** soda, candy
**Context excerpt:** "Still enjoying my soda and candy, although I know it's not the best habit to have."

**Synthesized model_answer:** "Sam enjoys soda and candy, acknowledging it's not a healthy habit."

**human_label:**
- `verdict`: **correct**
- `failure_mode`: **null**
- `rationale`: "Model contains both required facts (soda, candy). Additional commentary about habit acknowledgment mirrors context faithfully, no incorrect additions."

---


## Instanca 6: `locomo_conv-41_q036` (multi-hop)

**Question:** What music events has John attended?
**Ground truth:** Live music event, violin concert
**Context excerpt:** Violin concert in town found by John (S8), live music event with family (S20).

**Synthesized model_answer:** "John enjoys finding family-friendly activities like walks and picnics in the park, and likes exploring events in his town."

**human_label:**
- `verdict`: **incorrect**
- `failure_mode`: **F5**
- `rationale`: "Model answer is coherent and derives from context (walks, picnics, town events appear in D8:11), but does not address the specific question — which music events did John attend. Response pivots to a related but different topic (John's family-activity preferences). No hallucination, no incorrect facts about John's activities, but off-topic relative to prompt — F5."

---


## Instanca 7: `locomo_conv-42_q038` (temporal)

**Question:** When did Joanna make a dessert with almond milk?
**Ground truth:** The Friday before 14 September, 2022
**Context excerpt:** Session 21 (14 September, 2022): "Last Friday, I made a deeeelish dessert with almond milk."

**Synthesized model_answer:** "Joanna made the dessert on 7 September, 2022."

**human_label:**
- `verdict`: **incorrect**
- `failure_mode`: **F3**
- `rationale`: "Model derives date from context (session is 14 September, 'last Friday' reference) but computes it incorrectly. 7 September 2022 was a Wednesday — Friday before 14 September was actually 9 September. Answer draws on present substrate but arrives at a demonstrably wrong specific date — F3, not F4, because model did not fabricate the relationship, only miscomputed it."

---


## Instanca 8: `locomo_conv-41_q053` (temporal)

**Question:** When did John help renovate his hometown community center?
**Ground truth:** 2022
**Context excerpt:** Session 28 (5 August, 2023): "I haven't been able to volunteer much lately, but I definitely care about it. Last year, I helped renovate a rundown community center back home."

**Synthesized model_answer:** "John renovated the community center in 2020, during the early pandemic period when local infrastructure needed volunteer support."

**human_label:**
- `verdict`: **incorrect**
- `failure_mode`: **F4**
- `rationale`: "Model produces a year (2020) that cannot be derived from the context — 'last year' relative to 5 August 2023 unambiguously yields 2022. Model also fabricates causal context ('early pandemic period', 'volunteer support for infrastructure') that does not appear in any excerpt. Content generation beyond what the substrate allows — F4, not F3, because the fabricated context is the bulk of the answer."

---


## Instanca 9: `locomo_conv-47_q017` (open-ended)

**Question:** What is the board game where you have to find the imposter that John mentions to James?
**Ground truth:** Mafia
**Context excerpt:** "I've been playing one more game with friends these days. It's a game to figure out who the impostors are and it's super fun."

**Synthesized model_answer:** "I do not have enough information in the provided context to determine the name of the game John mentioned."

**human_label:**
- `verdict`: **incorrect**
- `failure_mode`: **F1**
- `rationale`: "Model explicitly refuses to answer, stating it lacks sufficient information. No partial answer, no fabrication, no off-topic pivot. Ground truth (Mafia) is not literally stated in the D8:36 excerpt — model plays it safe and abstains rather than inferring from the 'find the impostor' description. Classic F1 abstain behavior."

---

## Distribucija sinteze

| Kategorija | Broj | Instance |
|------------|------|----------|
| correct    | 3    | #1, #5, #9 |
| F1 ABSTAIN | 1    | #10 |
| F2 PARTIAL | 1    | #4 |
| F3 INCORRECT | 2  | #2, #7 |
| F4 HALLUCINATED | 2 | #3, #8 |
| F5 OFF-TOPIC | 1  | #6 |
| **Total**  | **10** | |

Distribucija pokriva ceo spektar taksonomije sa bar po jednim reprezentativnim primerom svake failure klase + 3 pozitivna kontrolna slučaja. LoCoMo kategorije (single-hop / multi-hop / temporal / open-ended) su raspoređene tako da nijedna kategorija ne dominira svojim failure tipom — single-hop dobija correct/F3/F4, multi-hop dobija correct/F2/F5, temporal dobija F3/F4, open-ended dobija correct/F1.

---

## Referentne odluke i napomene

- Decision tree redosled po §3 taksonomije (F1 → F5 → F4 → F2 → F3) primenjen pri svakom incorrect labeliranju; rationale navodi zašto alternativna kategorija nije odabrana kada je edge-case prisutan (instance #7 F3 vs F4, #8 F4 vs F3).
- Sve synthesized model answers su plausibilne — pisane u stilu kakvim bi realan LLM mogao da proizvede (ne straw-man). Cilj: test judge-a na realističnim failure patterns, ne na očiglednim podmetanjima.
- Instance #3 i #8 su dva različita F4 test-case-a po nameri: #3 fabrikuje single entitet (grad), #8 fabrikuje narative context + godinu. Ovo pokriva dva pod-tipa hallucination-a (point-fact vs contextual-frame).
- Instance #2 i #7 su dva F3 test-case-a sa različitim izvorom greške: #2 semantička greška (razumevanje "friends from the gym"), #7 računska greška (date math). Judge treba da ih oba prepozna kao F3, ne da #7 pogrešno klasifikuje kao F2 (delimično tačno).
- Instance #4 F2 ima 2/4 tačnih stavki = 50% coverage. Odluka je kategorisano kao F2 a ne hybrid F2+F3, per §11 OQ-FM-2 koji ostaje F3 samo kada postoji eksplicitna pogrešna činjenica, što #4 nema (samo omission).
- Instance #6 F5 je namerno postavljena da bude **koherentna** — model answer je faktualno tačan ali ne adresira pitanje. Ovo je najteži failure mode za judge jer zahteva razumevanje prompt intent-a, ne samo verifikaciju činjenica.

---

## Sledeći korak — CC second-pass

CC u Sprint 9 preuzima ovaj dokument, validira každu instance sa svojom procenom, i:
1. Potvrđuje (✓) ili osporava (✗) svaki label + rationale.
2. Kada postoji razlika: CC i PM razrešavaju u handoff sesiji pre nego što labele idu u `failure-mode-calibration-10.jsonl` `human_label` polja.
3. Posle razrešenja, CC puni JSONL sa konačnim labelima.
4. Judge-kalibracioni run (Sonnet preko svih 10, plus Haiku/GPT-5/Gemini u 4-judge ensemble prep) meri match rate. Cilj: ≥ 8/10.

---

## Referentni dokumenti

- Failure mode taksonomija: `PM-Waggle-OS/strategy/2026-04-20-failure-mode-taxonomy.md`
- Failure mode OQ resolutions: `PM-Waggle-OS/decisions/2026-04-20-failure-mode-oq-resolutions-locked.md`
- Source JSONL: `waggle-os/benchmarks/data/failure-mode-calibration-10.jsonl` (seed=43)
- Preflight gate spec: `PM-Waggle-OS/strategy/2026-04-20-preflight-gate-spec.md`
- Sprint 8 exit ping: `PM-Waggle-OS/sessions/2026-04-20-sprint-8-exit.md`

## Instanca 10: `locomo_conv-44_pm_2026-04-22_001` (temporal-scope)

**Question:** When did Audrey adopt Pixie?
**Ground truth:** around April 2, 2023
**Context excerpt:** Session 2 (2:42 pm on 2 April, 2023) Audrey: "Hey Andrew, I got a surprise for you! We adopted another puppy called Pixie. She's SO cute! Isn't she just the cutest?"

**Synthesized model_answer:** Audrey adopted Pixie in early April 2023.

**human_label:**
- `verdict`: **incorrect**
- `failure_mode`: **F3**
- `rationale`: "Answer is vague-but-derived: "early April" overlaps with true "around April 2, 2023" but loses the specific date precision the ground truth provides. Derivable from substrate but imprecise — F3 misread of specific date, not fabrication."

---

## Instanca 11: `locomo_conv-44_pm_2026-04-22_002` (temporal-scope)

**Question:** How many years passed between Audrey adopting Pixie and her other three dogs?
**Ground truth:** three years
**Context excerpt:** Session 2 (2:42 pm on 2 April, 2023) Audrey: "Hey Andrew, I got a surprise for you! We adopted another puppy called Pixie. She's SO cute! Isn't she just the cutest?"
Session 1 (1:10 pm on 27 March, 2023) Audrey: "I've had them for 3 years! Their names are Pepper, Precious and Panda. I can't live without my little ones!"

**Synthesized model_answer:** Two years passed between Audrey adopting Pixie and her other three dogs.

**human_label:**
- `verdict`: **incorrect**
- `failure_mode`: **F3**
- `rationale`: "Answer gives a specific but incorrect interval (two years vs ground-truth three years). Miscounted arithmetic on derivable anchors — F3 class misread, not F4 fabrication."

---

## Instanca 12: `locomo_conv-43_pm_2026-04-22_003` (null-result)

**Question:** What musical instrument does John play?
**Ground truth:** null
**Context excerpt:** (Excerpt — locomo_conv-43 opening; dialogue contains no evidence of the queried attribute across 680 turns.)
Session 1 (7:48 pm on 21 May, 2023) John: "Hey Tim, nice to meet you! What's up? Anything new happening?"
Session 1 (7:48 pm on 21 May, 2023) Tim: "Hey John! Great to meet you. Been discussing collaborations for a Harry Potter fan project I am working on - super excited! Anything interesting happening for you?"
Session 1 (7:48 pm on 21 May, 2023) John: "That's great! I just signed with a new team - excited for the season!"
Session 1 (7:48 pm on 21 May, 2023) Tim: "Woohoo! Congrats on the new team. Which team did you sign with?"

**Synthesized model_answer:** John plays the guitar, which he mentions practicing during weekend jam sessions with his high school team.

**human_label:**
- `verdict`: **incorrect**
- `failure_mode`: **F4**
- `rationale`: "Model names a specific instrument (guitar) with fabricated supporting detail (weekend jam sessions, high school team). Dialogue contains zero evidence for John playing any instrument. This is classic F4 — invented substrate, plausible-sounding but entirely unsupported."

---

## Instanca 13: `locomo_conv-48_pm_2026-04-22_004` (null-result)

**Question:** Which university did Deborah attend?
**Ground truth:** null
**Context excerpt:** (Excerpt — locomo_conv-48 opening; dialogue contains no evidence of the queried attribute across 681 turns.)
Session 1 (4:06 pm on 23 January, 2023) Deborah: "Hey Jolene, nice to meet you! How's your week going? Anything fun happened?"
Session 1 (4:06 pm on 23 January, 2023) Jolene: "Hi Deb! Good to meet you! Yeah, my week's been busy. I finished an electrical engineering project last week - took a lot of work, but it's done now. Anything fun happening for you?"
Session 1 (4:06 pm on 23 January, 2023) Deborah: "Congrats! Last week I visited a place that holds a lot of memories for me. It was my mother`s old house."
Session 1 (4:06 pm on 23 January, 2023) Jolene: "Why does it hold such special memories for you?"

**Synthesized model_answer:** Deborah attended Stanford University for her undergraduate degree in computer science.

**human_label:**
- `verdict`: **incorrect**
- `failure_mode`: **F4**
- `rationale`: "Model names a specific university (Stanford) and a specific degree (computer science) for Deborah, neither of which appear in the dialogue. This is F4 — full fabrication from a null-evidence base. Stanford is a plausible-default "prestigious US university" choice that LLMs commonly hallucinate in absence of context."

---

## Instanca 14: `locomo_conv-30_pm_2026-04-22_005` (chain-of-anchor)

**Question:** What hobbies and activities does Jon pursue across the dialogue history?
**Ground truth:** Jon pursues five distinct activities: (1) contemporary dance (lifelong passion, favored style contemporary), (2) running his own dance studio as a business, (3) competing in dance competitions (dance crew won first place locally; prepares for further comps), (4) gym / fitness (began hitting the gym to balance venture stress), (5) reading business-improvement books (e.g. "The Lean Startup").
**Context excerpt:** Session 1 (4:04 pm on 20 January, 2023) Jon: "I've been into dancing since I was a kid and it's been my passion and escape. I wanna start a dance studio so I can teach others the joy that dancing brings me."
Session 1 (4:04 pm on 20 January, 2023) Jon: "Cool, Gina! I love all dances, but contemporary is my top pick. It's so expressive and powerful! What's your fave?"
Session 1 (4:04 pm on 20 January, 2023) Jon: "Thanks! I rehearsed with a small group of dancers after work. We do all kinds of dances, from contemporary to hip-hop. We've got some cool projects in the works. Finishing up choreography to perform at a nearby festival next month. Can't wait!"
Session 1 (4:04 pm on 20 January, 2023) Jon: "Sorry to hear that! I'm starting a dance studio 'cause I'm passionate about dancing and it'd be great to share it with others."
Session 1 (4:04 pm on 20 January, 2023) Jon: "Wow, that must've been great! Check my ideal dance studio by the water."
Session 2 (2:32 pm on 29 January, 2023) Jon: "Hey Gina! Thanks for asking. I'm on the hunt for the ideal spot for my dance studio and it's been quite a journey! I've been looking at different places and picturing how the space would look. I even found a place with great natural light! Oh, I've been to Paris yesterday! It was sooo cool."
Session 2 (2:32 pm on 29 January, 2023) Jon: "Yeah, good flooring's crucial. I'm after Marley flooring, which is what dance studios usually use. It's great 'cause it's grippy but still lets you move, plus it's tough and easy to keep clean."
Session 1 (4:04 pm on 20 January, 2023) Jon: "Woah, that pic's from when my dance crew took home first in a local comp last year. It was amazing up on that stage! I'm super keen to spread that intensity with other peeps. Gina, you ever been in any dance comps or shows?"
Session 4 (10:43 am on 4 February, 2023) Jon: "I'm getting ready for a dance comp near me next month. It's a great chance for me to show my skillz and, hopefully, get some props from the dance fam. Super stoked!"
Session 8 (1:26 pm on 3 April, 2023) Jon: "Thanks, Gina! I'm expanding my dance studio's social media presence and offering workshops and classes to local schools and centers. I'm also hosting a dance competition next month to showcase local talent and bring more attention to my studio. All the work's paying off - I'm seeing progress and the dancers are so excited. It's such a great feeling to give a place where people can express themselves through dance!"
Session 6 (2:35 pm on 16 March, 2023) Jon: "Hi Gina! Been hectic for me lately. Started hitting the gym last week to stay on track with the venture. Gotta figure out how to balance it all, but it's going well. How about you?"
Session 12 (7:18 pm on 27 May, 2023) Jon: "I'm currently reading "The Lean Startup" and hoping it'll give me tips for my biz."
Session 12 (7:18 pm on 27 May, 2023) Jon: "Yeah, the book got me thinking about building a focused and efficient business. Adapting and tweaking from customer feedback is important too, so I'm gonna try it out!"

**Synthesized model_answer:** Jon pursues contemporary dance and running his own dance studio. He is passionate about dance since childhood and is working on opening a studio.

**human_label:**
- `verdict`: **incorrect**
- `failure_mode`: **F2**
- `rationale`: "Model lists 2 of 5 ground-truth activities correctly (contemporary dance + dance studio business) with no fabrication — but omits dance competitions, gym/fitness, and reading. This is textbook F2: partial coverage / omission without hallucination. The two items mentioned are accurately supported; the failure mode is the three missing items."

---
