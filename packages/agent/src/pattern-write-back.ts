/**
 * Pattern-based memory write-back. Inspects (userMsg, assistantMsg) for
 * preference / decision / correction / structured-finding signals and writes
 * the distilled frames into the appropriate mind store.
 *
 * Extracted from Orchestrator.autoSaveFromExchange (PR-A, 2026-05-27).
 * Behavior preserved verbatim; only the call surface moved.
 *
 * Why this isn't in Orchestrator: pure transform of (userMsg, assistantMsg)
 * against a fixed store-set; not bound to Orchestrator's identity / awareness
 * / search / knowledge layers. Lifting it keeps Orchestrator a facade and
 * lets the pattern set evolve (toward LLM-based extraction in PR-H) without
 * churning the orchestrator surface.
 *
 * SOTA target: this is the regex-based predecessor of an LLM-driven memory
 * writer (PR-H). The patterns here are deliberately conservative — false-
 * positive suppression matters more than recall, because every saved frame
 * becomes recallable context.
 */

import {
  type FrameStore,
  type SessionStore,
  type Importance,
  type MemoryFrame,
  type MindDB,
  type TeamSync,
  createCoreLogger,
} from '@waggle/core';
import { isSelfIncapacityAssertion } from './memory-sign-gate.js';
import type { CognifyPipeline } from './cognify.js';
import {
  MIN_CONTENT_LENGTH,
  DEDUP_SLICE_LENGTH,
  RECALL_LINE_LENGTH,
  FINDINGS_SLICE_LENGTH,
  STRUCTURED_EXTRACT_THRESHOLD,
  CONTEXT_PREVIEW_LENGTH,
} from './content-constants.js';

const logger = createCoreLogger('pattern-write-back');

/**
 * Stores + facilities the extractor needs to persist frames to the right
 * mind (workspace vs personal) and optionally push to team-sync. The seam is
 * kept tight on purpose — the extractor doesn't need to know about identity,
 * awareness, search, or knowledge layers.
 */
export interface PatternWriteBackDeps {
  /** Personal mind layers (preferences, corrections, style notes route here) */
  personal: {
    db: MindDB;
    frames: FrameStore;
    sessions: SessionStore;
  };
  /** Workspace mind layers (decisions, work output route here). Null = personal-only mode. */
  workspace: {
    frames: FrameStore;
    sessions: SessionStore;
    cognify: CognifyPipeline;
  } | null;
  /** Optional team-sync client; receives pushFrame for workspace writes only */
  teamSync: TeamSync | null;
}

// ── Pattern definitions (lifted from inline orchestrator function) ──

const CASUAL_PATTERNS: readonly RegExp[] = [
  /\b(lunch|dinner|breakfast|coffee|pizza|food|snack|drink)\b/i,
  /\b(weather|weekend|holiday|vacation|birthday|party)\b/i,
  /^(hi|hey|hello|thanks|thank you|bye|goodbye)\b/i,
  // Bare acks — only when the entire user message is just that word
  /^(ok|okay|sure|yep|nope|yes|no)[.!?\s]*$/i,
];

