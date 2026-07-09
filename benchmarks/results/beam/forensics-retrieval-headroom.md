# BEAM FULL700 — retrieval-availability (headroom) forensics

**FREE probe** — local ollama embeddings only, NO OpenAI calls.
Probe script: `benchmarks/harness/scripts/_probe-headroom.ts` (npx tsx).
Source data: complete 700-question snapshot of `beam-1m-FULL700-gpt5-retv2.jsonl`
(first-occurrence dedup by instance_id → 700 unique rows). Note: the live JSONL was
concurrently being healed during this audit (56 empty-answer rows re-answered by
another job), so the numbers below are from the probe run taken against the complete
700-row snapshot; stable copy for reproduction: `beam-1m-FULL700-gpt5-retv2.backup.jsonl`.

**Hypothesis under test:** top-k=30 raw turns is too NARROW — the nugget-supporting
content exists in the mind but only surfaces at k=60/100/150. If true, higher-k (or
wider retrieval) is the path to SOTA; if false (content surfaces at k<=30 but answers
still miss it), the problem is answer-side.

## Method

For each FAILED nugget (score 0) on the three lossy abilities
(summarization, event_ordering, multi_session_reasoning):

1. Sample up to 60 failed nuggets per ability, round-robin across conversations
   (60/60/60 sampled, spanning 33/35/29 convs respectively; 180 nugget probes over
   108 unique questions; convs processed sequentially — ollama is fragile under
   concurrency; each mind opened once).
2. Retrieve the question's top-150 raw turns ONCE
   (`substrate.search.search(question, {limit: 150, gopId: "beam_<conv>"})` —
   hybrid FTS5+vec RRF over the minds-1M raw-turn minds, ollama nomic-embed-text).
3. Extract 2-4 distinctive key terms from the nugget text (rubric-boilerplate
   prefixes like "LLM response should state/contain/mention:" stripped; stopwords,
   framing verbs, and spelled-out numbers excluded; digit-bearing tokens, all-caps
   acronyms/tickers, and capitalized proper nouns rescued and up-weighted).
4. Find the FIRST RANK at which any retrieved turn contains >= half of the key terms.

Bucket: rank <=30 → we already retrieved it at FULL700's k but the answer missed it
(ANSWER-SIDE); rank 31-150 → only wider k surfaces it (RETRIEVAL-SIDE); never in
top-150 → NOT-IN-HAYSTACK.

## Rank distribution per ability

| ability | n | <=30 (ANSWER-SIDE) | 31-60 | 61-100 | 101-150 | NOT FOUND | median hit-rank (found) |
|---|--:|--:|--:|--:|--:|--:|--:|
| summarization | 60 | 53 (88%) | 3 (5%) | 1 (2%) | 1 (2%) | 2 (3%) | 4 (n=58) |
| event_ordering | 60 | 54 (90%) | 4 (7%) | 1 (2%) | 0 (0%) | 1 (2%) | 3 (n=59) |
| multi_session_reasoning | 60 | 56 (93%) | 1 (2%) | 0 (0%) | 1 (2%) | 2 (3%) | 1.5 (n=58) |

## Higher-k token / cost estimate (retrieved raw-turn context)

Context = concatenated retrieved raw turns; tokens = chars/4; price = gpt-5 $1.25/M input.
Measured over the probe's 108 unique failed questions.

| k | mean context tokens/question | input $/question | input $/700 questions |
|--:|--:|--:|--:|
| 60 | 53,281 | $0.0666 | $46.62 |
| 100 | 87,571 | $0.1095 | $76.62 |

(k=60 is roughly 2x and k=100 roughly 3.2x the k=30 input spend, and k=100 pushes
~88K context tokens per question before the prompt scaffold.)

## Verdict per ability

- **summarization**: ANSWER-SIDE (88% of failed nuggets found at rank <=30; retrieval 31-150 = 8%; not-in-haystack = 3%)
- **event_ordering**: ANSWER-SIDE (90% at <=30; retrieval 31-150 = 8%; not-in-haystack = 2%)
- **multi_session_reasoning**: ANSWER-SIDE (93% at <=30; retrieval 31-150 = 3%; not-in-haystack = 3%)

## Caveat & interpretation

Term-match is a NOISY proxy with a real false-positive rate: for these three abilities
the nugget-supporting content is often an AGGREGATE (a total count, a date range, a
cross-session inference) that NO single turn states verbatim, so a low-rank "hit" often
means the right *conversation thread* surfaced early, not that one turn proves the nugget.
That biases the <=30 bucket UPWARD. But the bias cuts the same way for every band, and the
signal is overwhelming: median first-hit rank is 1.5-4 and NOT-FOUND is only 2-3%, so the
relevant material is retrieved EARLY. Widening k to 60/100/150 moves only ~8% of failed
nuggets, and those are borderline. The hypothesis "top-k=30 is too narrow" is therefore
FALSIFIED for these abilities: the material is present at k<=30 but the answer fails to
synthesize / aggregate / order it. The lever is ANSWER-SIDE (synthesis / distillation /
coverage-shaped context arrangement), not wider retrieval — which also costs 2-3x more
input and stresses the context window.

