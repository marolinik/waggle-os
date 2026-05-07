/**
 * POST /api/data/erase — schedule a complete erasure of this install's data dir.
 *
 * Pilot users invoke this to exercise their right to erasure (GDPR Art. 17).
 * The route does NOT itself delete anything — it validates, snapshots, and
 * writes a marker file. The actual destructive wipe runs at next service
 * startup, BEFORE any DB is opened, so we never rm-rf a dir whose handles
 * the running server still holds.
 *
 * Contract: see `docs/pilot/data-handling-policy.md` § 4.
 *
 * Confirmation gate (intentional friction — accidental erasure is unrecoverable):
 *   - Header `X-Confirm-Erase: yes` (exact match, case-sensitive)
 *   - Body  `{ "confirmation": "I UNDERSTAND THIS IS PERMANENT" }` (exact phrase)
 *
 * Audit: emits `data_erase_requested` BEFORE writing the marker, so the
 * audit trail survives even if the marker write fails.
 */

import type { FastifyPluginAsync } from 'fastify';
import {
  validateEraseConfirmation,
  snapshotDataDir,
  assertDataDirIsSafeToWipe,
  writeEraseMarker,
  ERASE_CONFIRMATION_PHRASE,
  ERASE_CONFIRMATION_HEADER_VALUE,
  type EraseMarker,
} from '../data-erase-helpers.js';
import { emitAuditEvent } from './events.js';

export const dataEraseRoutes: FastifyPluginAsync = async (server) => {
  server.post('/api/data/erase', async (request, reply) => {
    const dataDir = server.localConfig.dataDir;

    // ── Gate 1: confirmation header + body phrase ────────────────────
    const confirmation = validateEraseConfirmation(
      request.headers as Record<string, string | string[] | undefined>,
      request.body,
    );
    if (!confirmation.ok) {
      return reply.code(400).send({
        error: 'ERASE_NOT_CONFIRMED',
        message: confirmation.error,
        requirements: {
          header: { name: 'X-Confirm-Erase', value: ERASE_CONFIRMATION_HEADER_VALUE },
          bodyField: { name: 'confirmation', value: ERASE_CONFIRMATION_PHRASE },
        },
      });
    }

    // ── Gate 2: dataDir must look like a Waggle data dir ─────────────
    const safetyError = assertDataDirIsSafeToWipe(dataDir);
    if (safetyError) {
      return reply.code(400).send({
        error: 'ERASE_REFUSED_UNSAFE_PATH',
        message: safetyError,
      });
    }

    // ── Snapshot ─────────────────────────────────────────────────────
    const snapshot = snapshotDataDir(dataDir);
    const requestedAt = new Date().toISOString();

    // ── Audit BEFORE marker — order matters for compliance trail ─────
    try {
      emitAuditEvent(server, {
        // workspaceId is required by the AuditEvent type; data erasure is
        // a system-level action so 'default' (the same fallback emitAuditEvent
        // uses internally) is the correct conceptual scope.
        workspaceId: 'default',
        eventType: 'data_erase_requested',
        // The snapshot fits in the existing audit `input` column as JSON;
        // not perfect schema-wise but lets us reuse the existing audit DB
        // without a migration just for one field.
        input: JSON.stringify({
          fileCount: snapshot.fileCount,
          totalBytes: snapshot.totalBytes,
          topLevelEntryCount: snapshot.topLevelEntries.length,
        }),
      });
    } catch (e) {
      // The audit DB may be unavailable in tests / during corruption recovery.
      // We still allow the erasure — the receipt itself is the user-visible
      // record. Log so a failed audit emission is observable.
      request.log.warn({ err: e }, 'data_erase audit emit failed; continuing');
    }

    // ── Write marker ─────────────────────────────────────────────────
    const marker: EraseMarker = {
      schemaVersion: 1,
      requestedAt,
      snapshot,
    };
    let markerPath: string;
    try {
      markerPath = writeEraseMarker(dataDir, marker);
    } catch (e) {
      return reply.code(500).send({
        error: 'ERASE_MARKER_WRITE_FAILED',
        message: (e as Error).message,
      });
    }

    return reply.code(200).send({
      requestedAt,
      markerPath,
      dataDirSnapshot: snapshot,
      instruction: 'Quit Waggle and relaunch — erasure completes during startup. The audit-receipt-*.json file in your data dir after relaunch records what was deleted.',
    });
  });
};
