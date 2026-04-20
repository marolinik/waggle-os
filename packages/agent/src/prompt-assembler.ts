/**
 * PromptAssembler — sixth layer between memory retrieval and the LLM call.
 *
 * Produces a tier-adaptive, typed, scaffolded prompt. Wraps the existing
 * buildSystemPrompt path rather than replacing it. Feature-flagged
 * (WAGGLE_PROMPT_ASSEMBLER=1), default off.
 *
 * Tier drives:
 *  - frame count (top 3 / 6 / 10 for small / mid / frontier)
 *  - response scaffold (tier != frontier AND task shape confidence ≥ 0.3)
 *
 * Truncation policy: if the assembled system prompt exceeds `maxSystemChars`,
 * trim Recent changes → Active work → State, in that order. Identity, Persona,
 * Personal preferences, and Response format are never trimmed.
 */

import type { MemoryFrame, Importance } from '@waggle/core';
import type { AgentPersona } from './personas.js';
import type { ModelTier } from './model-tier.js';
import { detectTaskShape, type TaskShape, type TaskShapeType } from './task-shape.js';
import type { ContextFrames } from './orchestrator.js';
import { logTurnEvent } from './turn-context.js';

// ── Types ────────────────────────────────────────────────────────────

export interface RecalledMemory {
  workspace: MemoryFrame[];
  personal: MemoryFrame[];
  /** False if the injection scanner blocked the recall — assembler must ignore. */
  scanSafe: boolean;
}

export interface AssembleInput {
  corePrompt: string;
  persona: AgentPersona | null;
  context: ContextFrames;
  recalled: RecalledMemory;
  query: string;
  tier: ModelTier;
  taskShape?: TaskShape;
  workspaceTone?: string;
}

export interface AssembledPromptDebug {
  tier: ModelTier;
  taskShape: TaskShapeType | null;
  taskShapeConfidence: number;
  scaffoldApplied: boolean;
  /** v5: which scaffold style was used (compression = v4 default, expansion = v5 opt-in). */
  scaffoldStyle: ScaffoldStyle;
  sectionsIncluded: string[];
  framesUsed: number;
  totalChars: number;
}

export interface AssembledPrompt {
  system: string;
  userPrefix: string;
  responseScaffold: string | null;
  debug: AssembledPromptDebug;
}

/**
 * Scaffold style — v5 addition.
 *
 * v4's scaffolds are compression-style: "say less, in shorter form." v5 adds
 * expansion-style scaffolds that give the model explicit multi-part templates
 * to fill. The hypothesis: dense instruction-tuned families (Gemma) benefit
 * from expansion, while reasoning-capable families (Claude, Qwen thinking
 * variants) benefit from compression. See v5 brief §0 and §7.3.
 */
export type ScaffoldStyle = 'compression' | 'expansion';

export interface AssembleOptions {
  taskShape?: TaskShape;
  tierOverride?: ModelTier;
  /** Max system-prompt chars before truncation kicks in. Default 32_000. */
  maxSystemChars?: number;
  /** Minimum task-shape confidence for scaffold emission. Default 0.3. */
  confidenceThreshold?: number;
  /**
   * v5: scaffold variant. Default 'compression' — preserves v4 behavior
   * byte-identically when unset or explicitly 'compression'.
   */
  scaffoldStyle?: ScaffoldStyle;
  /** H-AUDIT-1: per-turn trace ID (UUID v4). Logs prompt-assembly stage. */
  turnId?: string;
}

// ── Constants ────────────────────────────────────────────────────────

const DEFAULT_MAX_CHARS = 32_000;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.3;

/** Frames retained per tier — assembler caps top-N after upstream retrieval. */
const FRAME_LIMITS: Record<ModelTier, number> = {
  small: 3,
  mid: 6,
  frontier: 10,
};

/** Numeric weight for frame ranking — higher = more important. */
const IMPORTANCE_WEIGHT: Record<Importance, number> = {
  critical: 4,
  important: 3,
  normal: 2,
  temporary: 1,
  deprecated: 0,
};

