/**
 * Task Shape Classifier — detects the structural shape of a user's task
 * to inform workflow composition and execution-mode selection.
 *
 * Pure heuristic analysis. No LLM calls. Deterministic.
 */

// ── Types ────────────────────────────────────────────────────────────

export type TaskShapeType =
  | 'research'
  | 'compare'
  | 'draft'
  | 'review'
  | 'decide'
  | 'plan-execute'
  | 'mixed';

export interface TaskShapeSignal {
  /** Which shape this signal points to */
  shape: TaskShapeType;
  /** The keyword or pattern that matched */
  match: string;
  /** Signal strength (1 = keyword, 2 = strong phrase) */
  weight: number;
}

export interface ComponentPhase {
  shape: Exclude<TaskShapeType, 'mixed'>;
  /** The portion of text that triggered this phase */
  trigger: string;
}

export interface TaskShape {
  /** Primary detected shape */
  type: TaskShapeType;
  /** Confidence 0-1 */
  confidence: number;
  /** Raw signals that contributed to detection */
  signals: TaskShapeSignal[];
  /** For mixed tasks: the component phases in order */
  phases?: ComponentPhase[];
  /** Estimated complexity: simple (1 step), moderate (2-3 steps), complex (4+ steps) */
  complexity: 'simple' | 'moderate' | 'complex';
}

// ── Pattern definitions ──────────────────────────────────────────────

interface ShapePattern {
  shape: Exclude<TaskShapeType, 'mixed'>;
  /** Strong phrases (weight 2) */
  phrases: RegExp[];
  /** Single keywords (weight 1) */
  keywords: RegExp[];
}

const SHAPE_PATTERNS: ShapePattern[] = [
  {
    shape: 'research',
    phrases: [
      /\bfind out\b/i, /\blook into\b/i, /\blearn about\b/i,
      /\bgather information\b/i, /\bwhat (is|are|do|does|did)\b/i,
      /\bdig into\b/i, /\bexplore\b/i,
    ],
    keywords: [
      /\bresearch\b/i, /\binvestigat/i, /\banalyz/i, /\bstudy\b/i,
      /\bsurvey\b/i, /\bexamin/i,
    ],
  },
  {
    shape: 'compare',
    phrases: [
      /\bcompare\b.*\b(to|with|vs|versus|against)\b/i,
      /\bdifference(s)?\s+between\b/i, /\bpros\s+and\s+cons\b/i,
      /\btradeoffs?\b/i, /\bside[\s-]by[\s-]side\b/i,
    ],
    keywords: [
      /\bcompare\b/i, /\bversus\b/i, /\bvs\.?\b/i, /\bcontrast\b/i,
      /\bbenchmark\b/i,
    ],
  },
  {
    shape: 'draft',
    phrases: [
      /\bwrite\s+(me\s+)?a\b/i, /\bdraft\s+(me\s+)?a\b/i,
      /\bcreate\s+(me\s+)?a\b/i, /\bprepare\s+(me\s+)?a\b/i,
      /\bgenerate\s+(me\s+)?a\b/i, /\bcompose\s+(me\s+)?a\b/i,
    ],
    keywords: [
      /\bdraft\b/i, /\bwrite\b/i, /\bcompos/i, /\bauthor\b/i,
      /\bredact\b/i,
    ],
  },
  {
    shape: 'review',
    phrases: [
      /\breview\s+(this|the|my)\b/i, /\bcheck\s+(this|the|my)\b/i,
      /\bgive\s+(me\s+)?feedback\b/i, /\bidentify\s+(issues|problems|weaknesses)\b/i,
      /\bfind\s+(issues|problems|bugs|errors)\b/i,
    ],
    keywords: [
      /\breview\b/i, /\bcritique\b/i, /\bevaluat/i, /\bassess\b/i,
      /\baudit\b/i, /\bfeedback\b/i,
    ],
  },
  {
    shape: 'decide',
    phrases: [
      /\bshould\s+(I|we)\b/i, /\bwhich\s+(option|one|approach)\b/i,
      /\bwhat\s+(would you|do you)\s+recommend\b/i,
      /\bhelp\s+(me\s+)?(decide|choose)\b/i,
      /\bmake\s+a\s+(decision|choice)\b/i,
    ],
    keywords: [
      /\bdecide\b/i, /\brecommend/i, /\badvise\b/i, /\bchoose\b/i,
      /\bpick\b/i,
    ],
  },
  {
    shape: 'plan-execute',
    phrases: [
      /\bbreak\s+(this\s+)?(down|into)\b/i, /\bsteps?\s+to\b/i,
      /\bhow\s+(to|do I|should I)\s+(implement|build|create|set up)\b/i,
      /\bcreate\s+a\s+(plan|roadmap|strategy)\b/i,
      /\borganize\s+(this|the|my)\b/i,
    ],
    keywords: [
      /\bplan\b/i, /\broadmap\b/i, /\bphases?\b/i, /\bmilestone/i,
      /\bstrateg/i, /\bimplement/i,
    ],
  },
];

