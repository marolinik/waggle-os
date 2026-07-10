/**
 * PairingStore — deny-by-default pairing, code lifecycle, workspace
 * overrides, and channels.json persistence (CHANNELS-ARC P1).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PairingStore, PAIRING_CODE_TTL_MS } from '../src/local/channels/pairing.js';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-channels-'));
});

afterEach(() => {
  vi.useRealTimers();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('PairingStore codes', () => {
  it('generates an 8-char unambiguous code with a 10-minute expiry', () => {
    const store = new PairingStore(dir);
    const before = Date.now();
    const { code, expiresAt } = store.generateCode('telegram');
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(expiresAt).toBeGreaterThanOrEqual(before + PAIRING_CODE_TTL_MS - 1000);
  });

  it('consumes a valid code exactly once and pairs the sender', () => {
    const store = new PairingStore(dir);
    const { code } = store.generateCode('telegram');
    expect(store.consumeCode('telegram', code, 'user-1', 'marko')).toBe(true);
    expect(store.isPaired('telegram', 'user-1')).toBe(true);
    // Single-use: second redemption fails.
    expect(store.consumeCode('telegram', code, 'user-2')).toBe(false);
    expect(store.isPaired('telegram', 'user-2')).toBe(false);
  });

  it('is case-insensitive on redemption (phone keyboards autocapitalize)', () => {
    const store = new PairingStore(dir);
    const { code } = store.generateCode('telegram');
    expect(store.consumeCode('telegram', code.toLowerCase(), 'user-1')).toBe(true);
  });

  it('rejects a code minted for another platform', () => {
    const store = new PairingStore(dir);
    const { code } = store.generateCode('discord');
    expect(store.consumeCode('telegram', code, 'user-1')).toBe(false);
  });

  it('rejects expired codes', () => {
    vi.useFakeTimers();
    const store = new PairingStore(dir);
    const { code } = store.generateCode('telegram');
    vi.advanceTimersByTime(PAIRING_CODE_TTL_MS + 1000);
    expect(store.consumeCode('telegram', code, 'user-1')).toBe(false);
  });

  it('rejects garbage codes without pairing', () => {
    const store = new PairingStore(dir);
    expect(store.consumeCode('telegram', 'NOTACODE', 'user-1')).toBe(false);
    expect(store.isPaired('telegram', 'user-1')).toBe(false);
  });
});

describe('PairingStore persistence', () => {
  it('persists allowlist across store instances (channels.json)', () => {
    const a = new PairingStore(dir);
    const { code } = a.generateCode('telegram');
    a.consumeCode('telegram', code, 'user-1', 'marko');

    const b = new PairingStore(dir);
    expect(b.isPaired('telegram', 'user-1')).toBe(true);
    expect(b.listPaired().telegram?.[0]?.senderName).toBe('marko');
  });

  it('does NOT persist pending codes (in-memory only)', () => {
    const a = new PairingStore(dir);
    const { code } = a.generateCode('telegram');
    const b = new PairingStore(dir);
    expect(b.consumeCode('telegram', code, 'user-1')).toBe(false);
  });

  it('never writes secrets: channels.json contains no token-like keys', () => {
    const store = new PairingStore(dir);
    store.setConfig('telegram', { enabled: true, defaultWorkspace: 'ws-1' });
    const raw = fs.readFileSync(path.join(dir, 'channels', 'channels.json'), 'utf8');
    expect(raw).not.toMatch(/token|secret|password/i);
  });

  it('survives a corrupt channels.json by starting empty', () => {
    fs.mkdirSync(path.join(dir, 'channels'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'channels', 'channels.json'), '{corrupt', 'utf8');
    const store = new PairingStore(dir);
    expect(store.isPaired('telegram', 'anyone')).toBe(false);
    expect(store.getConfig('telegram')).toEqual({ enabled: false, defaultWorkspace: 'default' });
  });
});

describe('PairingStore unpair + overrides + config', () => {
  it('unpairs a sender and reports whether anything was removed', () => {
    const store = new PairingStore(dir);
    const { code } = store.generateCode('telegram');
    store.consumeCode('telegram', code, 'user-1');
    expect(store.unpair('telegram', 'user-1')).toBe(true);
    expect(store.isPaired('telegram', 'user-1')).toBe(false);
    expect(store.unpair('telegram', 'user-1')).toBe(false);
  });

  it('stores, persists, and clears per-chat workspace overrides', () => {
    const a = new PairingStore(dir);
    a.setWorkspaceOverride('telegram', 'chat-9', 'ws-research');
    expect(new PairingStore(dir).getWorkspaceOverride('telegram', 'chat-9')).toBe('ws-research');
    a.setWorkspaceOverride('telegram', 'chat-9', null);
    expect(a.getWorkspaceOverride('telegram', 'chat-9')).toBeUndefined();
  });

  it('defaults config to disabled/default workspace and persists updates', () => {
    const a = new PairingStore(dir);
    expect(a.getConfig('slack')).toEqual({ enabled: false, defaultWorkspace: 'default' });
    a.setConfig('slack', { enabled: true, defaultWorkspace: 'ws-team' });
    expect(new PairingStore(dir).getConfig('slack')).toEqual({ enabled: true, defaultWorkspace: 'ws-team' });
  });
});
