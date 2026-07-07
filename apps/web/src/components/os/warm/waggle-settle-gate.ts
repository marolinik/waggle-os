/**
 * SIGNATURE.full session gate for the waggle-settle (Phase-D Lane WS).
 *
 * The full-amplitude settle is a RARE flourish (Phase-0.7 taxonomy): it fires at
 * most once per session for a given "first-of-session" moment, and never inside
 * the global per-session cooldown that spaces ALL full flourishes apart. Pure
 * decision + thin sessionStorage persistence — session-scoped ON PURPOSE (a
 * fresh tab/session earns the flourish again; a reload within the session does
 * not). Mirrors the import-reminder-state split: pure logic here, storage is the
 * caller's edge.
 */
import { SIGNATURE } from '@/lib/motion/tokens';

export const SIGNATURE_FULL_STORAGE_KEY = 'waggle:signature-full-state';

export interface SignatureFullState {
  /** Epoch ms of the last full flourish this session, or null if none yet. */
  readonly lastFiredAt: number | null;
  /** First-of-session moments already spent this session. */
  readonly firedMoments: readonly string[];
}

export const EMPTY_SIGNATURE_STATE: SignatureFullState = { lastFiredAt: null, firedMoments: [] };

export interface CanFireInput {
  readonly moment: string;
  readonly state: SignatureFullState;
  readonly now: number;
  /** Override the taxonomy cooldown (tests). */
  readonly cooldownMs?: number;
}

/** Pure: may a full-amplitude settle fire for `moment` at `now`? */
export function canFireFullSignature({ moment, state, now, cooldownMs }: CanFireInput): boolean {
  const cd = cooldownMs ?? SIGNATURE.full.perSessionCooldownMs;
  // Only recognised full-tier moments qualify for the flourish.
  if (!(SIGNATURE.full.moments as readonly string[]).includes(moment)) return false;
  // A first-of-session moment is spent once per session.
  if (state.firedMoments.includes(moment)) return false;
  // The global cooldown spaces every full flourish apart.
  if (state.lastFiredAt !== null && now - state.lastFiredAt < cd) return false;
  return true;
}

/** Immutable fold: record a fire of `moment` at `now`. */
export function recordFullSignature(state: SignatureFullState, moment: string, now: number): SignatureFullState {
  return {
    lastFiredAt: now,
    firedMoments: state.firedMoments.includes(moment)
      ? state.firedMoments
      : [...state.firedMoments, moment],
  };
}

/** Read session-scoped gate state; empty when storage is unavailable/unset. */
export function readSignatureFullState(): SignatureFullState {
  try {
    const raw = window.sessionStorage.getItem(SIGNATURE_FULL_STORAGE_KEY);
    if (!raw) return EMPTY_SIGNATURE_STATE;
    const parsed = JSON.parse(raw) as Partial<SignatureFullState>;
    return {
      lastFiredAt: typeof parsed.lastFiredAt === 'number' ? parsed.lastFiredAt : null,
      firedMoments: Array.isArray(parsed.firedMoments)
        ? parsed.firedMoments.filter((m): m is string => typeof m === 'string')
        : [],
    };
  } catch {
    return EMPTY_SIGNATURE_STATE;
  }
}

/** Persist session-scoped gate state (no-op when storage disabled). */
export function writeSignatureFullState(state: SignatureFullState): void {
  try {
    window.sessionStorage.setItem(SIGNATURE_FULL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage disabled — no-op */
  }
}

/**
 * Caller convenience: check the gate and, if the flourish may play, record the
 * fire atomically. Returns true when the settle should play now.
 */
export function claimFullSignature(moment: string, now: number = Date.now()): boolean {
  const state = readSignatureFullState();
  if (!canFireFullSignature({ moment, state, now })) return false;
  writeSignatureFullState(recordFullSignature(state, moment, now));
  return true;
}
