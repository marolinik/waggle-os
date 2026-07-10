/**
 * Notification material-change gate (anti-nag).
 *
 * Proactive/self-review notifications only carry value when the underlying
 * artifact actually changed. This gate remembers the last material fingerprint
 * per dedupe key and lets a caller suppress a re-emit when nothing changed.
 *
 * Persisted as a small JSON store so suppression survives restarts. Tolerant of
 * a missing/corrupt file (falls back to "notify"), immutable updates, LRU-capped.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const STORE_FILE = 'notification-fingerprints.json';
const MAX_KEYS = 200;

interface FingerprintRecord {
  hash: string;
  updatedAt: number;
}

type FingerprintStore = Record<string, FingerprintRecord>;

/**
 * Stable JSON stringify — object keys sorted recursively so key ordering never
 * changes the resulting hash. Arrays keep their order (order is meaningful).
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

/** sha256 over a canonical (key-sorted) serialization of the material parts. */
export function materialFingerprint(parts: unknown): string {
  return createHash('sha256').update(stableStringify(parts)).digest('hex');
}

export class NotificationGate {
  private readonly storePath: string;

  constructor(dataDir: string) {
    this.storePath = path.join(dataDir, STORE_FILE);
  }

  private load(): FingerprintStore {
    try {
      const raw = JSON.parse(fs.readFileSync(this.storePath, 'utf-8')) as unknown;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
      return raw as FingerprintStore;
    } catch {
      // Missing or corrupt store — behave as if nothing was ever recorded.
      return {};
    }
  }

  private save(store: FingerprintStore): void {
    try {
      fs.writeFileSync(this.storePath, JSON.stringify(this.capLru(store)));
    } catch {
      // Best-effort — a failed write just means the next emit won't be suppressed.
    }
  }

  /** Keep only the newest MAX_KEYS records by last-updated time. */
  private capLru(store: FingerprintStore): FingerprintStore {
    const entries = Object.entries(store);
    if (entries.length <= MAX_KEYS) return store;
    entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
    return Object.fromEntries(entries.slice(0, MAX_KEYS));
  }

  /**
   * Returns true when this (key, hash) is new or the material changed since the
   * last emit — and records the new hash. Returns false when the hash is
   * unchanged (caller should suppress the notification).
   */
  shouldNotify(key: string, hash: string): boolean {
    const store = this.load();
    if (store[key]?.hash === hash) return false;
    this.save({ ...store, [key]: { hash, updatedAt: Date.now() } });
    return true;
  }
}

const gateCache = new Map<string, NotificationGate>();

/** One gate per data directory (memoized). */
export function getNotificationGate(dataDir: string): NotificationGate {
  let gate = gateCache.get(dataDir);
  if (!gate) {
    gate = new NotificationGate(dataDir);
    gateCache.set(dataDir, gate);
  }
  return gate;
}
