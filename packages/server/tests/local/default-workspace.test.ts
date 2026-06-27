import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildLocalServer } from '../../src/local/index.js';

describe('local server default workspace wiring', () => {
  let tmpDir: string;
  let server: FastifyInstance | null = null;
  let previousEmbeddingProvider: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-default-workspace-'));
    previousEmbeddingProvider = process.env.EMBEDDING_PROVIDER;
    process.env.EMBEDDING_PROVIDER = 'mock';
  });

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
    if (previousEmbeddingProvider === undefined) {
      delete process.env.EMBEDDING_PROVIDER;
    } else {
      process.env.EMBEDDING_PROVIDER = previousEmbeddingProvider;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('activates the boot-created default workspace instead of the literal default id', async () => {
    server = await buildLocalServer({ dataDir: tmpDir });

    const defaultWorkspaceId = server.workspaceManager.getDefault();
    expect(defaultWorkspaceId).toBeTruthy();
    expect(server.agentState.activeWorkspaceId).toBe(defaultWorkspaceId);
    expect(server.agentState.getWorkspaceMindDb(defaultWorkspaceId!)).toBeTruthy();
    expect(server.agentState.getWorkspaceMindDb('default')).toBeNull();
  });
});
