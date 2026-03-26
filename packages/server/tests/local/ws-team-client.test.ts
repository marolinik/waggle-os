import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WsTeamClient } from '../../src/local/ws-team-client.js';

// Mock the 'ws' module
vi.mock('ws', () => {
  const EventEmitter = require('node:events').EventEmitter;

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
  (globalThis as any).__lastMockWs = null;

  return {
    default: class extends MockWebSocket {
      constructor(_url: string) {
        super();
        (globalThis as any).__lastMockWs = this;
        // Simulate async open
        setTimeout(() => this.emit('open'), 5);
      }
    },
  };
});

function getLastWs(): any {
  return (globalThis as any).__lastMockWs;
}

describe('WsTeamClient', () => {
  const config = {
    serverUrl: 'http://team.example.com',
    token: 'test-jwt-token',
    teamSlug: 'my-team',
  };

  beforeEach(() => {
    (globalThis as any).__lastMockWs = null;
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
    const messages: any[] = [];
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
    const connected: any[] = [];
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
