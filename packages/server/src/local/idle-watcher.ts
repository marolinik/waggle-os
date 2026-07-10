/**
 * IdleSessionWatcher — the runtime half of idle-triggered self-evolution
 * (CowAgent steal #3, v1 "review-before-apply only").
 *
 * A 60s daemon (mirrors LocalScheduler's start/stop/tick shape) that scans a
 * workspace's chat sessions for ones that have gone idle after a real
 * conversation, and — once per idle session — spawns a RESTRICTED reviewer
 * (persona `session-reviewer`) through a loopback chat turn. The reviewer reads
 * the transcript and either proposes a skill patch (held for human approval,
 * never written to disk autonomously) or replies NOTHING_TO_DO.
 *
 * Trust + cost guardrails:
 *  - default OFF (self-evolution.json `enabled:false`) — founder opt-in.
 *  - a session fires at most once per mtime (RAM fired-set keyed sessionId:mtime);
 *    it only re-fires after the file advances (a new message lands).
 *  - a per-day cap bounds spend.
 *  - `channel-*` and `evolve-*` sessions are skipped (IM threads + the reviewer's
 *    own loopback sessions must not be reviewed → no feedback loop).
 *
 * Enumeration is PURE (fs.statSync + raw line count). It deliberately does NOT
 * use readSessionMeta (session-utils.ts) — that lazily backfills a title/summary
 * onto disk, a write side effect a read-only scan must not trigger.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from './logger.js';
import { materialFingerprint } from './notification-gate.js';
import type { EmitNotificationOptions, EmitNotificationResult, NotificationEvent } from './routes/notifications.js';

const log = createLogger('idle-watcher');

/** Sentinel the reviewer emits when it finds nothing material — never notified. */
export const NOTHING_TO_DO = 'NOTHING_TO_DO';

/** Config file under dataDir. Absent/corrupt ⇒ DEFAULT_CONFIG. */
const CONFIG_FILE = 'self-evolution.json';

export interface SelfEvolutionConfig {
  /** Master switch — default OFF (founder opt-in). */
  enabled: boolean;
  /** Minutes a session must be idle before it is eligible for review. */
  idleMinutes: number;
  /** Minimum turns (message lines) — skip trivial/empty sessions. */
  minTurns: number;
  /** Hard ceiling on reviews launched per calendar day (spend guard). */
  maxReviewsPerDay: number;
}

export const DEFAULT_CONFIG: SelfEvolutionConfig = {
  enabled: false,
  idleMinutes: 15,
  minTurns: 6,
  maxReviewsPerDay: 5,
};

/** Result of one review turn (from the injected runReviewTurn). */
export interface ReviewTurnResult {
  content: string;
  error?: string;
}

/** Everything the watcher needs, injected for testability. */
export interface IdleSessionWatcherDeps {
  dataDir: string;
  /** Run one restricted review turn for a session; returns the reviewer's reply. */
  runReviewTurn: (input: { sessionId: string; workspaceId: string }) => Promise<ReviewTurnResult>;
  /** Bound emitNotification (server-scoped) — supports the anti-nag gate. */
  emitNotification: (
    event: Omit<NotificationEvent, 'type' | 'timestamp' | 'id' | 'read'>,
    options?: EmitNotificationOptions,
  ) => EmitNotificationResult;
  log?: { info: (msg: string) => void; warn: (msg: string) => void };
  /** Clock injection point for tests. */
  now?: () => number;
}

/** Newest N fired keys retained — bounds RAM for a long-running process. */
const FIRED_SET_CAP = 500;

export class IdleSessionWatcher {
  private readonly deps: IdleSessionWatcherDeps;
  private readonly now: () => number;
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  /** `${sessionId}:${mtimeMs}` — a session re-fires only after its file advances. */
  private readonly firedKeys = new Set<string>();
  /** Day-keyed review counter (RAM — acceptable v1; a restart resets the cap). */
  private dayCount = { day: '', count: 0 };

  constructor(deps: IdleSessionWatcherDeps) {
    this.deps = deps;
    this.now = deps.now ?? Date.now;
  }

