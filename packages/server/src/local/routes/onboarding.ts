import type { FastifyPluginAsync } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { FrameStore, type MindDB } from '@waggle/core';

/**
 * P4 (UX-Refactor) — server-authoritative onboarding status.
 *
 * The FE's returning-user auto-complete used `GET /api/workspaces.length > 0`
 * as its evidence — but buildLocalServer calls wsManager.ensureDefault() at
 * boot, so a CLEAN install already has one workspace before the first render
 * and a brand-new production user never saw the wizard (S4 founder flag,
 * confirmed in P4). The workspace count can't distinguish "returning user"
 * from "boot-seeded stub"; this surface can:
 *
 *  - the completion FLAG (`<dataDir>/first-launch.flag` — the SAME file the
 *    Tauri `mark_first_launch_complete` command writes for default installs)
 *    is stamped by POST /api/onboarding/complete when any client finishes the
 *    wizard, and
 *  - LEGACY EVIDENCE covers installs that predate the flag: real usage in the
 *    personal mind (any frame) or user-created workspaces beyond the seeded
 *    default.
 *
 * Fail direction: no flag + no evidence → completed:false → the wizard runs.
 * Better to show it once too often than to silently skip it (same rule as the
 * Rust command's IO-error fallback).
 */

const FLAG_FILE = 'first-launch.flag';
const PENDING_FILE = 'onboarding-pending.flag';
const PROFILE_ID_KEY = 'onboarding_profile_id';
const PROFILE_ID_SCAN_BYTES = 37;
const PROFILE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ProfileIdRow {
  storageType: string;
  prefix: Buffer;
}

function validProfileId(row: ProfileIdRow | undefined): string | undefined {
  return row?.storageType === 'text'
    && Buffer.isBuffer(row.prefix)
    && row.prefix.length === 36
    && PROFILE_ID_PATTERN.test(row.prefix.toString('ascii'))
    ? row.prefix.toString('ascii')
    : undefined;
}

export function readOrCreateProfileId(
  mind: MindDB,
  generate: () => string = randomUUID,
): string | undefined {
  try {
    const db = mind.getDatabase();
    const read = (): ProfileIdRow | undefined => db.prepare(`
      SELECT
        typeof(value) AS storageType,
        substr(CAST(value AS BLOB), 1, ?) AS prefix
      FROM meta
      WHERE key = ?
    `).get(
      PROFILE_ID_SCAN_BYTES,
      PROFILE_ID_KEY,
    ) as ProfileIdRow | undefined;

    const existing = read();
    const validExisting = validProfileId(existing);
    if (validExisting) return validExisting;

    const candidate = generate();
    if (!PROFILE_ID_PATTERN.test(candidate)) return undefined;
    if (!existing) {
      db.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)')
        .run(PROFILE_ID_KEY, candidate);
    } else {
      // Compare-and-swap the bounded fingerprint. If another sidecar repairs
      // the row first, its valid winner no longer matches and is preserved.
      db.prepare(`
        UPDATE meta
        SET value = ?
        WHERE key = ?
          AND typeof(value) = ?
          AND hex(substr(CAST(value AS BLOB), 1, ?)) = ?
      `).run(
        candidate,
        PROFILE_ID_KEY,
        existing.storageType,
        PROFILE_ID_SCAN_BYTES,
        existing.prefix.toString('hex').toUpperCase(),
      );
    }

    return validProfileId(read());
  } catch {
    // Status remains usable when the personal mind is unavailable. Omitting
    // the id keeps the browser from trusting profile-scoped cached state.
    return undefined;
  }
}

export const onboardingRoutes: FastifyPluginAsync = async (server) => {
  const flagPath = (): string => path.join(server.localConfig.dataDir, FLAG_FILE);
  const pendingPath = (): string => path.join(server.localConfig.dataDir, PENDING_FILE);
  const status = (completed: boolean, source: string) => {
    const profileId = readOrCreateProfileId(server.multiMind.personal);
    return profileId ? { completed, source, profileId } : { completed, source };
  };

  // Legacy-evidence is only consulted ONCE per dataDir. The first status call
  // that finds no flag and no evidence stamps a durable PENDING marker — from
  // then on, only explicit completion flips the status. Without the latch,
  // the wizard's own pre-completion writes count as "evidence" (step 1's
  // PUT /api/profile writes a 'User identity:' frame; C33 import writes
  // frames; workspace-create makes list().length > 1) — and so does the
  // monthly-assessment CRON frame, with zero user interaction. Any of those
  // plus a lost localStorage (fresh WebView profile on reinstall, site-data
  // clear) would silently skip the wizard for a user who never finished it —
  // the exact failure direction this surface exists to prevent (review P4,
  // onboarding-logic findings 1/6/11/13).
  server.get('/api/onboarding/status', async () => {
    if (fs.existsSync(flagPath())) {
      return status(true, 'flag');
    }
    if (fs.existsSync(pendingPath())) {
      return status(false, 'pending');
    }
    try {
      const frames = new FrameStore(server.multiMind.personal);
      if (frames.getRecent(1).length > 0) {
        return status(true, 'legacy-evidence');
      }
    } catch { /* personal mind unavailable → not evidence of prior use */ }
    try {
      if (server.workspaceManager.list().length > 1) {
        return status(true, 'legacy-evidence');
      }
    } catch { /* manager unavailable → not evidence */ }
    // Un-onboarded dataDir identified — latch it so later wizard/system
    // writes can never masquerade as a returning user.
    try {
      fs.mkdirSync(server.localConfig.dataDir, { recursive: true });
      fs.writeFileSync(pendingPath(), new Date().toISOString());
    } catch { /* latch failed → next call re-evaluates; fail-open to wizard */ }
    return status(false, 'none');
  });

  // Idempotent completion stamp. The wizard's complete() fires this alongside
  // the Tauri filesystem flag (which only covers default ~/.waggle installs).
  server.post('/api/onboarding/complete', async () => {
    fs.mkdirSync(server.localConfig.dataDir, { recursive: true });
    fs.writeFileSync(flagPath(), new Date().toISOString());
    try { fs.unlinkSync(pendingPath()); } catch { /* never stamped — fine */ }
    return { completed: true };
  });
};
