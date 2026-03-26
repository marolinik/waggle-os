import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RpcHandler } from '../../sidecar/src/rpc-handler.js';
import { MindDB, IdentityLayer } from '@waggle/core';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('RPC Handler', () => {
  let handler: RpcHandler;
  let dbPath: string;
  let db: MindDB;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `waggle-rpc-test-${Date.now()}.mind`);
    db = new MindDB(dbPath);
    handler = new RpcHandler(db);
  });

  afterEach(() => {
    db.close();
    try {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    } catch {
      // Windows file lock
    }
  });

  it('handles ping method', async () => {
    const result = await handler.handle({
      jsonrpc: '2.0',
      method: 'ping',
      id: 1,
    });
    expect(result).toEqual({
      jsonrpc: '2.0',
      result: { status: 'ok' },
      id: 1,
    });
  });

  it('handles mind.getIdentity', async () => {
    const identity = new IdentityLayer(db);
    identity.create({
      name: 'TestBot',
      role: 'assistant',
      department: '',
      personality: '',
      capabilities: '',
      system_prompt: '',
    });

    const result = await handler.handle({
      jsonrpc: '2.0',
      method: 'mind.getIdentity',
      id: 2,
    });
    expect(result.result).toContain('TestBot');
  });

  it('handles mind.getAwareness', async () => {
    const result = await handler.handle({
      jsonrpc: '2.0',
      method: 'mind.getAwareness',
      id: 3,
    });
    expect(result.result).toBeDefined();
  });

  it('returns error for unknown method', async () => {
    const result = await handler.handle({
      jsonrpc: '2.0',
      method: 'nonexistent',
      id: 4,
    });
    expect(result.error).toBeDefined();
    expect(result.error!.code).toBe(-32601);
  });

  it('handles chat.send with stub response', async () => {
    const result = await handler.handle({
      jsonrpc: '2.0',
      method: 'chat.send',
      params: { message: 'hello' },
      id: 5,
    });
    expect(result.result).toBeDefined();
  });

  it('handles settings.get', async () => {
    const result = await handler.handle({
      jsonrpc: '2.0',
      method: 'settings.get',
      id: 6,
    });
    expect(result.result).toBeDefined();
  });

  it('handles settings.set', async () => {
    const result = await handler.handle({
      jsonrpc: '2.0',
      method: 'settings.set',
      params: { key: 'model', value: 'claude-sonnet-4-6' },
      id: 7,
    });
    expect(result.result).toEqual({ success: true });
  });
});
