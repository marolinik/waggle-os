/**
 * Export routes — GDPR-compliant "Download my data" endpoint.
 *
 * POST /api/export — generates and returns a ZIP file containing:
 *   - memories/     — all memory frames from .mind DB (JSON)
 *   - sessions/     — all session .jsonl files as markdown transcripts
 *   - workspaces/   — workspace configs (JSON)
 *   - settings.json — current settings with API keys masked
 *   - vault-metadata.json — vault entry names and types ONLY (NOT secret values)
 */

import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import type { FastifyPluginAsync } from 'fastify';
import archiver from 'archiver';
import { FrameStore, MindDB, WaggleConfig } from '@waggle/core';
import { exportSessionToMarkdown } from './sessions.js';
import { emitAuditEvent } from './events.js';

function maskApiKey(key: string): string {
  if (!key || key.length < 12) return '****';
  return key.slice(0, 7) + '...' + key.slice(-4);
}

export const exportRoutes: FastifyPluginAsync = async (server) => {
  // POST /api/export — generate and download a ZIP of user data
  // D1: Optional workspaceId body parameter for per-workspace export (agency/privacy use case)
  server.post<{ Body: { workspaceId?: string; workspace?: string } }>('/api/export', async (request, reply) => {
    const dataDir = server.localConfig.dataDir;
    const today = new Date().toISOString().slice(0, 10);
    // P0-4: Accept both 'workspaceId' and 'workspace'
    const scopedWorkspaceId = (request.body as any)?.workspaceId ?? (request.body as any)?.workspace as string | undefined;

    // Create ZIP archive
    const archive = archiver('zip', { zlib: { level: 6 } });
    const passthrough = new PassThrough();
    archive.pipe(passthrough);

    // ── 1. Memories (from personal mind) ────────────────────────────
    // D1: Skip personal mind when exporting a single workspace (privacy for agency/multi-client)
    if (!scopedWorkspaceId) {
      try {
        const personalDb = server.multiMind.personal;
        const frameStore = new FrameStore(personalDb);
        const frames = frameStore.list({ limit: 100000 });
        archive.append(JSON.stringify(frames, null, 2), { name: 'memories/personal-frames.json' });
      } catch {
        archive.append('[]', { name: 'memories/personal-frames.json' });
      }
    }

    // Export workspace mind frames too
    // F1 fix: Load MindDB from disk when not in cache. The cached getter
    // (getWorkspaceMindDb) may return null if the workspace was never
    // activated during this server session, even though frames exist on disk.
    // D1: When scopedWorkspaceId is provided, export only that workspace
    const allWorkspaces = server.workspaceManager.list();
    const workspaces = scopedWorkspaceId
      ? allWorkspaces.filter(ws => ws.id === scopedWorkspaceId)
      : allWorkspaces;
    for (const ws of workspaces) {
      let ownedDb: MindDB | null = null;
      try {
        // Try the cached getter first (avoids re-opening if already loaded)
        let wsDb = server.agentState.getWorkspaceMindDb(ws.id);

        // Fallback: open directly from disk if the cache returned null
        if (!wsDb) {
          const mindPath = path.join(dataDir, 'workspaces', ws.id, 'workspace.mind');
          if (fs.existsSync(mindPath)) {
            ownedDb = new MindDB(mindPath);
            wsDb = ownedDb;
          }
        }

        if (wsDb) {
          const wsFrameStore = new FrameStore(wsDb);
          const wsFrames = wsFrameStore.list({ limit: 100000 });
          archive.append(JSON.stringify(wsFrames, null, 2), {
            name: `memories/workspace-${ws.id}-frames.json`,
          });
        }
      } catch {
        // Skip inaccessible workspace minds
      } finally {
        // Close the DB we opened (don't leak handles for export-only opens)
        if (ownedDb) {
          try { ownedDb.close(); } catch { /* already closed */ }
        }
      }
    }

    // ── 2. Sessions (as markdown transcripts) ───────────────────────
    for (const ws of workspaces) {
      const sessionsDir = path.join(dataDir, 'workspaces', ws.id, 'sessions');
      if (!fs.existsSync(sessionsDir)) continue;

      try {
        const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));
        for (const file of files) {
          const filePath = path.join(sessionsDir, file);
          const sessionId = file.replace('.jsonl', '');
          try {
            const markdown = exportSessionToMarkdown(filePath, sessionId);
            archive.append(markdown, {
              name: `sessions/${ws.id}/${sessionId}.md`,
            });
          } catch {
            // Skip unreadable sessions
          }
        }
      } catch {
        // Skip inaccessible session directories
      }
    }

    // ── 3. Workspaces (configs) ─────────────────────────────────────
    for (const ws of workspaces) {
      archive.append(JSON.stringify(ws, null, 2), {
        name: `workspaces/${ws.id}.json`,
      });
    }

    // ── 4. Settings (with masked API keys) ──────────────────────────
    try {
      const config = new WaggleConfig(dataDir);
      const providers: Record<string, { apiKey: string; models: string[]; baseUrl?: string }> = {};

      // Get providers from vault (encrypted store)
      if (server.vault) {
        const vaultEntries = server.vault.list();
        for (const entry of vaultEntries) {
          const full = server.vault.get(entry.name);
          if (full) {
            providers[entry.name] = {
              apiKey: maskApiKey(full.value),
              models: (full.metadata?.models as string[]) ?? [],
              baseUrl: full.metadata?.baseUrl as string | undefined,
            };
          }
        }
      }

      // Fallback: config.json providers not in vault
      const configProviders = config.getProviders();
      for (const [name, entry] of Object.entries(configProviders)) {
        if (!providers[name]) {
          providers[name] = { ...entry, apiKey: maskApiKey(entry.apiKey) };
        }
      }

      const settings = {
        defaultModel: config.getDefaultModel(),
        providers,
        mindPath: config.getMindPath(),
        dataDir,
        exportedAt: new Date().toISOString(),
      };
      archive.append(JSON.stringify(settings, null, 2), { name: 'settings.json' });
    } catch {
      archive.append('{}', { name: 'settings.json' });
    }

    // ── 5. Vault metadata (names and types ONLY — NO secret values) ─
    try {
      if (server.vault) {
        const vaultEntries = server.vault.list();
        const metadata = vaultEntries.map(entry => ({
          name: entry.name,
          metadata: entry.metadata,
          updatedAt: entry.updatedAt,
        }));
        archive.append(JSON.stringify(metadata, null, 2), { name: 'vault-metadata.json' });
      } else {
        archive.append('[]', { name: 'vault-metadata.json' });
      }
    } catch {
      archive.append('[]', { name: 'vault-metadata.json' });
    }

    // ── 6. Telemetry (if any exists) ────────────────────────────────
    const telemetryDir = path.join(dataDir, 'telemetry');
    if (fs.existsSync(telemetryDir)) {
      try {
        const telemetryFiles = fs.readdirSync(telemetryDir);
        for (const file of telemetryFiles) {
          const filePath = path.join(telemetryDir, file);
          try {
            const stat = fs.statSync(filePath);
            if (stat.isFile()) {
              archive.file(filePath, { name: `telemetry/${file}` });
            }
          } catch {
            // Skip unreadable telemetry files
          }
        }
      } catch {
        // Skip telemetry directory issues
      }
    }

    // F2: Audit trail — export event
    emitAuditEvent(server, {
      workspaceId: scopedWorkspaceId ?? 'all',
      eventType: 'export',
      input: JSON.stringify({ scopedWorkspaceId }),
    });

    // Finalize archive
    archive.finalize();

    // Send response
    return reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', `attachment; filename="waggle-export-${today}.zip"`)
      .send(passthrough);
  });
};