// ── Compound connectors that suggest multi-phase tasks ───────────────

const COMPOUND_PATTERNS = [
  /\bthen\b/i, /\bafter\s+that\b/i, /\bnext\b/i,
  /\bfirst\b.*\bthen\b/i, /\band\s+then\b/i,
  /,\s*(then|and|also)\b/i,
];

// ── Detection ────────────────────────────────────────────────────────

export function detectTaskShape(message: string): TaskShape {
  const signals: TaskShapeSignal[] = [];

  // Collect all signals
  for (const pattern of SHAPE_PATTERNS) {
    for (const phrase of pattern.phrases) {
      const match = message.match(phrase);
      if (match) {
        signals.push({ shape: pattern.shape, match: match[0], weight: 2 });
      }
    }
    for (const keyword of pattern.keywords) {
      const match = message.match(keyword);
      if (match) {
        signals.push({ shape: pattern.shape, match: match[0], weight: 1 });
      }
    }
  }

  // Score each shape
  const scores = new Map<Exclude<TaskShapeType, 'mixed'>, number>();
  for (const signal of signals) {
    if (signal.shape !== 'mixed') {
      scores.set(signal.shape, (scores.get(signal.shape) ?? 0) + signal.weight);
    }
  }

  // Determine if mixed (multiple distinct shapes detected)
  const activeShapes = [...scores.entries()]
    .filter(([, score]) => score >= 2)
    .sort((a, b) => b[1] - a[1]);

  const hasCompoundStructure = COMPOUND_PATTERNS.some(p => p.test(message));
  const isMixed = activeShapes.length >= 2 && (hasCompoundStructure || activeShapes.length >= 3);

  // Build result
  if (isMixed) {
    const phases = extractPhases(message, activeShapes.map(([shape]) => shape));
    const totalScore = activeShapes.reduce((sum, [, s]) => sum + s, 0);
    const maxPossible = signals.length > 0 ? signals.reduce((sum, s) => sum + s.weight, 0) : 1;

    return {
      type: 'mixed',
      confidence: Math.min(totalScore / maxPossible, 0.95),
      signals,
      phases,
      complexity: phases.length >= 4 ? 'complex' : 'moderate',
    };
  }

  if (activeShapes.length >= 1) {
    const [topShape, topScore] = activeShapes[0];
    const maxPossible = Math.max(topScore + 2, 6); // Normalize against reasonable max
    const confidence = Math.min(topScore / maxPossible, 0.95);

    return {
      type: topShape,
      confidence,
      signals,
      complexity: topScore >= 4 ? 'moderate' : 'simple',
    };
  }

  // No strong signals — could be a simple question or direct task
  if (signals.length > 0) {
    const [topShape] = [...scores.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      type: topShape,
      confidence: 0.3,
      signals,
      complexity: 'simple',
    };
  }

  // Truly no signals — default to direct (no workflow needed)
  return {
    type: 'draft',
    confidence: 0.1,
    signals: [],
    complexity: 'simple',
  };
}

/**
 * Extract ordered phases from a mixed task.
 * Attempts to identify which shape applies to which part of the message.
 */
function extractPhases(
  message: string,
  shapes: Array<Exclude<TaskShapeType, 'mixed'>>,
): ComponentPhase[] {
  const phases: ComponentPhase[] = [];
  const seen = new Set<string>();

  // Split on compound connectors
  const parts = message.split(/(?:,\s*(?:then|and then)\b|\bthen\b|\bafter that\b|\.\s+(?:Then|Next|Also)\b)/i);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Find which shape matches this part
    for (const shape of shapes) {
      const pattern = SHAPE_PATTERNS.find(p => p.shape === shape);
      if (!pattern) continue;

      const matches = [
        ...pattern.phrases.filter(p => p.test(trimmed)),
        ...pattern.keywords.filter(k => k.test(trimmed)),
      ];

      if (matches.length > 0 && !seen.has(shape)) {
        phases.push({ shape, trigger: trimmed.slice(0, 80) });
        seen.add(shape);
        break;
      }
    }
  }

  // If splitting didn't work well, fall back to shape order
  if (phases.length < 2) {
    return shapes.slice(0, 3).map(shape => ({
      shape,
      trigger: message.slice(0, 60),
    }));
  }

  return phases;
}
