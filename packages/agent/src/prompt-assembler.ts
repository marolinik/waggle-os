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

export interface AssembleOptions {
  taskShape?: TaskShape;
  tierOverride?: ModelTier;
  /** Max system-prompt chars before truncation kicks in. Default 32_000. */
  maxSystemChars?: number;
  /** Minimum task-shape confidence for scaffold emission. Default 0.3. */
  confidenceThreshold?: number;
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
 * Scaffold matrix per §9 of the PromptAssembler v4 brief.
 *
 * Rule: apply only when tier !== 'frontier' AND taskShape.confidence ≥ threshold.
 * `draft` and `mixed` never get a scaffold at any tier.
 */
const SCAFFOLD_MAP: Record<TaskShapeType, Record<ModelTier, string | null>> = {
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
): string | null {
  if (!taskShape) return null;
  if (taskShape.confidence < confidenceThreshold) return null;
  if (tier === 'frontier') return null;
  return SCAFFOLD_MAP[taskShape.type][tier];
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
    const scaffold = selectScaffold(tier, taskShape, confThreshold);
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

    return {
      system,
      userPrefix: '',
      responseScaffold: scaffold,
      debug: {
        tier,
        taskShape: taskShape?.type ?? null,
        taskShapeConfidence: taskShape?.confidence ?? 0,
        scaffoldApplied: scaffold !== null,
        sectionsIncluded,
        framesUsed,
        totalChars: system.length,
      },
    };
  }
}
