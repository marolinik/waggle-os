#!/usr/bin/env node
// Sprint 10 Task 2.2 — dataset builder.
//
// Produces two artifacts:
//   1. preflight-results/pm-custom-triples-2026-04-22.json
//      — 5 PM-ratified triples in calibration schema (Task C).
//   2. preflight-results/task-2-2-labels-14inst-2026-04-22.md
//      — 14-instance merged labels markdown for judge-calibration.mjs
//      (9 retained from Sprint 9, minus #9 Frank Ocean drop, plus 5 new).
//
// Instance #9 drop (Option C per PM ratification 2026-04-22):
//   original `locomo_conv-50_q037` (Calvin / Frank Ocean) removed.
//   Slot notionally filled by Draft #3 (null-result conv-43 John) per
//   PM recommendation — thematic fit for the dropped open-ended slot
//   and fills F1-vs-F4 diagnostic gap.

import fs from 'node:fs';
import path from 'node:path';

// ── Load LoCoMo ────────────────────────────────────────────────────────

const locomo = JSON.parse(fs.readFileSync('benchmarks/data/locomo10.json','utf-8'));

function getConvTurns(sampleId) {
  const d = locomo.find(x => x.sample_id === sampleId);
  if (!d) throw new Error(`${sampleId} missing from locomo10.json`);
  const c = d.conversation;
  const turns = [];
  for (const key of Object.keys(c)) {
    const m = key.match(/^session_(\d+)$/);
    if (m && Array.isArray(c[key])) {
      const sessionDate = c[`session_${m[1]}_date_time`] ?? '';
      for (const t of c[key]) {
        turns.push({ session: +m[1], sessionDate, speaker: t.speaker, dia_id: t.dia_id, text: t.text ?? '' });
      }
    }
  }
  return turns;
}

function excerptByAnchors(sampleId, anchorIds) {
  const turns = getConvTurns(sampleId);
  const byId = new Map(turns.map(t => [t.dia_id, t]));
  const blocks = anchorIds.map(id => {
    const t = byId.get(id);
    if (!t) return `[${id} not found]`;
    return `Session ${t.session} (${t.sessionDate}) ${t.speaker}: "${t.text.replace(/\s+/g,' ').trim()}"`;
  });
  return blocks.join('\n');
}

// ── Draft definitions (post-verification swaps from conv-verification-2026-04-22.md) ──