const PREFERENCE_PATTERNS: readonly RegExp[] = [
  /\bi (?:prefer|like|want|need|always|never)\b/i,
  /\bcall me\b/i,
  /\bmy (?:name|style|preference)\b/i,
  /\bdon'?t (?:ever|always)\b/i,
  /\bi(?:'d| would) rather\b/i,
  /\bkeep (?:it|things) (?:short|brief|concise|detailed)\b/i,
  /\buse (?:bullet|numbered|markdown|plain)\b/i,
  /\bstop (?:doing|saying|adding)\b/i,
  /\bfrom now on\b/i,
  /\bplease (?:always|never|don'?t)\b/i,
];

const STYLE_SIGNALS: ReadonlyArray<{ pattern: RegExp; note: string }> = [
  { pattern: /\b(?:bullet|bullets|bullet.?points?|list form)\b/i, note: 'Style note: User prefers bullet-point format' },
  { pattern: /\b(?:keep it (?:short|brief)|tl;?dr|tldr|short version|in brief)\b/i, note: 'Style note: User prefers concise responses' },
  { pattern: /\b(?:explain|detail|elaborate|go deeper|more detail|thorough)\b/i, note: 'Style note: User prefers detailed explanations' },
  { pattern: /\b(?:table|tabular|spreadsheet|columns)\b/i, note: 'Style note: User prefers tabular data presentation' },
  { pattern: /\b(?:code first|show me the code|just the code)\b/i, note: 'Style note: User prefers code examples over prose' },
  { pattern: /\b(?:plain english|simple terms|eli5|layman|non.?technical)\b/i, note: 'Style note: User prefers non-technical language' },
];

const DECISION_PATTERNS: readonly RegExp[] = [
  /\b(?:let'?s go with|we(?:'ll| will) (?:use|go with|do)|decided to|decision:|agreed to)\b/i,
  /\bthe plan is\b/i,
  /\bok(?:ay)?,?\s+(?:option|choice|approach)\s*(?:[a-z]|\d)/i,
  /\blet'?s (?:proceed|move forward|do that|go ahead)\b/i,
  /\bwe(?:'re| are) going (?:with|to)\b/i,
  /\bfinal(?:ly|ized)?\s+(?:decision|choice|answer)\b/i,
  /\bi(?:'ll| will) go (?:with|ahead)\b/i,
];

// Anchored start, length-gated to avoid matching long hedged replies that
// happen to begin with "yes but …". Used both as the early "looks-like-
// acceptance" gate and the explicit bilateral-consent check below.
const ACCEPTANCE_REGEX = /^(?:ok(?:ay)?|yes|yeah|yep|sure|go|go ahead|do it|let'?s (?:do (?:it|that)|proceed|go)|sounds good|perfect|great|that works|go with (?:it|that))\b/i;

const CORRECTION_PATTERNS: readonly RegExp[] = [
  /\b(?:no,? (?:actually|that'?s wrong|it'?s)|wrong|incorrect|not (?:right|correct|true)|you'?re mistaken)\b/i,
];

const INLINE_DECISION_PATTERNS: readonly RegExp[] = [
  /\b(?:recommended|recommend|suggestion is|best approach|should use|going with)\b/i,
  /\b(?:conclusion|concluded|summary|in summary)\b/i,
];

type SaveTarget = 'workspace' | 'personal';

/**
 * Post-response heuristic write-back. Scans (userMsg, assistantMsg) for
 * save-worthy signals and writes distilled memory frames. Returns short
 * previews of what was saved (DEDUP_SLICE_LENGTH chars each).
 *
 * Routing:
 *   target='workspace' → uses workspace cognify+frames when active, else personal
 *   target='personal'  → always personal (preferences, corrections, style)
 */
export async function runPatternWriteBack(
  deps: PatternWriteBackDeps,
  userMsg: string,
  assistantMsg: string,
): Promise<string[]> {
  const saved: string[] = [];

  // Helper: persist one frame, applying the sign-gate downgrade and the
  // team-sync push for workspace writes. Returns the created frame so
  // teamSync.pushFrame gets the actual write, not whatever is "latest" at
  // read time (the bug that motivated Review #9).
  const save = async (
    content: string,
    importance: Importance,
    target: SaveTarget = 'workspace',
  ): Promise<MemoryFrame | null> => {
    // R2 sign gate (DEFECT-2): self-incapacity assertions persist at
    // 'temporary' so they're audit-visible but cannot re-enter the prompt as
    // authoritative recall (recall path excludes 'temporary').
    if (importance !== 'temporary' && isSelfIncapacityAssertion(content)) {
      logger.debug('autoSave sign-gate: self-incapacity frame downgraded to temporary', {
        preview: content.slice(0, DEDUP_SLICE_LENGTH),
      });
      importance = 'temporary';
    }
    const useWorkspace = target === 'workspace' && deps.workspace !== null;
    const frames = useWorkspace ? deps.workspace!.frames : deps.personal.frames;
    const sessions = useWorkspace ? deps.workspace!.sessions : deps.personal.sessions;
    const cognify = useWorkspace ? deps.workspace!.cognify : null;

    let createdFrame: MemoryFrame | null = null;

    if (cognify) {
      const result = await cognify.cognify(content, importance);
      createdFrame = frames.getById(result.frameId) ?? null;
    } else {
      // ensureActive is transaction-wrapped — concurrent saves on a fresh
      // mind don't race into twin sessions with frames split across them.
      const session = sessions.ensureActive();
      const gopId = session.gop_id;
      const latestI = frames.getLatestIFrame(gopId);
      createdFrame = latestI
        ? frames.createPFrame(gopId, content, latestI.id, importance)
        : frames.createIFrame(gopId, content, importance);
    }
    saved.push(content.slice(0, DEDUP_SLICE_LENGTH));

    if (deps.teamSync && useWorkspace && createdFrame) {
      deps.teamSync.pushFrame(createdFrame).catch(() => { /* non-blocking */ });
    }

    return createdFrame;
  };

  // ── Early gate: short messages skip unless they look like a decision ack ──
  // Review #12: short acceptances ("ok, go ahead") DO carry a decision when
  // paired with an assistant suggestion, so we let those through.
  const userTrimmedEarly = userMsg.trim();
  const looksLikeAcceptance = ACCEPTANCE_REGEX.test(userTrimmedEarly);
  if (userMsg.length < MIN_CONTENT_LENGTH && !assistantMsg.includes('```') && !looksLikeAcceptance) {
    logger.debug('autoSave: skipping short exchange', { len: userMsg.length });
    return saved;
  }

  // ── Casual filter: drop greetings, food/weather chatter, bare acks ──
  if (CASUAL_PATTERNS.some(p => p.test(userMsg))) return saved;

  // ── Pattern: explicit user preference ──
  for (const pat of PREFERENCE_PATTERNS) {
    if (pat.test(userMsg)) {
      const sentences = userMsg.split(/[.!?\n]+/).filter(s => pat.test(s));
      if (sentences.length > 0) {
        await save(`User preference: ${sentences[0].trim()}`, 'normal', 'personal');
      }
      break;
    }
  }

  // ── Implicit style detection (only if no explicit preference fired) ──
  if (saved.length === 0 && userMsg.length > MIN_CONTENT_LENGTH) {
    for (const { pattern, note } of STYLE_SIGNALS) {
      if (pattern.test(userMsg)) {
        const personalRaw = deps.personal.db.getDatabase();
        const existing = personalRaw.prepare(
          `SELECT id FROM memory_frames WHERE content = ? LIMIT 1`
        ).get(note) as { id: number } | undefined;
        if (!existing) {
          await save(note, 'normal', 'personal');
        }
        break;
      }
    }
  }

  // ── Pattern: decision (REQUIRES BILATERAL AGREEMENT, Review C2) ──
  // User states the decision, OR assistant states it AND user explicitly
  // accepts. Combined-string matching previously saved unaccepted assistant
  // suggestions as 'important' and polluted catch-up recall durably.
  const userHasDecision = DECISION_PATTERNS.some(p => p.test(userMsg));
  const assistantHasDecision = DECISION_PATTERNS.some(p => p.test(assistantMsg));
  const userTrimmed = userMsg.trim();
  const userAcceptsAssistant = userTrimmed.length < 60 && ACCEPTANCE_REGEX.test(userTrimmed);

  let decisionText: string | null = null;
  if (userHasDecision) {
    for (const pat of DECISION_PATTERNS) {
      const sentences = userMsg.split(/[.!?\n]+/).filter(s => pat.test(s));
      if (sentences.length > 0) {
        decisionText = sentences[0].trim().slice(0, RECALL_LINE_LENGTH);
        break;
      }
    }
  } else if (assistantHasDecision && userAcceptsAssistant) {
    for (const pat of DECISION_PATTERNS) {
      const sentences = assistantMsg.split(/[.!?\n]+/).filter(s => pat.test(s));
      if (sentences.length > 0) {
        decisionText = sentences[0].trim().slice(0, RECALL_LINE_LENGTH);
        break;
      }
    }
  }

  if (decisionText) {
    await save(`Decision: ${decisionText}`, 'important');
  }

  // ── Pattern: user correction ──
  if (CORRECTION_PATTERNS.some(p => p.test(userMsg))) {
    await save(`Correction from user: ${userMsg.slice(0, CONTEXT_PREVIEW_LENGTH)}`, 'important', 'personal');
  }

  // ── Pattern: research output with external sources ──
  const hasUrls = /https?:\/\/[^\s)]+/.test(assistantMsg);
  const hasStructuredFindings = assistantMsg.length > 600 && (
    (assistantMsg.includes('\n## ') && hasUrls) ||
    (assistantMsg.match(/^\d+\./gm)?.length ?? 0) >= 3
  );
  if (hasStructuredFindings) {
    const headings = assistantMsg.match(/^##?\s+.+$/gm)?.slice(0, 3) ?? [];
    const urls = assistantMsg.match(/https?:\/\/[^\s)]+/g)?.slice(0, 3) ?? [];
    const findingSummary = [
      ...headings.map(h => h.replace(/^#+\s+/, '')),
      ...(urls.length > 0 ? [`Sources: ${urls.join(', ')}`] : []),
    ].join('. ');
    if (findingSummary.length > 20) {
      await save(`Research findings: ${findingSummary.slice(0, FINDINGS_SLICE_LENGTH)}`, 'important');
    }
  }

  // ── Structured extraction from substantial assistant output ──
  if (assistantMsg.length > 200) {
    const lines = assistantMsg.split('\n').filter(l => l.trim().length > 5);
    let savedStructured = false;

    // Inline decisions (different patterns than the explicit decision block above)
    for (const pat of INLINE_DECISION_PATTERNS) {
      const decisionLines = lines.filter(l => pat.test(l));
      if (decisionLines.length > 0 && saved.length < 5) {
        const text = decisionLines[0].replace(/^[-*\d.#]+\s*/, '').trim();
        if (text.length > 20) {
          await save(`Recommendation: ${text.slice(0, RECALL_LINE_LENGTH)}`, 'important');
          savedStructured = true;
          break;
        }
      }
    }

    // Save user's original question/statement as a frame (if substantive)
    if (userMsg.length >= MIN_CONTENT_LENGTH && userMsg.length <= STRUCTURED_EXTRACT_THRESHOLD && saved.length < 5) {
      const alreadyCapturedUser = saved.some(s =>
        s.startsWith('User preference:') || s.startsWith('Correction from user:') || s.startsWith('Decision:')
      );
      if (!alreadyCapturedUser) {
        await save(`User asked: ${userMsg.slice(0, RECALL_LINE_LENGTH)}`, 'temporary');
        savedStructured = true;
      }
    }

    // Extract key facts from bullet points or numbered lists
    if (assistantMsg.length > STRUCTURED_EXTRACT_THRESHOLD) {
      const bullets = lines
        .filter(l => l.match(/^[-*]\s/) || l.match(/^\d+\.\s/))
        .map(l => l.replace(/^[-*\d.]+\s+/, '').trim())
        .filter(l => l.length > 15 && l.length < 300);

      if (bullets.length >= 2 && saved.length < 5) {
        const keyPoints = bullets.slice(0, 3).join('; ');
        const heading = lines.find(l => l.startsWith('#'))?.replace(/^#+\s+/, '') ?? '';
        const prefix = heading ? `${heading}: ` : 'Key points: ';
        await save(`${prefix}${keyPoints.slice(0, FINDINGS_SLICE_LENGTH)}`, 'normal');
        savedStructured = true;
      }
    }

    // Fallback: compact summary when nothing structured fired and the
    // response is substantial. Never save the full blob — distill first.
    if (!savedStructured && assistantMsg.length > STRUCTURED_EXTRACT_THRESHOLD && saved.length === 0) {
      const heading = lines.find(l => l.startsWith('#'))?.replace(/^#+\s+/, '') ?? '';
      const firstMeaningful = lines.find(l => !l.startsWith('#') && l.length > 20)?.trim() ?? '';
      const summary = heading
        ? `${heading}${firstMeaningful ? ': ' + firstMeaningful : ''}`
        : firstMeaningful || 'Work output produced';
      await save(`Work completed: ${summary.slice(0, RECALL_LINE_LENGTH)}`, 'normal');
    }
  }

  return saved;
}