  /** Start the tick loop. Default interval is 60 seconds. */
  start(intervalMs = 60_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick().catch(() => { /* tick swallows its own errors */ });
    }, intervalMs);
  }

  /** Stop the tick loop. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }

  /** Read + validate config. Absent/corrupt/partial ⇒ merged onto DEFAULT_CONFIG. */
  private loadConfig(): SelfEvolutionConfig {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(this.deps.dataDir, CONFIG_FILE), 'utf-8')) as unknown;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_CONFIG };
      const r = raw as Partial<SelfEvolutionConfig>;
      return {
        enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_CONFIG.enabled,
        idleMinutes: typeof r.idleMinutes === 'number' && r.idleMinutes > 0 ? r.idleMinutes : DEFAULT_CONFIG.idleMinutes,
        minTurns: typeof r.minTurns === 'number' && r.minTurns > 0 ? r.minTurns : DEFAULT_CONFIG.minTurns,
        maxReviewsPerDay: typeof r.maxReviewsPerDay === 'number' && r.maxReviewsPerDay >= 0 ? r.maxReviewsPerDay : DEFAULT_CONFIG.maxReviewsPerDay,
      };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  /**
   * Enumerate eligible sessions across all workspaces. PURE — statSync + raw
   * line count, no readSessionMeta (that writes). Skips channel-/evolve- prefixes
   * and sub-threshold sessions.
   */
  private findIdleSessions(cfg: SelfEvolutionConfig): Array<{ sessionId: string; workspaceId: string; mtimeMs: number }> {
    const workspacesDir = path.join(this.deps.dataDir, 'workspaces');
    let workspaceIds: string[];
    try {
      workspaceIds = fs.readdirSync(workspacesDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
    } catch {
      return []; // no workspaces dir yet
    }

    const idleMs = cfg.idleMinutes * 60_000;
    const nowMs = this.now();
    const out: Array<{ sessionId: string; workspaceId: string; mtimeMs: number }> = [];

    for (const workspaceId of workspaceIds) {
      const sessionsDir = path.join(workspacesDir, workspaceId, 'sessions');
      let files: string[];
      try {
        files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));
      } catch {
        continue;
      }
      for (const file of files) {
        const sessionId = file.slice(0, -'.jsonl'.length);
        // The reviewer's own loopback sessions (evolve-*) and IM threads
        // (channel-*) are never reviewed — reviewing evolve-* would loop.
        if (sessionId.startsWith('channel-') || sessionId.startsWith('evolve-')) continue;

        const filePath = path.join(sessionsDir, file);
        let mtimeMs: number;
        let turnCount: number;
        try {
          mtimeMs = fs.statSync(filePath).mtimeMs;
          turnCount = countTurns(fs.readFileSync(filePath, 'utf-8'));
        } catch {
          continue; // unreadable — skip
        }

        if (turnCount < cfg.minTurns) continue;
        if (nowMs - mtimeMs < idleMs) continue; // still active
        out.push({ sessionId, workspaceId, mtimeMs });
      }
    }
    return out;
  }

  private incrementDayCounter(): void {
    const today = new Date(this.now()).toISOString().slice(0, 10);
    if (this.dayCount.day !== today) this.dayCount = { day: today, count: 0 };
    this.dayCount.count += 1;
  }

  private dayCountRemaining(cfg: SelfEvolutionConfig): number {
    const today = new Date(this.now()).toISOString().slice(0, 10);
    const count = this.dayCount.day === today ? this.dayCount.count : 0;
    return cfg.maxReviewsPerDay - count;
  }

  private markFired(key: string): void {
    this.firedKeys.add(key);
    while (this.firedKeys.size > FIRED_SET_CAP) {
      const oldest = this.firedKeys.values().next().value as string | undefined;
      if (oldest === undefined) break;
      this.firedKeys.delete(oldest);
    }
  }

  /**
   * One tick: find idle sessions, review the ones not yet fired (within the day
   * cap), notify only on a material, non-empty finding. Single-flight guarded.
   */
  async tick(): Promise<number> {
    if (this.ticking) return 0;
    this.ticking = true;
    let reviewed = 0;
    try {
      const cfg = this.loadConfig();
      if (!cfg.enabled) return 0; // opt-in — no-op when disabled

      const candidates = this.findIdleSessions(cfg);
      for (const { sessionId, workspaceId, mtimeMs } of candidates) {
        const key = `${sessionId}:${mtimeMs}`;
        if (this.firedKeys.has(key)) continue; // already reviewed at this mtime
        if (this.dayCountRemaining(cfg) <= 0) {
          (this.deps.log ?? log).info(`[idle-watcher] daily review cap (${cfg.maxReviewsPerDay}) reached — deferring`);
          break;
        }

        // Count the review against the cap and mark fired BEFORE the turn so a
        // NOTHING_TO_DO result still consumes its slot and won't immediately re-fire.
        this.incrementDayCounter();
        this.markFired(key);
        reviewed += 1;

        let result: ReviewTurnResult;
        try {
          result = await this.deps.runReviewTurn({ sessionId, workspaceId });
        } catch (err) {
          (this.deps.log ?? log).warn(`[idle-watcher] review turn threw for ${sessionId}: ${err instanceof Error ? err.message : String(err)}`);
          continue;
        }

        const content = (result.content ?? '').trim();
        if (result.error || content === '' || content === NOTHING_TO_DO) {
          continue; // nothing material — stay silent
        }

        // Material finding — notify, anti-nag gated so an identical finding for
        // the same session on a later tick is suppressed.
        this.deps.emitNotification(
          {
            title: 'Self-evolution: a review found something',
            body: content.length > 200 ? `${content.slice(0, 197)}...` : content,
            category: 'agent',
            actionUrl: '/approvals',
          },
          { dedupeKey: `self-evolution:${sessionId}`, materialHash: materialFingerprint(content) },
        );
      }
    } finally {
      this.ticking = false;
    }
    return reviewed;
  }
}