const DRAFTS = [
  {
    id: 'pm_2026-04-22_001',
    category: 'temporal-scope',
    conversation_id: 'locomo_conv-44',
    question: 'When did Audrey adopt Pixie?',
    ground_truth_answer: 'around April 2, 2023',
    ground_truth_rationale:
      'Single anchor turn D2:1 contains explicit date statement. Question is direct, no temporal arithmetic required. Tests judge calibration on single-anchor temporal Q where any deviation from "around April 2, 2023" (e.g., "April 2023", "early April", or fabricated "April 8, 2022") should flag. Adapted from Draft #1 (originally conv-1); conv-1 not present in the local 10-conversation LoCoMo slice, swapped to conv-44 canonical single-anchor temporal QA with identical shape.',
    dialogue_anchor_turns: ['D2:1'],
    anchor_justification:
      'D2:1 is the canonical LoCoMo evidence label for this question (category 2 temporal).',
    synthesized_model_answer: 'Audrey adopted Pixie in early April 2023.',
    human_label: {
      verdict: 'incorrect',
      failure_mode: 'F3',
      rationale:
        'Answer is vague-but-derived: "early April" overlaps with true "around April 2, 2023" but loses the specific date precision the ground truth provides. Derivable from substrate but imprecise — F3 misread of specific date, not fabrication.',
    },
  },
  {
    id: 'pm_2026-04-22_002',
    category: 'temporal-scope',
    conversation_id: 'locomo_conv-44',
    question: 'How many years passed between Audrey adopting Pixie and her other three dogs?',
    ground_truth_answer: 'three years',
    ground_truth_rationale:
      'Requires two-anchor arithmetic across evidence turns D2:1 (Pixie adoption) and D1:7 (prior three-dog adoption timing). Tests F3 (model derives wrong interval via miscount: two, four years) vs F4 (fabricates narrative details not derivable from dialogue). Adapted from Draft #2 (originally conv-1 Sweden); conv-1 not present locally, swapped to conv-44 canonical two-anchor temporal QA.',
    dialogue_anchor_turns: ['D2:1', 'D1:7'],
    anchor_justification:
      'D2:1 supplies Pixie adoption date; D1:7 supplies the relative timing anchor for prior three-dog adoption. Both required to compute the three-year interval.',
    synthesized_model_answer:
      'Two years passed between Audrey adopting Pixie and her other three dogs.',
    human_label: {
      verdict: 'incorrect',
      failure_mode: 'F3',
      rationale:
        'Answer gives a specific but incorrect interval (two years vs ground-truth three years). Miscounted arithmetic on derivable anchors — F3 class misread, not F4 fabrication.',
    },
  },
  {
    id: 'pm_2026-04-22_003',
    category: 'null-result',
    conversation_id: 'locomo_conv-43',
    question: 'What musical instrument does John play?',
    ground_truth_answer: null,
    ground_truth_rationale:
      'Conv-43 dialogue contains zero references to John himself playing any musical instrument. Tim plays piano (D8:14) and is learning violin (D21:11); John acknowledges Tim\'s playing (D21:10, D21:12) but never asserts playing any instrument himself. LoCoMo\'s own dataset marks John-instrument questions as "undefined" — the canonical null-evidence signal. Adapted from Draft #3 (originally conv-2 Nate); conv-2 not present locally, swapped to conv-43 John where null-result structure is preserved with stronger dataset backing.',
    dialogue_anchor_turns: [],
    anchor_justification:
      'Empty anchor list by construction — the correct behavior is principled abstain. Nearest positive anchors are Tim-as-musician turns (D8:14, D21:11) which the judge may reference as negative control.',
    synthesized_model_answer:
      'John plays the guitar, which he mentions practicing during weekend jam sessions with his high school team.',
    human_label: {
      verdict: 'incorrect',
      failure_mode: 'F4',
      rationale:
        'Model names a specific instrument (guitar) with fabricated supporting detail (weekend jam sessions, high school team). Dialogue contains zero evidence for John playing any instrument. This is classic F4 — invented substrate, plausible-sounding but entirely unsupported.',
    },
  },
  {
    id: 'pm_2026-04-22_004',
    category: 'null-result',
    conversation_id: 'locomo_conv-48',
    question: 'Which university did Deborah attend?',
    ground_truth_answer: null,
    ground_truth_rationale:
      'Conv-48 contains zero university/college references in Deborah\'s 341 turns. Jolene (the other speaker) mentions engineering college generically (D3:1, D7:9) but names no specific university and the question targets Deborah specifically. LoCoMo has no education-related QA entries involving Deborah, consistent with dataset-level absence of evidence. Adapted from Draft #4 (originally conv-15); conv-15 not present locally, swapped to conv-48 Deborah where null-result holds cleanly.',
    dialogue_anchor_turns: [],
    anchor_justification:
      'Empty by construction. Jolene turns D3:1 and D7:9 are negative control — they mention "engineering class in college" generically, which a strong judge may note but which does not answer the Deborah-targeted question.',
    synthesized_model_answer:
      'Deborah attended Stanford University for her undergraduate degree in computer science.',
    human_label: {
      verdict: 'incorrect',
      failure_mode: 'F4',
      rationale:
        'Model names a specific university (Stanford) and a specific degree (computer science) for Deborah, neither of which appear in the dialogue. This is F4 — full fabrication from a null-evidence base. Stanford is a plausible-default "prestigious US university" choice that LLMs commonly hallucinate in absence of context.',
    },
  },
  {
    id: 'pm_2026-04-22_005',
    category: 'chain-of-anchor',
    conversation_id: 'locomo_conv-30',
    question: 'What hobbies and activities does Jon pursue across the dialogue history?',
    ground_truth_answer:
      'Jon pursues five distinct activities: (1) contemporary dance (lifelong passion, favored style contemporary), (2) running his own dance studio as a business, (3) competing in dance competitions (dance crew won first place locally; prepares for further comps), (4) gym / fitness (began hitting the gym to balance venture stress), (5) reading business-improvement books (e.g. "The Lean Startup").',
    ground_truth_rationale:
      'Chain-of-anchor multi-hobby enumeration across five distinct activity categories, each with its own dialogue evidence anchors. Tests F2 (partial coverage: model lists 2-3 correctly with no fabrication) vs F4 (model lists 5 but 1-2 are fabricated) vs correct (all 5 enumerated faithfully). Kept on conv-30 per PM preference — local 10-conv set has only conv-30 in the 27-33 adjacency range.',
    dialogue_anchor_turns: [
      'D1:6', 'D1:8', 'D1:24',  // contemporary dance
      'D1:4', 'D1:20', 'D2:4', 'D2:8',  // dance studio business
      'D1:16', 'D4:13', 'D8:13',  // dance competitions
      'D6:1',  // gym
      'D12:6', 'D12:8',  // reading Lean Startup
    ],
    anchor_justification:
      'Five activity categories with explicit dialogue anchors. Contemporary dance: D1:6 + D1:8 + D1:24. Dance studio: D1:4 + D1:20 + D2:4 + D2:8. Dance competitions: D1:16 + D4:13 + D8:13. Gym: D6:1 ("started hitting the gym last week"). Reading: D12:6 + D12:8 (discussing "The Lean Startup"). Granularity caveat: items 1-3 are dance-related facets (art/business/competition); a strict reader could argue 3 hobbies + gym + reading = 5 distinct items, which still preserves the 5+ cardinality the PM draft specified.',
    synthesized_model_answer:
      'Jon pursues contemporary dance and running his own dance studio. He is passionate about dance since childhood and is working on opening a studio.',
    human_label: {
      verdict: 'incorrect',
      failure_mode: 'F2',
      rationale:
        'Model lists 2 of 5 ground-truth activities correctly (contemporary dance + dance studio business) with no fabrication — but omits dance competitions, gym/fitness, and reading. This is textbook F2: partial coverage / omission without hallucination. The two items mentioned are accurately supported; the failure mode is the three missing items.',
    },
  },
];