/**
 * COMPRESSION scaffold matrix — v4 default.
 *
 * Rule: apply only when tier !== 'frontier' AND taskShape.confidence ≥ threshold.
 * `draft` and `mixed` never get a scaffold at any tier.
 *
 * Text preserved byte-for-byte from v4 for parity. See PromptAssembler v4
 * brief §9 and v5 brief §9 for rationale.
 */
const COMPRESSION_SCAFFOLDS: Record<TaskShapeType, Record<ModelTier, string | null>> = {
  research: {
    small: 'Cite the frame. Quote the relevant fragment. Answer directly.',
    mid: 'Cite source. Answer.',
    frontier: null,
  },
  compare: {
    small: 'State the assumption. List the trade-offs. Give the recommendation.',
    mid: 'Briefly state assumption, then recommendation.',
    frontier: null,
  },
  decide: {
    small: 'State the assumption. List the trade-offs. Give the recommendation.',
    mid: 'Briefly state assumption, then recommendation.',
    frontier: null,
  },
  review: {
    small: 'State the assumption. List the trade-offs. Give the recommendation.',
    mid: 'Briefly state assumption, then recommendation.',
    frontier: null,
  },
  'plan-execute': {
    small: 'Confirm inputs. State plan in one sentence. Execute. Report result.',
    mid: 'State plan. Execute. Report.',
    frontier: null,
  },
  draft: { small: null, mid: null, frontier: null },
  mixed: { small: null, mid: null, frontier: null },
};

/**
 * EXPANSION scaffold matrix — v5 addition.
 *
 * Design principle: replace "say less" with "say more, in named sections."
 * Dense instruction-tuned models (Gemma family) appear to be hurt by
 * compression-style scaffolds because compression fights their natural
 * elaboration. Expansion gives them more structure to fill.
 *
 * Frontier tier deliberately yields `null` for every shape — v4 showed
 * F > E with compression scaffolds (which also produce `null` at frontier,
 * since the assembler's frontier treatment is "no response scaffold, but
 * still the typed layered prompt"). Don't risk that replication by
 * applying expansion to frontier models.
 *
 * See PromptAssembler v5 brief §7.3.
 */
const EXPANSION_SCAFFOLDS: Record<TaskShapeType, Record<ModelTier, string | null>> = {
  research: {
    small:
      'Answer in three parts:\n' +
      '1. Direct answer — one sentence stating the answer without qualification.\n' +
      '2. Source — identify the memory frame and quote the relevant fragment verbatim.\n' +
      '3. Context — briefly describe surrounding facts or decisions that situate this answer.',
    mid: 'Direct answer first, then source quote, then one-sentence context.',
    frontier: null,
  },
  compare: {
    small:
      'Structure your response in four parts:\n' +
      "1. Assumption — state the key assumption you're reasoning under.\n" +
      '2. Factors — walk through each relevant factor in turn. For each: name it, ' +
      'explain how it specifically applies to this case, and weigh its importance.\n' +
      '3. Trade-offs — identify the main tension between the options.\n' +
      '4. Recommendation — give a clear recommendation with a brief justification, ' +
      'and state your confidence (low/medium/high).',
    mid:
      'Organize your response as: assumption, factors analyzed in turn, main trade-off, ' +
      'recommendation with confidence level.',
    frontier: null,
  },
  decide: {
    small:
      'Structure your response in four parts:\n' +
      "1. Assumption — state the key assumption you're reasoning under.\n" +
      '2. Factors — walk through each relevant factor in turn. For each: name it, ' +
      'explain how it specifically applies to this case, and weigh its importance.\n' +
      '3. Trade-offs — identify the main tension between the options.\n' +
      '4. Recommendation — give a clear recommendation with a brief justification, ' +
      'and state your confidence (low/medium/high).',
    mid:
      'Organize your response as: assumption, factors analyzed in turn, main trade-off, ' +
      'recommendation with confidence level.',
    frontier: null,
  },
  review: {
    small:
      'Structure your response in four parts:\n' +
      "1. Assumption — state the key assumption you're reasoning under.\n" +
      '2. Factors — walk through each relevant factor in turn. For each: name it, ' +
      'explain how it specifically applies to this case, and weigh its importance.\n' +
      '3. Trade-offs — identify the main tension between the options.\n' +
      '4. Recommendation — give a clear recommendation with a brief justification, ' +
      'and state your confidence (low/medium/high).',
    mid:
      'Organize your response as: assumption, factors analyzed in turn, main trade-off, ' +
      'recommendation with confidence level.',
    frontier: null,
  },
  'plan-execute': {
    small:
      'Organize your response as named phases. For each phase:\n' +
      '- Goal — what this phase achieves.\n' +
      '- Steps — 2–4 concrete steps.\n' +
      '- Dependencies — what must be true before this phase starts.\n' +
      '- Blockers — anything currently unresolved.\n\n' +
      'Conclude with: (a) a timeline estimate, and (b) a summary of the critical-path risk.',
    mid:
      'Plan as named phases. Each phase: goal, steps, dependencies, blockers. ' +
      'Close with timeline and critical-path risk.',
    frontier: null,
  },
  draft: { small: null, mid: null, frontier: null },
  mixed: { small: null, mid: null, frontier: null },
};

