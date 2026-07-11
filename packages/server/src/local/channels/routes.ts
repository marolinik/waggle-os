/**
 * /api/channels — IM channel management surface for Settings UI.
 *
 * Everything here is local-app-only (isLocalRequest guard): these routes
 * mint pairing codes and write bot tokens, i.e. they gate who can talk to
 * an agent with tools. Secrets go to the vault; reads come back masked.
 */

import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { createLogger } from '../logger.js';
import { isLocalRequest } from '../origin-guard.js';
import { emitAuditEvent } from '../routes/events.js';
import { CHANNEL_VAULT_KEYS, ChannelManager } from './manager.js';
import { isChannelPlatform, type ChannelPlatform } from './types.js';

const log = createLogger('channels');

declare module 'fastify' {
  interface FastifyInstance {
    channelManager?: ChannelManager;
  }
}

function requireLocal(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!isLocalRequest(request)) {
    void reply.status(403).send({ error: 'Local app only' });
    return false;
  }
  return true;
}

function requireManager(server: FastifyInstance, reply: FastifyReply): ChannelManager | null {
  const manager = server.channelManager;
  if (!manager) {
    void reply.status(503).send({ error: 'Channel manager not initialized' });
    return null;
  }
  return manager;
}

function parsePlatform(raw: string, reply: FastifyReply): ChannelPlatform | null {
  if (!isChannelPlatform(raw)) {
    void reply.status(400).send({ error: `Unknown platform: ${raw}` });
    return null;
  }
  return raw;
}

/** Mask a secret for status display: first 4 chars + length hint. */
function mask(value: string | null | undefined): string | null {
  if (!value) return null;
  return `${value.slice(0, 4)}…(${value.length})`;
}

