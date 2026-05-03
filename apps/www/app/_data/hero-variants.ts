/**
 * 5-variant Hero copy locked per v3.2 (PM ratify 2026-05-03).
 *
 * Variant A (Marcus default) is split-color: `headlineLead` renders in cool
 * light, `headlineEmphasis` renders in honey amber. Variants B-E use single-
 * sentence headlines (`headlineEmphasis` omitted).
 */

export type HeroVariantId = 'A' | 'B' | 'C' | 'D' | 'E';

export interface HeroVariant {
  readonly id: HeroVariantId;
  readonly persona: string;
  readonly eyebrow: string;
  readonly headlineLead: string;
  readonly headlineEmphasis?: string;
  readonly subhead: string;
  readonly body: string;
}

export const heroVariants: Readonly<Record<HeroVariantId, HeroVariant>> = Object.freeze({
  A: {
    id: 'A',
    persona: 'Marcus',
    eyebrow: 'AI workspace with memory',
    headlineLead: "Your AI doesn't reset.",
    headlineEmphasis: "Your work doesn't either.",
    subhead:
      'Persistent memory across every LLM you use. Claude, GPT, Qwen, Gemini, your local model — all drawing from the same locally-stored knowledge graph.',
    body:
      'Stop the paste-context-fatigue cycle. Your context lives once, persists across models, and compounds with every session you finish.',
  },
  B: {
    id: 'B',
    persona: 'Klaudia',
    eyebrow: 'AI for regulated industries, finally',
    headlineLead: 'AI workspace that satisfies your CISO.',
    subhead:
      "Local-first by default, EU AI Act audit reports built into the workflow, backed by Egzakta Group's regulated-industries practice.",
    body:
      'Your CISO blocked ChatGPT for good reasons. Waggle keeps the work on your machine and generates Article 12 audit reports automatically — no separate compliance workstream.',
  },
  C: {
    id: 'C',
    persona: 'Yuki',
    eyebrow: 'Shared context for moving teams',
    headlineLead: "Your team's memory, before someone has to write it down.",
    subhead:
      'Notion wikis go stale. Slack search is hostile. Waggle captures the context as you work — no extra step.',
    body:
      'Onboarding an 8-person team gets shorter when context auto-organizes from work activity, not from someone remembering to write the wiki page.',
  },
  D: {
    id: 'D',
    persona: 'Sasha',
    eyebrow: 'Memory substrate for any agent',
    headlineLead: "Memory layer that doesn't lock you to a vendor.",
    subhead:
      "Apache 2.0, MCP-native, runs locally. The substrate plugs into whatever agent harness you're already running.",
    body:
      'Mem0 is cloud-only. LangMem is toy-tier. Letta is agent-centric. Waggle is the substrate — fork the source, audit the graph, deploy on your infra.',
  },
  E: {
    id: 'E',
    persona: 'Petra',
    eyebrow: 'AI for confidential work',
    headlineLead: 'AI that never sees your client matter.',
    subhead:
      'Local-first by design, bar association compatible, full audit log per matter — work stays on your machine.',
    body:
      "ChatGPT-as-malpractice-risk has stalled adoption in legal. Waggle's hive lives on the device; every recall carries provenance, every matter has a trail.",
  },
});