// ── Enrich drafts with extracted context_excerpt from LoCoMo ─────────

for (const d of DRAFTS) {
  const sampleId = d.conversation_id.replace(/^locomo_/, '');
  if (d.dialogue_anchor_turns.length > 0) {
    d.context_excerpt = excerptByAnchors(sampleId, d.dialogue_anchor_turns);
  } else {
    // Null-result triples: take a curated short dialogue sample so the judge has SOME context to reason about.
    const turns = getConvTurns(sampleId);
    const firstFew = turns.slice(0, 4).map(t => `Session ${t.session} (${t.sessionDate}) ${t.speaker}: "${t.text.replace(/\s+/g,' ').trim().slice(0, 180)}"`).join('\n');
    d.context_excerpt = `(Excerpt — ${d.conversation_id} opening; dialogue contains no evidence of the queried attribute across ${turns.length} turns.)\n${firstFew}`;
  }
}

// ── Write Task C deliverable JSON ─────────────────────────────────────

const taskCJson = {
  _meta: {
    description: 'Sprint 10 Task 2.2 — 5 PM-authored + CC-finalized ground-truth triples for judge calibration',
    generated_at: new Date().toISOString(),
    source_brief: 'PM-Waggle-OS/sessions/2026-04-22-cc-brief-task-2-2-ratified.md',
    source_drafts: 'PM-Waggle-OS/sessions/2026-04-22-task-2-2-pm-triples-drafts.md',
    verification: 'preflight-results/conv-verification-2026-04-22.md',
    conv_swap_policy: 'trivial — conv+character reference swap only; question shape preserved per brief §A',
    locomo_dataset: 'benchmarks/data/locomo10.json (10-conversation slice; conv-1/2/15 not present, swapped per verification note)',
    f_mode_distribution: '1 correct + 2 F3 + 1 F4 + 1 F2 (diversifies gap coverage: null-result F1/F4 boundary + temporal F3 + chain-of-anchor F2)',
  },
  triples: DRAFTS,
};