export const channelRoutes: FastifyPluginAsync = async (server) => {
  // ── Status / listing ─────────────────────────────────────────────────
  server.get('/api/channels', async (request, reply) => {
    if (!requireLocal(request, reply)) return;
    const manager = requireManager(server, reply);
    if (!manager) return;
    const statuses = manager.getStatuses();
    return statuses.map(s => {
      const config = manager.pairing.getConfig(s.platform);
      const secrets: Record<string, string | null> = {};
      for (const key of CHANNEL_VAULT_KEYS[s.platform]) {
        let v: string | null = null;
        try { v = server.vault?.get(key)?.value ?? null; } catch { /* vault locked */ }
        secrets[key] = mask(v);
      }
      return { ...s, config, secrets };
    });
  });

  // ── Config (non-secret → store, secrets → vault) ─────────────────────
  server.post<{
    Params: { platform: string };
    Body: {
      enabled?: boolean;
      defaultWorkspace?: string;
      /** Vault writes, keyed by CHANNEL_VAULT_KEYS entries. */
      secrets?: Record<string, string>;
    };
  }>('/api/channels/:platform/config', async (request, reply) => {
    if (!requireLocal(request, reply)) return;
    const manager = requireManager(server, reply);
    if (!manager) return;
    const platform = parsePlatform(request.params.platform, reply);
    if (!platform) return;

    const { enabled, defaultWorkspace, secrets } = request.body ?? {};

    if (enabled !== undefined && typeof enabled !== 'boolean') {
      return reply.status(400).send({ error: 'enabled must be a boolean' });
    }

    let validatedWorkspace = defaultWorkspace;
    if (defaultWorkspace !== undefined) {
      if (typeof defaultWorkspace !== 'string' || !defaultWorkspace.trim() || defaultWorkspace.length > 200) {
        return reply.status(400).send({ error: 'defaultWorkspace must be a valid workspace id' });
      }
      validatedWorkspace = defaultWorkspace.trim();
      const workspaceExists = server.workspaceManager?.list()
        .some(workspace => workspace.id === validatedWorkspace);
      if (!workspaceExists) {
        return reply.status(400).send({ error: `Unknown workspace: ${validatedWorkspace}` });
      }
    }

    if (secrets !== undefined && (!secrets || typeof secrets !== 'object' || Array.isArray(secrets))) {
      return reply.status(400).send({ error: 'secrets must be an object' });
    }

    const secretEntries = Object.entries(secrets ?? {});
    if (secretEntries.length > 0) {
      const allowed = new Set(CHANNEL_VAULT_KEYS[platform]);
      for (const [key, value] of secretEntries) {
        if (!allowed.has(key)) {
          return reply.status(400).send({ error: `Unknown secret key for ${platform}: ${key}` });
        }
        if (typeof value !== 'string' || value.length === 0 || value.length > 512) {
          return reply.status(400).send({ error: `Invalid value for ${key}` });
        }
      }
      if (!server.vault) return reply.status(503).send({ error: 'Vault is not available' });
    }

    for (const [key, value] of secretEntries) {
      server.vault!.set(key, value, { credentialType: 'api_key' });
    }

    const current = manager.pairing.getConfig(platform);
    const next = {
      enabled: enabled ?? current.enabled,
      defaultWorkspace: validatedWorkspace ?? current.defaultWorkspace,
    };
    manager.pairing.setConfig(platform, next);
    log.info(`[channels] ${platform} config updated (enabled=${next.enabled})`);
    emitAuditEvent(server, {
      workspaceId: next.defaultWorkspace,
      eventType: 'channel_config_change',
      input: JSON.stringify({
        platform,
        enabled: next.enabled,
        defaultWorkspace: next.defaultWorkspace,
        secretKeysUpdated: secretEntries.map(([key]) => key),
      }),
    });

    await manager.restartIfRunning(platform).catch(e => {
      log.warn(`[channels] ${platform} restart after config change failed: ${e instanceof Error ? e.message : e}`);
    });
    return { ok: true, config: next };
  });

  // ── Lifecycle ────────────────────────────────────────────────────────
  server.post<{ Params: { platform: string } }>('/api/channels/:platform/start', async (request, reply) => {
    if (!requireLocal(request, reply)) return;
    const manager = requireManager(server, reply);
    if (!manager) return;
    const platform = parsePlatform(request.params.platform, reply);
    if (!platform) return;
    try {
      const status = await manager.start(platform);
      return { ok: true, status };
    } catch (e: unknown) {
      return reply.status(400).send({ ok: false, error: e instanceof Error ? e.message : 'start failed' });
    }
  });

  server.post<{ Params: { platform: string } }>('/api/channels/:platform/stop', async (request, reply) => {
    if (!requireLocal(request, reply)) return;
    const manager = requireManager(server, reply);
    if (!manager) return;
    const platform = parsePlatform(request.params.platform, reply);
    if (!platform) return;
    await manager.stop(platform);
    return { ok: true };
  });

  // ── Pairing ──────────────────────────────────────────────────────────
  server.post<{ Body: { platform?: string } }>('/api/channels/pairing-code', async (request, reply) => {
    if (!requireLocal(request, reply)) return;
    const manager = requireManager(server, reply);
    if (!manager) return;
    const platform = parsePlatform(request.body?.platform ?? '', reply);
    if (!platform) return;
    const { code, expiresAt } = manager.pairing.generateCode(platform);
    log.info(`[channels] pairing code minted for ${platform}`);
    return { code, expiresAt };
  });

  server.get('/api/channels/pairing', async (request, reply) => {
    if (!requireLocal(request, reply)) return;
    const manager = requireManager(server, reply);
    if (!manager) return;
    return manager.pairing.listPaired();
  });

  server.delete<{
    Body: { platform?: string; senderId?: string };
  }>('/api/channels/pairing', async (request, reply) => {
    if (!requireLocal(request, reply)) return;
    const manager = requireManager(server, reply);
    if (!manager) return;
    const platform = parsePlatform(request.body?.platform ?? '', reply);
    if (!platform) return;
    const senderId = request.body?.senderId;
    if (!senderId) return reply.status(400).send({ error: 'senderId is required' });
    const removed = manager.pairing.unpair(platform, senderId);
    if (removed) {
      emitAuditEvent(server, {
        workspaceId: 'default',
        eventType: 'channel_unpair',
        input: JSON.stringify({ platform, senderId }),
      });
    }
    return { ok: removed };
  });
};
