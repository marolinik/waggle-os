/**
 * Pins REST API Routes — pin/favorite messages within a workspace.
 *
 * Endpoints:
 *   GET    /api/workspaces/:id/pins          — list pins for workspace
 *   POST   /api/workspaces/:id/pins          — add pin
 *   DELETE /api/workspaces/:id/pins/:pinId   — remove pin
 *
 * Pins are stored in a JSON file at ~/.waggle/workspaces/{id}/pins.json.
 * Part of Wave 5 — Visibility & Polish.
 */

import type { FastifyPluginAsync } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export interface PinnedItem {
  id: string;
  workspaceId: string;
  messageContent: string;
  messageRole: 'assistant' | 'user';
  pinnedAt: string;
  label?: string;
  /** W7.4: Draft/Final output status */
  status?: 'draft' | 'final';
}

/** Resolve the pins.json path for a workspace. */
function pinsFilePath(workspaceId: string): string {
  return path.join(os.homedir(), '.waggle', 'workspaces', workspaceId, 'pins.json');
}

/** Read pins from disk. Returns empty array if file doesn't exist. */
function readPins(workspaceId: string): PinnedItem[] {
  const filePath = pinsFilePath(workspaceId);
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as PinnedItem[];
    }
  } catch {
    // Corrupted file — return empty
  }
  return [];
}

/** Write pins to disk. Creates directory if needed. */
function writePins(workspaceId: string, pins: PinnedItem[]): void {
  const filePath = pinsFilePath(workspaceId);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(pins, null, 2), 'utf-8');
}

export const pinRoutes: FastifyPluginAsync = async (server) => {
  // GET /api/workspaces/:id/pins — list pins for workspace
  server.get<{
    Params: { id: string };
  }>('/api/workspaces/:id/pins', async (request) => {
    const { id } = request.params;
    const pins = readPins(id);
    return { pins };
  });

  // POST /api/workspaces/:id/pins — add pin
  server.post<{
    Params: { id: string };
    Body: {
      messageContent: string;
      messageRole: 'assistant' | 'user';
      label?: string;
    };
  }>('/api/workspaces/:id/pins', async (request, reply) => {
    const { id } = request.params;
    const { messageContent, messageRole, label } = request.body ?? {};

    if (!messageContent || !messageRole) {
      return reply.status(400).send({ error: 'messageContent and messageRole are required' });
    }

    if (messageRole !== 'assistant' && messageRole !== 'user') {
      return reply.status(400).send({ error: 'messageRole must be "assistant" or "user"' });
    }

    const pins = readPins(id);
    const pin: PinnedItem = {
      id: crypto.randomUUID(),
      workspaceId: id,
      messageContent,
      messageRole,
      pinnedAt: new Date().toISOString(),
      label,
    };
    pins.push(pin);
    writePins(id, pins);

    return reply.status(201).send({ pin });
  });

  // PATCH /api/workspaces/:id/pins/:pinId — update pin status (W7.4)
  server.patch<{
    Params: { id: string; pinId: string };
    Body: { status?: 'draft' | 'final'; label?: string };
  }>('/api/workspaces/:id/pins/:pinId', async (request, reply) => {
    const { id, pinId } = request.params;
    const { status, label } = request.body ?? {};

    if (status && status !== 'draft' && status !== 'final') {
      return reply.status(400).send({ error: 'status must be "draft" or "final"' });
    }

    const pins = readPins(id);
    const pin = pins.find(p => p.id === pinId);
    if (!pin) {
      return reply.status(404).send({ error: 'Pin not found' });
    }

    if (status !== undefined) pin.status = status;
    if (label !== undefined) pin.label = label;

    writePins(id, pins);
    return { pin };
  });

  // DELETE /api/workspaces/:id/pins/:pinId — remove pin
  server.delete<{
    Params: { id: string; pinId: string };
  }>('/api/workspaces/:id/pins/:pinId', async (request, reply) => {
    const { id, pinId } = request.params;
    const pins = readPins(id);
    const idx = pins.findIndex(p => p.id === pinId);
    if (idx === -1) {
      return reply.status(404).send({ error: 'Pin not found' });
    }
    pins.splice(idx, 1);
    writePins(id, pins);
    return { ok: true };
  });
};
