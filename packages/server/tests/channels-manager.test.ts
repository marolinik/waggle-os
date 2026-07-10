/**
 * ChannelManager inbound pipeline — deny-by-default, /pair, /workspace,
 * /status, rate limiting, approval + error reply shapes (CHANNELS-ARC P1).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APPROVAL_NEEDED_REPLY, ChannelManager, PAIR_FAIL_REPLY, PAIR_OK_REPLY, sessionIdFor,
} from '../src/local/channels/manager.js';
import type { ChannelAdapter, ChannelMessage } from '../src/local/channels/types.js';

const noopLog = { info: () => undefined, warn: () => undefined };

class FakeAdapter implements ChannelAdapter {
  readonly platform = 'telegram' as const;
  sent: Array<{ chatId: string; text: string }> = [];
  running = false;
  async start(): Promise<void> { this.running = true; }
  async stop(): Promise<void> { this.running = false; }
  getStatus() {
    return { platform: this.platform, running: this.running, connected: this.running };
  }
  async send(chatId: string, text: string): Promise<void> {
    this.sent.push({ chatId, text });
  }
}

function msg(overrides: Partial<ChannelMessage> = {}): ChannelMessage {
  return {
    platform: 'telegram',
    chatId: 'chat-1',
    senderId: 'sender-1',
    text: 'hello',
    ...overrides,
  };
}

let dir: string;
let adapter: FakeAdapter;
let chatTurn: ReturnType<typeof vi.fn>;

function makeManager(extra: Partial<ConstructorParameters<typeof ChannelManager>[0]> = {}) {
  adapter = new FakeAdapter();
  chatTurn = vi.fn().mockResolvedValue({ content: 'agent says hi', approvalRequired: false });
  return new ChannelManager({
    dataDir: dir,
    port: 3333,
    vault: { get: () => ({ value: '12345678:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }) },
    log: noopLog,
    chatTurnImpl: chatTurn as never,
    adapterFactory: () => adapter,
    ...extra,
  });
}

async function pairAndStart(manager: ChannelManager, senderId = 'sender-1'): Promise<void> {
  await manager.start('telegram');
  const { code } = manager.pairing.generateCode('telegram');
  await manager.handleInbound(msg({ senderId, text: `/pair ${code}` }));
  adapter.sent = [];
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chmgr-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('deny-by-default', () => {
  it('ignores plain messages from unpaired senders — total silence', async () => {
    const manager = makeManager();
    await manager.start('telegram');
    await manager.handleInbound(msg({ text: 'hi agent' }));
    expect(adapter.sent).toEqual([]);
    expect(chatTurn).not.toHaveBeenCalled();
  });

  it('ignores commands (other than /pair) from unpaired senders', async () => {
    const manager = makeManager();
    await manager.start('telegram');
    await manager.handleInbound(msg({ text: '/status' }));
    await manager.handleInbound(msg({ text: '/workspace ws-x' }));
    expect(adapter.sent).toEqual([]);
  });
});

describe('/pair', () => {
  it('pairs a sender with a valid code and confirms', async () => {
    const manager = makeManager();
    await manager.start('telegram');
    const { code } = manager.pairing.generateCode('telegram');
    await manager.handleInbound(msg({ text: `/pair ${code}` }));
    expect(adapter.sent[0]?.text).toBe(PAIR_OK_REPLY);
    expect(manager.pairing.isPaired('telegram', 'sender-1')).toBe(true);
  });

  it('rejects a bad code and emits an audit event', async () => {
    const audits: Array<{ type: string }> = [];
    const manager = makeManager({ onAudit: e => { audits.push(e); } });
    await manager.start('telegram');
    await manager.handleInbound(msg({ text: '/pair WRONGCODE' }));
    expect(adapter.sent[0]?.text).toBe(PAIR_FAIL_REPLY);
    expect(manager.pairing.isPaired('telegram', 'sender-1')).toBe(false);
    expect(audits[0]?.type).toBe('channel_pair_failed');
  });
});

describe('paired conversation', () => {
  it('routes plain text through the chat turn and replies with content', async () => {
    const manager = makeManager();
    await pairAndStart(manager);
    await manager.handleInbound(msg({ text: 'what is on my plate today?' }));
    expect(chatTurn).toHaveBeenCalledWith(expect.objectContaining({
      message: 'what is on my plate today?',
      workspace: 'default',
      session: 'channel-telegram-chat-1',
      port: 3333,
    }));
    expect(adapter.sent[0]?.text).toBe('agent says hi');
  });

  it('uses the channel default workspace from config', async () => {
    const manager = makeManager();
    manager.pairing.setConfig('telegram', { enabled: true, defaultWorkspace: 'ws-main' });
    await pairAndStart(manager);
    await manager.handleInbound(msg());
    expect(chatTurn).toHaveBeenCalledWith(expect.objectContaining({ workspace: 'ws-main' }));
  });

  it('replies with the approval message when the turn stalls on approval', async () => {
    const manager = makeManager();
    await pairAndStart(manager);
    chatTurn.mockResolvedValueOnce({ content: '', approvalRequired: true });
    await manager.handleInbound(msg());
    expect(adapter.sent[0]?.text).toBe(APPROVAL_NEEDED_REPLY);
  });

  it('replies with a friendly error when the turn fails', async () => {
    const manager = makeManager();
    await pairAndStart(manager);
    chatTurn.mockResolvedValueOnce({ content: '', approvalRequired: false, error: 'boom' });
    await manager.handleInbound(msg());
    expect(adapter.sent[0]?.text).toContain('boom');
  });
});

describe('/workspace command', () => {
  it('shows the current workspace when called bare', async () => {
    const manager = makeManager();
    await pairAndStart(manager);
    await manager.handleInbound(msg({ text: '/workspace' }));
    expect(adapter.sent[0]?.text).toContain('Current workspace: default');
  });

  it('sets a per-chat override, validates against known workspaces, and clears', async () => {
    const manager = makeManager({ listWorkspaceIds: () => ['ws-a', 'ws-b'] });
    await pairAndStart(manager);

    await manager.handleInbound(msg({ text: '/workspace ws-nope' }));
    expect(adapter.sent[0]?.text).toContain('Unknown workspace');

    await manager.handleInbound(msg({ text: '/workspace ws-a' }));
    expect(manager.pairing.getWorkspaceOverride('telegram', 'chat-1')).toBe('ws-a');

    await manager.handleInbound(msg({ text: 'hi' }));
    expect(chatTurn).toHaveBeenCalledWith(expect.objectContaining({ workspace: 'ws-a' }));

    await manager.handleInbound(msg({ text: '/workspace default' }));
    expect(manager.pairing.getWorkspaceOverride('telegram', 'chat-1')).toBeUndefined();
  });

  it('scopes the override to the chat, not the sender', async () => {
    const manager = makeManager();
    await pairAndStart(manager);
    await manager.handleInbound(msg({ text: '/workspace ws-x' }));
    await manager.handleInbound(msg({ chatId: 'chat-2', text: 'hi' }));
    expect(chatTurn).toHaveBeenCalledWith(expect.objectContaining({ workspace: 'default' }));
  });
});

describe('rate limiting', () => {
  it('silently drops messages beyond 10/min per sender', async () => {
    const manager = makeManager();
    await pairAndStart(manager);
    for (let i = 0; i < 15; i++) {
      await manager.handleInbound(msg({ text: `msg ${i}` }));
    }
    // 1 of the 10-message budget was consumed by the /pair message itself.
    expect(chatTurn.mock.calls.length).toBe(9);
  });
});

describe('sessionIdFor', () => {
  it('normalizes chat ids into the safe-segment charset', () => {
    // '-' is legal in assertSafeSegment's charset, so negative ids pass through.
    expect(sessionIdFor({ platform: 'telegram', chatId: '-100123' }))
      .toBe('channel-telegram--100123');
    expect(sessionIdFor({ platform: 'slack', chatId: 'C01:AB' }))
      .toBe('channel-slack-C01_AB');
  });
});

describe('lifecycle', () => {
  it('start/stop/restart drive the adapter and statuses reflect it', async () => {
    const manager = makeManager();
    await manager.start('telegram');
    expect(adapter.running).toBe(true);
    expect(manager.getStatuses().find(s => s.platform === 'telegram')?.running).toBe(true);

    await manager.restartIfRunning('telegram');
    expect(adapter.running).toBe(true);

    await manager.stop('telegram');
    expect(adapter.running).toBe(false);
    expect(manager.getStatuses().find(s => s.platform === 'telegram')?.running).toBe(false);
  });

  it('startEnabled starts only platforms whose config says enabled', async () => {
    const manager = makeManager();
    manager.pairing.setConfig('telegram', { enabled: true, defaultWorkspace: 'default' });
    await manager.startEnabled();
    expect(adapter.running).toBe(true);
  });

  it('throws a clear error when a platform has no credentials', async () => {
    const manager = new ChannelManager({
      dataDir: dir,
      port: 3333,
      vault: { get: () => null },
      log: noopLog,
    });
    await expect(manager.start('telegram')).rejects.toThrow(/not configured/);
  });
});
