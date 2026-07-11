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
    sessionToken: 'test-session-token',
    vault: {
      get: () => ({ value: '12345678:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }),
      has: () => true,
      set: () => undefined,
      delete: () => false,
    },
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
      session: 'channel-v2-telegram-Y2hhdC0x',
      port: 3333,
      sessionToken: 'test-session-token',
      proposeHeld: true,
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

  it('suppresses a redelivered platform message id', async () => {
    const manager = makeManager();
    await pairAndStart(manager);
    const inbound = msg({ text: 'only once', messageId: 'message-1' });

    await manager.handleInbound(inbound);
    await manager.handleInbound(inbound);

    expect(chatTurn).toHaveBeenCalledTimes(1);
    expect(adapter.sent).toHaveLength(1);
  });

  it('serializes overlapping turns in the same chat', async () => {
    const manager = makeManager();
    await pairAndStart(manager);
    let releaseFirst!: () => void;
    chatTurn.mockImplementationOnce(() => new Promise(resolve => {
      releaseFirst = () => resolve({ content: 'first reply', approvalRequired: false });
    }));
    chatTurn.mockResolvedValueOnce({ content: 'second reply', approvalRequired: false });

    const first = manager.handleInbound(msg({ text: 'first', messageId: 'ordered-1' }));
    const second = manager.handleInbound(msg({ text: 'second', messageId: 'ordered-2' }));
    await new Promise(resolve => setImmediate(resolve));
    expect(chatTurn).toHaveBeenCalledTimes(1);

    releaseFirst();
    await Promise.all([first, second]);
    expect(chatTurn.mock.calls.map(call => call[0].message)).toEqual(['first', 'second']);
    expect(adapter.sent.map(sent => sent.text)).toEqual(['first reply', 'second reply']);
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

  it('accepts a human workspace name and stores its stable id', async () => {
    const manager = makeManager({
      listWorkspaces: () => [
        { id: 'ws-a', name: 'Client Alpha' },
        { id: 'ws-b', name: 'Internal Ops' },
      ],
    } as never);
    await pairAndStart(manager);

    await manager.handleInbound(msg({ text: '/workspace Client Alpha' }));

    expect(manager.pairing.getWorkspaceOverride('telegram', 'chat-1')).toBe('ws-a');
    expect(adapter.sent[0]?.text).toContain('Client Alpha');
  });
});

describe('/status command', () => {
  it('shows a human workspace name while retaining its stable id', async () => {
    const manager = makeManager({
      listWorkspaces: () => [{ id: 'ws-main', name: 'Client Alpha' }],
    });
    manager.pairing.setConfig('telegram', { enabled: true, defaultWorkspace: 'ws-main' });
    await pairAndStart(manager);

    await manager.handleInbound(msg({ text: '/status' }));

    expect(adapter.sent[0]?.text).toContain('Workspace: Client Alpha (ws-main)');
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
  it('encodes chat ids into unique safe path segments without punctuation collisions', () => {
    const first = sessionIdFor({ platform: 'slack', chatId: 'C01:AB' });
    const second = sessionIdFor({ platform: 'slack', chatId: 'C01/AB' });

    expect(first).toMatch(/^channel-v2-slack-[a-zA-Z0-9_-]+$/);
    expect(second).toMatch(/^channel-v2-slack-[a-zA-Z0-9_-]+$/);
    expect(first).not.toBe(second);
    expect(sessionIdFor({ platform: 'telegram', chatId: '-100123' }))
      .toBe('channel-v2-telegram-LTEwMDEyMw');
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

  it('passes REAL channel meta to the chat turn — delivery target for ai_task (#17)', async () => {
    const manager = makeManager();
    await pairAndStart(manager);
    await manager.handleInbound(msg({ chatId: '-100 42', text: 'schedule this daily' }));
    expect(chatTurn).toHaveBeenCalledWith(expect.objectContaining({
      channel: { platform: 'telegram', chatId: '-100 42' }, // un-normalized
      session: sessionIdFor({ platform: 'telegram', chatId: '-100 42' }),
    }));
    // and never as an automation turn — inbound IM is a real user turn (#13)
    expect(chatTurn.mock.calls[0][0].origin).toBeUndefined();
  });

  it('sendTo delivers via the running adapter, returns false when absent (#17)', async () => {
    const manager = makeManager();
    await manager.start('telegram');
    expect(await manager.sendTo('telegram', 'chat-9', 'result text')).toBe(true);
    expect(adapter.sent).toEqual([{ chatId: 'chat-9', text: 'result text' }]);
    expect(await manager.sendTo('discord', 'c', 'x')).toBe(false);
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
      sessionToken: 'test-session-token',
      vault: { get: () => null, has: () => false, set: () => undefined, delete: () => false },
      log: noopLog,
    });
    await expect(manager.start('telegram')).rejects.toThrow(/not configured/);
  });
});