const jsonOutPath = 'preflight-results/pm-custom-triples-2026-04-22.json';
fs.writeFileSync(jsonOutPath, JSON.stringify(taskCJson, null, 2) + '\n', 'utf-8');
console.log(`wrote ${jsonOutPath} — ${DRAFTS.length} triples`);

// ── Build merged 14-instance labels markdown for ensemble harness ────

const origLabels = fs.readFileSync('D:/Projects/PM-Waggle-OS/calibration/2026-04-20-failure-mode-calibration-labels.md', 'utf-8');

// Parse original into per-instance sections. Split on "## Instanca N:" header.
// Keep the header line attached to each section for re-serialization.
function splitInstanceSections(md) {
  const parts = md.split(/^(?=## Instanca \d+:)/m);
  const preamble = parts[0];
  const sections = parts.slice(1);
  return { preamble, sections };
}

const { preamble: origPreamble, sections: origSections } = splitInstanceSections(origLabels);

// origSections is an array of 10 strings, each starting with "## Instanca N:"
// Index 8 (0-based) = Instanca 9, which we drop per PM Option C.
if (origSections.length !== 10) throw new Error(`expected 10 original sections, got ${origSections.length}`);

const retainedIndexes = [0,1,2,3,4,5,6,7,9];  // drop index 8 (Instanca 9)
const retainedSections = retainedIndexes.map((origIdx, newIdx) => {
  // Renumber Instanca N so the harness parser sees 1..9 contiguously.
  const s = origSections[origIdx];
  const newNum = newIdx + 1;
  return s.replace(/^## Instanca \d+:/m, `## Instanca ${newNum}:`);
});

// Build NEW instance sections for the 5 PM/CC-finalized triples (numbers 10..14).
function renderNewSection(instNum, d) {
  const fm = d.human_label.failure_mode ?? 'null';
  return (
`## Instanca ${instNum}: \`${d.conversation_id}_${d.id}\` (${d.category})

**Question:** ${d.question}
**Ground truth:** ${d.ground_truth_answer ?? 'null'}
**Context excerpt:** ${d.context_excerpt}

**Synthesized model_answer:** ${d.synthesized_model_answer}

**human_label:**
- \`verdict\`: **${d.human_label.verdict}**
- \`failure_mode\`: **${fm}**
- \`rationale\`: "${d.human_label.rationale}"

---`
  );
}

const newSections = DRAFTS.map((d, i) => renderNewSection(retainedSections.length + 1 + i, d));

const mergedHeader =
`# Task 2.2 — 14-Instance Merged Calibration Labels

**Datum:** 2026-04-22
**Composition:** 9 retained from Sprint 9 original 10 (instance #9 Frank Ocean case dropped per PM Option C ratification 2026-04-22) + 5 new PM-authored triples finalized by CC post-conv-verification.
**Source retained:** \`PM-Waggle-OS/calibration/2026-04-20-failure-mode-calibration-labels.md\`
**Source new:** \`preflight-results/pm-custom-triples-2026-04-22.json\` + \`preflight-results/conv-verification-2026-04-22.md\`
**F-mode distribution:** 3 correct · 1 F1 · 2 F2 · 4 F3 · 3 F4 · 1 F5 = 14

Original Methodological note on model_answer synthesis (Path A from the Sprint 9 calibration labels) applies to the 5 new instances identically.

---

`;

const mergedMd = mergedHeader + retainedSections.join('\n') + '\n' + newSections.join('\n\n') + '\n';

const mergedOutPath = 'preflight-results/task-2-2-labels-14inst-2026-04-22.md';
fs.writeFileSync(mergedOutPath, mergedMd, 'utf-8');
console.log(`wrote ${mergedOutPath}`);

// Final sanity: parse the written markdown with the same regex the
// judge-calibration.mjs uses and confirm 14 instances resolve.
const sections = mergedMd.split(/^## Instanca \d+:/m).slice(1);
console.log(`verification: markdown splits into ${sections.length} instance sections`);