/** Section names, in truncation-priority order (first to trim → last to trim). */
const TRUNCATION_ORDER = ['Recent changes', 'Active work', 'State'] as const;

// ── Helpers ──────────────────────────────────────────────────────────

function selectFrames(frames: ReadonlyArray<MemoryFrame>, limit: number): MemoryFrame[] {
  const seen = new Set<number>();
  const deduped: MemoryFrame[] = [];
  for (const f of frames) {
    if (!seen.has(f.id)) {
      seen.add(f.id);
      deduped.push(f);
    }
  }
  deduped.sort((a, b) => {
    const weightDelta = IMPORTANCE_WEIGHT[b.importance] - IMPORTANCE_WEIGHT[a.importance];
    if (weightDelta !== 0) return weightDelta;
    return b.id - a.id;
  });
  return deduped.slice(0, limit);
}

function selectScaffold(
  tier: ModelTier,
  taskShape: TaskShape | undefined,
  confidenceThreshold: number,
  style: ScaffoldStyle,
): string | null {
  if (!taskShape) return null;
  if (taskShape.confidence < confidenceThreshold) return null;
  // Frontier short-circuit — belt-and-suspenders with the maps themselves
  // (both COMPRESSION and EXPANSION map frontier to null for every shape).
  // See v5 brief §7.3.
  if (tier === 'frontier') return null;
  const map = style === 'expansion' ? EXPANSION_SCAFFOLDS : COMPRESSION_SCAFFOLDS;
  return map[taskShape.type][tier];
}

function renderPersona(persona: AgentPersona): string {
  const lines = [`## Persona: ${persona.name}`];
  if (persona.tagline) lines.push(persona.tagline);
  lines.push(persona.description);
  return lines.join('\n');
}

function renderFrames(frames: MemoryFrame[]): string {
  return frames.map(f => `- [${f.importance}] ${f.content}`).join('\n');
}

function renderActiveWork(items: ContextFrames['activeWork']): string {
  const sorted = [...items].sort((a, b) => b.priority - a.priority);
  return sorted.map(w => `- [${w.category}] ${w.content}`).join('\n');
}

function renderPreferences(prefs: string[]): string {
  return prefs.map(p => `- ${p}`).join('\n');
}

// ── PromptAssembler ──────────────────────────────────────────────────

interface Section {
  name: string;
  body: string;
  /** Frames contributed (for debug.framesUsed accounting on trim). */
  frameCount: number;
}

