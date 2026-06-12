import type { FastifyPluginAsync } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { FrameStore } from '@waggle/core';

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

export const onboardingRoutes: FastifyPluginAsync = async (server) => {
  const flagPath = (): string => path.join(server.localConfig.dataDir, FLAG_FILE);
  const pendingPath = (): string => path.join(server.localConfig.dataDir, PENDING_FILE);

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
      return { completed: true, source: 'flag' };
    }
    if (fs.existsSync(pendingPath())) {
      return { completed: false, source: 'pending' };
    }
    try {
      const frames = new FrameStore(server.multiMind.personal);
      if (frames.getRecent(1).length > 0) {
        return { completed: true, source: 'legacy-evidence' };
      }
    } catch { /* personal mind unavailable → not evidence of prior use */ }
    try {
      if (server.workspaceManager.list().length > 1) {
        return { completed: true, source: 'legacy-evidence' };
      }
    } catch { /* manager unavailable → not evidence */ }
    // Un-onboarded dataDir identified — latch it so later wizard/system
    // writes can never masquerade as a returning user.
    try {
      fs.mkdirSync(server.localConfig.dataDir, { recursive: true });
      fs.writeFileSync(pendingPath(), new Date().toISOString());
    } catch { /* latch failed → next call re-evaluates; fail-open to wizard */ }
    return { completed: false, source: 'none' };
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
