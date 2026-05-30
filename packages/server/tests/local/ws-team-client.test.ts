import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { WsTeamClient } from '../../src/local/ws-team-client.js';

/** Shape of the mock WebSocket the test inspects. */
interface MockWs extends EventEmitter {
  readyState: number;
  sent: string[];
  send(data: string): void;
  close(): void;
}

/** Typed accessor for the last mock WebSocket instance stashed on globalThis. */
const globalWithMock = globalThis as typeof globalThis & {
  __lastMockWs: MockWs | null;
};

// Mock the 'ws' module
vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events');

  class MockWebSocket extends EventEmitter {
    readyState = 1; // OPEN
    sent: string[] = [];

    send(data: string) {
      this.sent.push(data);
    }

    close() {
      this.readyState = 3; // CLOSED
      this.emit('close');
    }
  }

  // Store last instance for test access
  (globalThis as typeof globalThis & { __lastMockWs: MockWs | null }).__lastMockWs = null;

  return {
    default: class extends MockWebSocket {
      constructor(_url: string) {
        super();
        (globalThis as typeof globalThis & { __lastMockWs: MockWs | null }).__lastMockWs = this;
        // Simulate async open
        setTimeout(() => this.emit('open'), 5);
      }
    },
  };
});

function getLastWs(): MockWs {
  const ws = globalWithMock.__lastMockWs;
  if (!ws) throw new Error('No mock WebSocket instance available');
  return ws;
}

describe('WsTeamClient', () => {
  const config = {
    serverUrl: 'http://team.example.com',
    token: 'test-jwt-token',
    teamSlug: 'my-team',
  };

  beforeEach(() => {
    globalWithMock.__lastMockWs = null;
  });

  it('stores config in constructor', () => {
    const client = new WsTeamClient(config);
    expect(client).toBeDefined();
    expect(client.isConnected()).toBe(false);
  });

  it('sends authenticate on WebSocket open', async () => {
    const client = new WsTeamClient(config);
    await client.connect();

    // Wait for 'open' event
    await new Promise(r => setTimeout(r, 20));

    const ws = getLastWs();
    expect(ws).toBeTruthy();
    expect(ws.sent.length).toBeGreaterThanOrEqual(1);

    const authMsg = JSON.parse(ws.sent[0]);
    expect(authMsg.type).toBe('authenticate');
    expect(authMsg.token).toBe('test-jwt-token');

    client.disconnect();
  });

  it('sends join_team after authenticated response', async () => {
    const client = new WsTeamClient(config);
    await client.connect();
    await new Promise(r => setTimeout(r, 20));

    const ws = getLastWs();

    // Simulate server responding with authenticated
    ws.emit('message', JSON.stringify({ type: 'authenticated', userId: 'user-123' }));

    // Should have sent join_team
    const joinMsg = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(joinMsg.type).toBe('join_team');
    expect(joinMsg.teamSlug).toBe('my-team');

    client.disconnect();
  });

  it('emits message event on waggle_message', async () => {
    const client = new WsTeamClient(config);
    const messages: unknown[] = [];
    client.on('message', (msg) => messages.push(msg));

    await client.connect();
    await new Promise(r => setTimeout(r, 20));

    const ws = getLastWs();

    // Simulate waggle_message
    const testMessage = { type: 'request', subtype: 'knowledge_check', content: { query: 'test' } };
    ws.emit('message', JSON.stringify({ type: 'waggle_message', message: testMessage }));

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(testMessage);

    client.disconnect();
  });

  it('emits connected event on joined_team', async () => {
    const client = new WsTeamClient(config);
    const connected: Array<{ teamSlug?: string }> = [];
    client.on('connected', (data) => connected.push(data));

    await client.connect();
    await new Promise(r => setTimeout(r, 20));

    const ws = getLastWs();

    // Full protocol flow
    ws.emit('message', JSON.stringify({ type: 'authenticated', userId: 'user-123' }));
    ws.emit('message', JSON.stringify({ type: 'joined_team', teamSlug: 'my-team' }));

    expect(connected).toHaveLength(1);
    expect(connected[0].teamSlug).toBe('my-team');

    client.disconnect();
  });

  it('isConnected returns true after authentication', async () => {
    const client = new WsTeamClient(config);

    expect(client.isConnected()).toBe(false);

    await client.connect();
    await new Promise(r => setTimeout(r, 20));

    const ws = getLastWs();
    ws.emit('message', JSON.stringify({ type: 'authenticated', userId: 'user-123' }));

    expect(client.isConnected()).toBe(true);

    client.disconnect();
    expect(client.isConnected()).toBe(false);
  });

  it('disconnect stops reconnection and closes WebSocket', async () => {
    const client = new WsTeamClient(config);
    await client.connect();
    await new Promise(r => setTimeout(r, 20));

    client.disconnect();

    expect(client.isConnected()).toBe(false);
  });

  it('handles invalid JSON messages gracefully', async () => {
    const client = new WsTeamClient(config);
    await client.connect();
    await new Promise(r => setTimeout(r, 20));

    const ws = getLastWs();

    // Should not throw
    ws.emit('message', 'not-json{{{');
    ws.emit('message', '');

    client.disconnect();
  });
});
