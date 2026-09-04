/**
 * home-cache — disk-persisted cache-first paint for the Home cockpit
 * (Path-to-9 Pillar 2.1 / Lane H item 1).
 *
 * The returning-user "boot tax" is that Home waits for the sidecar before it
 * paints anything. This module persists the last SUCCESSFUL Home payload
 * (server briefing + overnight + the recall highlights) to localStorage so the
 * next launch — including a cold desktop-binary start where the sidecar is
 * still warming — paints real content IMMEDIATELY, then refreshes silently.
 *
 * Discipline:
 *  - Versioned key: a shape change bumps CACHE_VERSION and old blobs are ignored.
 *  - Schema-guarded parse: any malformed / partial blob returns null (never a
 *    half-rendered hero). We validate the load path, not just trust JSON.parse.
 *  - Size-capped: arrays are trimmed on write and the serialized blob is capped,
 *    so a pathological payload can't blow the localStorage quota.
 *  - First-run payloads are NEVER cached (the caller guards on isFirstRun) — a
 *    day-0 user must keep the skeleton path, there is nothing real to paint.
 */
import type { HomeBriefing, OvernightSummary } from '@/lib/types';
import type { MemoryHighlight } from '@/lib/briefing-source';

const CACHE_VERSION = 1;
const CACHE_KEY = `waggle:home-cache:v${CACHE_VERSION}`;
/** Serialized blob larger than this is dropped rather than stored (quota guard). */
const MAX_BLOB_CHARS = 128_000;
/** Trim over-long lists before persisting — the hero only paints a handful. */
const MAX_RECENT_WORKSPACES = 6;
const MAX_HIGHLIGHTS = 3;

export interface HomeCachePayload {
  /** Server-issued logical profile that owns this payload. */
  profileId?: string;
  briefing: HomeBriefing;
  overnight: OvernightSummary | null;
  highlights: MemoryHighlight[];
  /** Epoch ms the payload was written — lets the caller reason about staleness. */
  savedAt: number;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Minimal structural guard for a persisted HomeBriefing (not exhaustive — just
 *  enough that the hero never renders against a shape it can't read). */
function isBriefingShape(v: unknown): v is HomeBriefing {
  if (!isObject(v)) return false;
  return (
    typeof v.greeting === 'string' &&
    typeof v.date === 'string' &&
    Array.isArray(v.recentWorkspaces) &&
    Array.isArray(v.suggestedActions) &&
    Array.isArray(v.upNext) &&
    typeof v.isFirstRun === 'boolean'
  );
}

/** Read the last cached Home payload, or null if absent / malformed / stale-version. */
export function readHomeCache(expectedProfileId?: string): HomeCachePayload | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) return null;
    if (parsed.version !== CACHE_VERSION) return null;
    const { briefing, overnight, highlights, savedAt } = parsed as Record<string, unknown>;
    const profileId = typeof parsed.profileId === 'string' ? parsed.profileId : undefined;
    if (expectedProfileId && profileId !== expectedProfileId) return null;
    if (!isBriefingShape(briefing)) return null;
    if (!Array.isArray(highlights)) return null;
    if (typeof savedAt !== 'number') return null;
    // A cached first-run payload is meaningless (nothing real to paint) — treat
    // as a miss so the caller takes the day-0 skeleton path.
    if (briefing.isFirstRun) return null;
    return {
      profileId,
      briefing,
      overnight: (overnight ?? null) as OvernightSummary | null,
      highlights: highlights as MemoryHighlight[],
      savedAt,
    };
  } catch {
    return null;
  }
}

/** Persist the last successful Home payload. No-op on first-run / storage errors. */
export function writeHomeCache(payload: {
  briefing: HomeBriefing;
  overnight: OvernightSummary | null;
  highlights: MemoryHighlight[];
}, profileId?: string): void {
  try {
    if (payload.briefing.isFirstRun) return;
    const trimmedBriefing: HomeBriefing = {
      ...payload.briefing,
      recentWorkspaces: payload.briefing.recentWorkspaces.slice(0, MAX_RECENT_WORKSPACES),
    };
    const blob = JSON.stringify({
      version: CACHE_VERSION,
      profileId,
      savedAt: Date.now(),
      briefing: trimmedBriefing,
      overnight: payload.overnight,
      highlights: payload.highlights.slice(0, MAX_HIGHLIGHTS),
    });
    if (blob.length > MAX_BLOB_CHARS) return;
    window.localStorage.setItem(CACHE_KEY, blob);
  } catch {
    // no-op — storage disabled / quota exceeded
  }
}

/** True when a paintable Home payload is cached — drives the warm-boot floor. */
export function homeCacheExists(profileId?: string): boolean {
  return readHomeCache(profileId) !== null;
}

/** Drop the cached payload. With an owner, never clear another profile's data. */
export function clearHomeCache(expectedProfileId?: string): void {
  try {
    if (expectedProfileId) {
      const raw = window.localStorage.getItem(CACHE_KEY);
      if (!raw) return;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (isObject(parsed) && parsed.profileId !== expectedProfileId) return;
      } catch {
        // Invalid cache data has no valid owner and is safe to discard.
      }
    }
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    // no-op
  }
}