/**
 * Read a bounded, compact transcript of a session's most recent messages.
 * PURE (readFileSync only). Returns null if unreadable or too short.
 *
 * The reviewer runs in a SEPARATE `evolve-*` session and read_file is jailed to
 * the workspace `files/` dir (resolveSafe), so it cannot open the session JSONL
 * itself. We therefore embed the transcript in the review message. (Deviation
 * from the spec's "it has read tools + workspace binding" — the sandbox blocks a
 * cross-directory read, so providing the transcript is the reliable path.)
 */
export function readRecentTranscript(
  dataDir: string,
  workspaceId: string,
  sessionId: string,
  maxMessages = 40,
  perMessageChars = 1500,
): string | null {
  const filePath = path.join(dataDir, 'workspaces', workspaceId, 'sessions', `${sessionId}.jsonl`);
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
  const lines = raw.split('\n').filter(l => l.trim());
  const messages: string[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as { type?: string; role?: string; content?: string };
      if (parsed.type === 'meta') continue;
      if (!parsed.role || !parsed.content) continue;
      const role = parsed.role.toUpperCase();
      const content = parsed.content.length > perMessageChars
        ? `${parsed.content.slice(0, perMessageChars)}…`
        : parsed.content;
      messages.push(`${role}: ${content}`);
    } catch {
      // skip malformed lines
    }
  }
  if (messages.length === 0) return null;
  return messages.slice(-maxMessages).join('\n\n');
}

/**
 * The review instruction sent to the `session-reviewer` persona. Embeds the
 * transcript and states the two things to look for, the default-silent contract,
 * and the never-invent rule.
 */
export function buildReviewInstruction(sessionId: string, transcript: string): string {
  return [
    `You are reviewing the finished session "${sessionId}". Its recent conversation is below, between the markers.`,
    '',
    '--- BEGIN SESSION TRANSCRIPT ---',
    transcript,
    '--- END SESSION TRANSCRIPT ---',
    '',
    'Examine ONLY the transcript above and look for exactly two things:',
    '1. Promised-but-undelivered deliverables — the assistant said it would do or produce something and never did.',
    '2. Recurring capability failures fixable by a skill patch — the same tool/skill/workflow failed more than once.',
    '',
    'If — and only if — you find a MATERIAL, ACTIONABLE finding backed by explicit transcript evidence: state the finding with its evidence in one short paragraph, then propose the smallest skill that would prevent it via create_skill (it will be held for the human to approve — it is NOT written to disk now).',
    `Otherwise reply with exactly: ${NOTHING_TO_DO}`,
    'Never invent a finding. If you cannot cite the transcript, reply NOTHING_TO_DO.',
  ].join('\n');
}

/**
 * Turn count for a session JSONL: non-empty lines, minus the leading meta line
 * if present. Pure — parses only the first line to detect meta, never writes.
 */
export function countTurns(raw: string): number {
  const lines = raw.split('\n').filter(l => l.trim());
  if (lines.length === 0) return 0;
  try {
    const first = JSON.parse(lines[0]) as { type?: string };
    if (first?.type === 'meta') return lines.length - 1;
  } catch {
    // First line isn't JSON meta — count every non-empty line.
  }
  return lines.length;
}