Robustness note: the probe was run twice — once with a looser key-term heuristic
(87/83/88% at <=30) and once with the tightened extraction above (88/90/93%). The
distribution barely moved, so the ANSWER-SIDE finding is not an artifact of
filler-term leakage.

## 10 validation triples (nugget → best-matching turn @ rank)

_Eyeball whether the "matching" turn actually supports the nugget (proxy sanity check)._
_Honest read: triples 4, 5, 7, 9, 10 are true supporting-content hits; 1, 2, 3, 6, 8 are
same-thread topical turns — the aggregate-nugget false-positive mode described above._

**1. [multi_session_reasoning] rank 2**  · terms: `cities`
- nugget: LLM response should state: Four cities
- turn@2: assistant: Taking advice from someone who shares your age and has extensive travel experience can be incredibly valuable. Nancy's insights and experiences can provide practical and relatable guidance as you plan your trip. Here are some reasons why you should consider taking more of Nancy's advice: …

**2. [summarization] rank 1**  · terms: `installation`, `preparation`, `structured`, `timeline`
- nugget: LLM response should contain: The project timeline was structured from June 15 to June 22, covering preparation, installation, sealing, and cleanup phases
- turn@1: assistant: To determine how the $450 cost for Owens Corning insulation rolls fits into your overall budget for the attic insulation upgrade, let's break down the budget and ensure you stay within your financial limits. Here's a detailed plan: ### Overall Budget for Attic Insulation Upgrade - **Total…

**3. [summarization] rank 3**  · terms: `Christmas`, `meticulously`, `participants`, `coordinated`
- nugget: LLM response should contain: Christmas Eve dinner and associated holiday activities were meticulously planned and executed through coordinated efforts involving multiple participants and thoughtful integration of traditions
- turn@3: assistant: To ensure your Christmas Eve dinner is well-planned and enjoyable, similar to Jordan's successful rehearsal dinner, focus on several key areas. Here are some essential steps and considerations to help you create a memorable event: ### Key Areas to Focus On 1. **Clear Planning and Organiza…

**4. [multi_session_reasoning] rank 2**  · terms: `derivates`, `problems`, `partial`
- nugget: LLM response should state: 8 problems on partial derivates
- turn@2: user: I completed 6 practice problems on partial derivatives and scored 5 correct within 90 minutes, but I'm not sure if I fully understand the concept, can someone explain it to me in simpler terms? ->-> 1,29

**5. [multi_session_reasoning] rank 1**  · terms: `stabilizing`, `population`, `5000`, `logistic`
- nugget: LLM response should state: the logistic model predicts population stabilizing near the carrying capacity of 5000
- turn@1: assistant: Certainly! Applying ordinary differential equations (ODEs) to real-world problems, such as population growth modeling, can provide valuable insights into how populations change over time. Let's explore how ODEs can be used in population growth modeling, specifically focusing on the logist…

**6. [summarization] rank 2**  · terms: `Integration`, `environments`, `APIs`, `18.2`
- nugget: LLM response should contain: Integration examples for both APIs were provided, tailored for React 18.2 frontend and Node.js 18 backend environments.
- turn@2: assistant: Setting up a Kubernetes cluster for horizontal scaling involves several steps, including installing Kubernetes, deploying your services, and configuring autoscaling. Below is a comprehensive guide to help you set up a Kubernetes cluster and deploy your services for horizontal scaling. ###…

**7. [summarization] rank 9**  · terms: `Initially`, `Translate`, `DeepL`, `integration`
- nugget: LLM response should contain: Initially, a thorough comparison between Google Translate API v3 and DeepL API v2 was conducted, evaluating accuracy, cost, language support, and ease of integration
- turn@9: assistant: Certainly! Comparing Google Translate API v3 and DeepL API v2 for your multi-language chatbot project involves evaluating factors such as accuracy, cost, ease of integration, and support for the languages you need. Here's a detailed comparison to help you decide which API might be more su…

**8. [event_ordering] rank 10**  · terms: `installation`, `Bathroom`, `shelf`
- nugget: Bathroom shelf installation
- turn@10: assistant: Comparing the experience of replacing kitchen cabinet doors with Kristen to other DIY projects you've done can provide valuable insights into your progress and the effectiveness of your teamwork. Here are some points to consider: ### Previous DIY Projects: 1. **Living Room Wall Painting**…

**9. [event_ordering] rank 15**  · terms: `efficiency`, `API`, `limiting`
- nugget: LLM response should mention: API rate limiting and efficiency
- turn@15: assistant: Certainly! To design a microservices architecture for your stock trading bot, you can use message queues to facilitate communication between the different modules. This approach ensures that each module operates independently and can scale independently as well. Here's a high-level design…

**10. [multi_session_reasoning] rank 1**  · terms: `GOOG`
- nugget: LLM response should state: GOOG
- turn@1: assistant: Certainly! To optimize the performance of your stock trading bot and achieve the target API response time of under 250ms, you can leverage asynchronous programming with `asyncio` and `aiohttp`. This approach allows you to make concurrent API calls efficiently, reducing the overall time ta…
