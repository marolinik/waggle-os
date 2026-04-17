/**
 * PromptAssembler eval scenarios — see docs/specs/PROMPT-ASSEMBLER-V4.md §13.
 *
 * Each scenario is a mini-conversation:
 *  1. primingTurns run via Sonnet 4.6 to populate memory organically through
 *     the real save_memory / cognify path.
 *  2. memoryVerificationSubstrings confirm priming actually saved frames.
 *  3. testTurn runs under each of the 6 primary + 4 secondary conditions.
 *
 * Every priming user message includes at least one English save-trigger phrase
 * ("decided", "we'll use", "I prefer", "going with") so autoSaveFromExchange
 * fires even on Serbian-dominant content.
 */

import type { TaskShape } from '../../src/task-shape.js';

export type ScenarioLanguage = 'en' | 'sr';

export interface PrimingTurn {
  user: string;
}

export interface PromptAssemblerScenario {
  /** Stable scenario id (slug, no spaces) */
  name: string;
  /** Expected task shape — also used to verify the classifier landed correctly */
  shape: TaskShape['type'];
  /** Dominant language of the priming + test content */
  language: ScenarioLanguage;
  /** 2 priming turns run via Sonnet 4.6 */
  primingTurns: PrimingTurn[];
  /** The actual test question asked after priming */
  testTurn: { query: string };
  /** Substrings expected to appear in saved memory frames (verification gate) */
  memoryVerificationSubstrings: string[];
  /** Judge-rubric hints — what a good answer looks like */
  rubricHints: string;
}

export const SCENARIOS: PromptAssemblerScenario[] = [
  // ── Scenario 1 — Analysis/Decide, Serbian ──────────────────────────
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
          'We decided to go with on-prem deployment on our H200 x8 hardware. ' +
          'Suverenitet je core value proposition — klijenti ne žele hyperscaler cloud. ' +
          "We'll use our own stack for all three initial customers.",
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
          'New challenge. An energy client wants a 24-agent workflow with complex ' +
          'cross-agent dependencies — orchestration, approvals, compensation, ' +
          "rollback. We'll use one of the two methods for this.",
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
  {
    name: 'migration-plan',
    shape: 'plan-execute',
    language: 'en',
    primingTurns: [
      {
        user:
          'Our product has three tiers I want you to remember. Solo is free. ' +
          'Teams is $29/month per user. Business is $79/month. We decided Teams ' +
          'requires cloud webhook for billing — Stripe integration, still pending as M2-2.',
      },
      {
        user:
          'Technical architecture for tiers: Solo uses local SQLite per user — fully ' +
          'offline. Teams adds a shared workspace mind with team sync on top, but ' +
          "personal minds remain local. Data migration path: user's local SQLite " +
          'frames get replicated to the workspace mind on first Teams login.',
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
          'Critical clause we decided on: the KVARK license boundary must be ' +
          'non-negotiable in this deal. We license a deployment, not the source. ' +
          'That protects our IP — KVARK remains Egzakta property and we can use ' +
          'it for other clients. I want you to remember this as a hard constraint.',
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
          'Aktivan kontakt je Clipperton Finance, partner Dr. Nikolas Westphal. ' +
          'We decided to sign the NDA, pitch deck je poslat. Trenutno su u fazi ' +
          'dubinske analize, čekamo povratnu informaciju.',
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
  {
    name: 'floodtwin-summary',
    shape: 'draft',
    language: 'en',
    primingTurns: [
      {
        user:
          "We're drafting FloodTwin-WB — a concept for the EU Horizon 2026 call. " +
          'Flood digital twin for the Western Balkans. Deadline is April 2026.',
      },
      {
        user:
          'Scope we decided on: Serbia plus five Western Balkan countries. Existing ' +
          "hydro models are siloed per country — we'll use a cross-border digital " +
          'twin with real-time sensor fusion to unify them. Consortium partner ' +
          "we're going with: Mistral AI, because the sovereignty narrative " +
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
      'no scaffold at any tier. If condition C shows a scaffold in debug, ' +
      "it's a classification bug.",
  },
];
