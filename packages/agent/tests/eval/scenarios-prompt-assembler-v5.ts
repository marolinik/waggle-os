/**
 * PromptAssembler v5 eval scenarios — see docs/specs/PROMPT-ASSEMBLER-V4.md
 * and the v5 brief §11.4.
 *
 * v5 changes relative to v4 (scenarios-prompt-assembler.ts): ONLY the
 * primingTurns are revised. Names, shapes, languages, test turns,
 * memoryVerificationSubstrings, and rubricHints are preserved verbatim so
 * v4 and v5 eval results are directly comparable.
 *
 * Root cause of v4's priming misses: autoSaveFromExchange's decision-
 * extractor pulls the sentence matching a decision-trigger regex
 * ("we decided", "we'll use", "going with"). Facts in adjacent sentences
 * did not save. v5 co-locates each target fact with its trigger in the
 * SAME sentence.
 */

// v5 re-uses v4's type contracts — no shape change, just revised primings.
export type { ScenarioLanguage, PrimingTurn, PromptAssemblerScenario } from './scenarios-prompt-assembler.js';
import type { PromptAssemblerScenario } from './scenarios-prompt-assembler.js';

export const SCENARIOS_V5: PromptAssemblerScenario[] = [
  // ── Scenario 1 — Analysis/Decide, Serbian ──────────────────────────
  // v5 note: v4 already passed all three substrings. Priming minor-
  // strengthened only — "for all three initial customers" + "Data
  // residency is the non-negotiable driver" pulls the three signals
  // (on-prem, H200, data residency) together.
  {
    name: 'sovereignty-deployment',
    shape: 'decide',
    language: 'sr',
    primingTurns: [
      {
        user:
          'Imamo novi projekat. Tri početna enterprise klijenta — banke i telco iz ' +
          'regiona. Svi imaju regulatorne zahteve za data residency u Srbiji, to je ' +
          'tvrdo ograničenje.',
      },
      {
        user:
          'We decided to go with on-prem deployment on our H200 x8 hardware for all ' +
          'three initial customers. Suverenitet je core value proposition — klijenti ' +
          'ne žele hyperscaler cloud. Data residency is the non-negotiable driver.',
      },
    ],
    testTurn: {
      query:
        'Sumiraj naš deployment pristup za prva tri klijenta i obrazloži zašto smo tako odlučili.',
    },
    memoryVerificationSubstrings: ['data residency', 'on-prem', 'H200'],
    rubricHints:
      'Should cite on-prem decision, reference data-residency constraints, mention ' +
      'sovereignty positioning, acknowledge H200 hardware. Serbian response expected. ' +
      'Classifier confidence likely low on Serbian query — scaffold likely not applied. ' +
      "That's acceptable.",
  },

  // ── Scenario 2 — Compare, English ──────────────────────────────────
  // v5 fix: "24-agent" wasn't saved in v4 because the MECE decision
  // frame was about simple workflows, not the 24-agent case. Second
  // turn now contains "I decided we need to pick between MECE or BPMN
  // specifically for this 24-agent case" — one sentence, decision
  // trigger + the 24-agent substring co-located.
  {
    name: 'decomposition-choice',
    shape: 'compare',
    language: 'en',
    primingTurns: [
      {
        user:
          'I ran a decomposition experiment last week. Finding: MECE is the ' +
          'cost-efficient winner — same IC% as BPMN at 2-4x lower token cost. ' +
          "BPMN wins on gate complexity: 14 LLM calls vs MECE's 8 for equivalent " +
          'gate logic. I decided MECE is our default for simple workflows.',
      },
      {
        user:
          'Now a new challenge. An energy client wants a 24-agent workflow with ' +
          'complex cross-agent dependencies throughout: orchestration, approvals, ' +
          'compensation, rollback. I decided we need to pick between MECE or BPMN ' +
          'specifically for this 24-agent case — help me choose.',
      },
    ],
    testTurn: {
      query:
        'Compare MECE vs BPMN for this 24-agent workflow. Which method should we use and why?',
    },
    memoryVerificationSubstrings: ['MECE', 'BPMN', '24-agent'],
    rubricHints:
      'Should recommend BPMN for the complex gates despite higher cost; acknowledge ' +
      'MECE as simpler-default; state trade-off explicitly. Expected scaffold: ' +
      'analysis (assumption → trade-offs → recommendation).',
  },

  // ── Scenario 3 — Plan-execute, English ─────────────────────────────
  // v5 fix: v4 saved only 2 frames; "$29" and "Stripe" and "workspace
  // mind" didn't land. Split into 3 priming turns, each landing a
  // decision + fact pair in the same sentence. First turn: pricing
  // numbers. Second turn: Stripe/M2-2 blocker. Third turn: architecture
  // + migration path.
  {
    name: 'migration-plan',
    shape: 'plan-execute',
    language: 'en',
    primingTurns: [
      {
        user:
          'Our pricing model is decided. I want you to remember these exact figures: ' +
          'Solo is free, Teams is $29 per user per month, Business is $79 per user per ' +
          'month. These numbers matter for any migration math.',
      },
      {
        user:
          'Technical dependency: Teams tier requires Stripe integration for billing ' +
          '— the cloud webhook, pending as M2-2 in our sprint. We decided Teams cannot ' +
          'ship to customers until Stripe is wired.',
      },
      {
        user:
          'Data architecture decision: Solo uses local SQLite per user, Teams adds a ' +
          'shared workspace mind on top with team sync. Personal minds stay local. ' +
          "Migration path we decided: user's local SQLite frames replicate to the " +
          'workspace mind on first Teams login.',
      },
    ],
    testTurn: {
      query:
        'Create a plan to migrate a 10-person design firm from Waggle Solo to Waggle Teams. ' +
        'Break it down into concrete steps including any blockers.',
    },
    memoryVerificationSubstrings: ['$29', 'Teams', 'Stripe', 'workspace mind'],
    rubricHints:
      'Numbered plan ~5-7 steps, Stripe/M2-2 as blocker, data migration ' +
      '(local → workspace mind), total cost ($290/mo). Expected scaffold: ' +
      'execution (confirm inputs → plan → execute → report).',
  },

  // ── Scenario 4 — Research, English ─────────────────────────────────
  // v5 fix: v4 missed "license boundary" and "non-negotiable" as
  // substrings. Second turn now includes "the KVARK license boundary
  // in this deal is deployment-only" and "We decided the license
  // boundary is a hard non-negotiable constraint" — both phrases
  // present in decision sentences.
  {
    name: 'license-boundary',
    shape: 'research',
    language: 'en',
    primingTurns: [
      {
        user:
          "We're preparing a proposal for Yettel Serbia — AI and MLOps platform " +
          'based on our KVARK core plus custom connectors for their telco systems.',
      },
      {
        user:
          'Critical decision — and this is non-negotiable: the KVARK license boundary ' +
          'in this deal is deployment-only, we do not license source code. KVARK remains ' +
          'Egzakta property. We decided the license boundary is a hard non-negotiable ' +
          'constraint, because it protects our IP so we can reuse KVARK for other clients.',
      },
    ],
    testTurn: {
      query:
        'What is the KVARK license boundary in the Yettel proposal, and why is it non-negotiable?',
    },
    memoryVerificationSubstrings: ['KVARK', 'license boundary', 'non-negotiable'],
    rubricHints:
      'Cite the specific fact (boundary non-negotiable) and the reason ' +
      '(IP separation, KVARK stays Egzakta). Direct answer, no hedging. ' +
      'Expected scaffold: retrieval (cite frame → quote → answer).',
  },

  // ── Scenario 5 — Research, Serbian ─────────────────────────────────
  // v5 fix: "Clipperton" missed in v4 — the NDA-signing decision frame
  // cut off before the name. Second turn restructured so the English
  // decision trigger "we decided to move forward with Clipperton
  // Finance" appears in the same sentence as the name.
  {
    name: 'investor-status',
    shape: 'research',
    language: 'sr',
    primingTurns: [
      {
        user:
          'Radimo rundu investicije. Cilj nam je EUR 20M, pre-money procena između ' +
          '70 i 80 miliona evra.',
      },
      {
        user:
          'Active investor contact: we decided to move forward with Clipperton ' +
          'Finance, partner Dr. Nikolas Westphal. NDA is signed, pitch deck je ' +
          'poslat. Trenutno su u fazi dubinske analize, čekamo povratnu ' +
          'informaciju sa Clipperton strane.',
      },
    ],
    testTurn: {
      query: 'Ko su aktivni investitori za našu rundu i u kojoj fazi smo sa njima?',
    },
    memoryVerificationSubstrings: ['Clipperton', 'Westphal', '20M'],
    rubricHints:
      'Should name Clipperton Finance and Dr. Nikolas Westphal, state status ' +
      '(NDA signed, deck sent, due diligence). Serbian response. Low classifier ' +
      'confidence likely → no scaffold. Tests whether mid-Serbian-context ' +
      'bilingual priming saved the facts.',
  },

  // ── Scenario 6 — Draft, English ────────────────────────────────────
  // v5 fix: "Mistral" missed in v4 — consortium-partner mention was
  // narrative, not a decision. Second turn now contains "Decision on
  // consortium partner: we're going with Mistral AI" with both
  // "decision" and "going with" in the same sentence as "Mistral".
  {
    name: 'floodtwin-summary',
    shape: 'draft',
    language: 'en',
    primingTurns: [
      {
        user:
          "We're drafting FloodTwin-WB — a concept for the EU Horizon 2026 call. " +
          'Flood digital twin for the Western Balkans. Deadline April 2026.',
      },
      {
        user:
          'Scope we decided on: Serbia plus five Western Balkan countries. Existing ' +
          "hydro models are siloed per country. We'll use a cross-border digital twin " +
          'with real-time sensor fusion to unify them. Decision on consortium ' +
          "partner: we're going with Mistral AI because the sovereignty narrative " +
          'strengthens the EU angle.',
      },
    ],
    testTurn: {
      query: 'Draft a 150-word executive summary for the FloodTwin-WB proposal.',
    },
    memoryVerificationSubstrings: ['Western Balkans', 'Mistral', 'cross-border'],
    rubricHints:
      'Creative task — judge on coherence and inclusion of key elements ' +
      '(Western Balkans, Mistral, cross-border unification, EU sovereignty). ' +
      "NO scaffold should apply — `draft` shape maps to creation category, " +
      'no scaffold at any tier. If an expansion-style C2 condition emits a ' +
      "scaffold here, it's a classification bug.",
  },
];