export class PromptAssembler {
  assemble(input: AssembleInput, opts: AssembleOptions = {}): AssembledPrompt {
    const maxChars = opts.maxSystemChars ?? DEFAULT_MAX_CHARS;
    const confThreshold = opts.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
    const tier = opts.tierOverride ?? input.tier;
    // v5 brief §7.2: default 'compression' preserves v4 behavior byte-identically.
    const scaffoldStyle: ScaffoldStyle = opts.scaffoldStyle ?? 'compression';
    // Brief §10: derive task shape from query when caller hasn't supplied one.
    const taskShape = opts.taskShape ?? input.taskShape ?? detectTaskShape(input.query);
    const frameLimit = FRAME_LIMITS[tier];

    const sections: Section[] = [];

    // ── Identity (from corePrompt; always first; never trimmed) ──
    const identityBody = input.corePrompt.trim();
    if (identityBody) {
      const prefixed = identityBody.startsWith('# Identity')
        ? identityBody
        : `# Identity\n${identityBody}`;
      sections.push({ name: 'Identity', body: prefixed, frameCount: 0 });
    }

    // ── Persona (never trimmed) ──
    if (input.persona) {
      sections.push({ name: 'Persona', body: renderPersona(input.persona), frameCount: 0 });
    }

    // ── State (I-frames) — trimmable ──
    const stateFrames = selectFrames(input.context.stateFrames, frameLimit);
    if (stateFrames.length > 0) {
      sections.push({
        name: 'State',
        body: `# State\n${renderFrames(stateFrames)}`,
        frameCount: stateFrames.length,
      });
    }

    // ── Recent changes (P/B-frames) — trimmable first ──
    const changeFrames = selectFrames(input.context.recentChanges, frameLimit);
    if (changeFrames.length > 0) {
      sections.push({
        name: 'Recent changes',
        body: `# Recent changes\n${renderFrames(changeFrames)}`,
        frameCount: changeFrames.length,
      });
    }

    // ── Active work (awareness items) — trimmable ──
    if (input.context.activeWork.length > 0) {
      sections.push({
        name: 'Active work',
        body: `# Active work\n${renderActiveWork(input.context.activeWork)}`,
        frameCount: 0,
      });
    }

    // ── Personal preferences (never trimmed) ──
    if (input.context.personalPreferences.length > 0) {
      sections.push({
        name: 'Personal preferences',
        body: `# Personal preferences\n${renderPreferences(input.context.personalPreferences)}`,
        frameCount: 0,
      });
    }

    // ── Recalled memory — only when the upstream injection scan passed ──
    // Brief §8: recallMemory already scans; assembler must not re-scan, and
    // must ignore recall entirely when scanSafe is false.
    const recalledFrames: MemoryFrame[] = [];
    if (input.recalled.scanSafe) {
      recalledFrames.push(
        ...selectFrames(input.recalled.workspace, frameLimit),
        ...selectFrames(input.recalled.personal, frameLimit),
      );
    }
    if (recalledFrames.length > 0) {
      sections.push({
        name: 'Recalled memory',
        body: `# Recalled memory\n${renderFrames(recalledFrames)}`,
        frameCount: recalledFrames.length,
      });
    }

    // ── Response format (scaffold) — gated ──
    const scaffold = selectScaffold(tier, taskShape, confThreshold, scaffoldStyle);
    if (scaffold) {
      sections.push({
        name: 'Response format',
        body: `# Response format\n${scaffold}`,
        frameCount: 0,
      });
    }

    // ── Compose + truncate ──
    const join = (s: Section[]): string => s.map(x => x.body).join('\n\n');
    let system = join(sections);

    if (system.length > maxChars) {
      for (const trimName of TRUNCATION_ORDER) {
        if (system.length <= maxChars) break;
        const idx = sections.findIndex(s => s.name === trimName);
        if (idx < 0) continue;
        sections.splice(idx, 1);
        system = join(sections);
      }
    }

    const sectionsIncluded = sections.map(s => s.name);
    const framesUsed = sections.reduce((sum, s) => sum + s.frameCount, 0);

    // H-AUDIT-1: log assembled-prompt shape. Cheap, high-signal — ties the
    // turnId to the exact prompt shape that went to the LLM.
    logTurnEvent(opts.turnId, {
      stage: 'prompt-assembler.assemble',
      tier,
      taskShape: taskShape?.type ?? null,
      scaffoldApplied: scaffold !== null,
      scaffoldStyle,
      sectionsIncluded,
      framesUsed,
      totalChars: system.length,
    });

    return {
      system,
      userPrefix: '',
      responseScaffold: scaffold,
      debug: {
        tier,
        taskShape: taskShape?.type ?? null,
        taskShapeConfidence: taskShape?.confidence ?? 0,
        scaffoldApplied: scaffold !== null,
        scaffoldStyle,
        sectionsIncluded,
        framesUsed,
        totalChars: system.length,
      },
    };
  }
}
