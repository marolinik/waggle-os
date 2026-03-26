import { describe, it, expect, vi } from 'vitest';
import { AgentMessageBus } from '../src/agent-message-bus.js';
import { createAgentCommsTools } from '../src/agent-comms-tools.js';

describe('AgentMessageBus', () => {
  it('send() delivers message to recipient workspace', () => {
    const bus = new AgentMessageBus();
    const id = bus.send({ from: 'ws-1', to: 'ws-2', content: 'Hello from ws-1' });

    expect(id).toBeTruthy();
    const messages = bus.receive('ws-2');
    expect(messages).toHaveLength(1);
    expect(messages[0].from).toBe('ws-1');
    expect(messages[0].content).toBe('Hello from ws-1');
  });

  it('receive() clears messages after read (one-shot)', () => {
    const bus = new AgentMessageBus();
    bus.send({ from: 'ws-1', to: 'ws-2', content: 'Message 1' });
    bus.send({ from: 'ws-1', to: 'ws-2', content: 'Message 2' });

    const first = bus.receive('ws-2');
    expect(first).toHaveLength(2);

    const second = bus.receive('ws-2');
    expect(second).toHaveLength(0);
  });

  it('messages have sender, recipient, content, timestamp', () => {
    const bus = new AgentMessageBus();
    bus.send({ from: 'ws-1', to: 'ws-2', content: 'Test' });

    const messages = bus.receive('ws-2');
    expect(messages[0].id).toBeTruthy();
    expect(messages[0].from).toBe('ws-1');
    expect(messages[0].to).toBe('ws-2');
    expect(messages[0].content).toBe('Test');
    expect(messages[0].timestamp).toBeGreaterThan(0);
  });

  it('request/response pattern with correlationId', () => {
    const bus = new AgentMessageBus();
    const requestId = bus.send({ from: 'ws-1', to: 'ws-2', content: 'What is X?' });
    const responseId = bus.reply(requestId, 'X is 42', 'ws-2', 'ws-1');

    const responses = bus.receive('ws-1');
    expect(responses).toHaveLength(1);
    expect(responses[0].correlationId).toBe(requestId);
    expect(responses[0].content).toBe('X is 42');
  });

  it('messages expire after TTL', () => {
    const bus = new AgentMessageBus();
    bus.send({ from: 'ws-1', to: 'ws-2', content: 'Expired', ttlMs: 1 });

    // Wait for expiry
    const start = Date.now();
    while (Date.now() - start < 5) { /* spin */ }

    const messages = bus.receive('ws-2');
    expect(messages).toHaveLength(0);
  });

  it('peek() shows messages without consuming them', () => {
    const bus = new AgentMessageBus();
    bus.send({ from: 'ws-1', to: 'ws-2', content: 'Peek test' });

    expect(bus.peek('ws-2')).toHaveLength(1);
    expect(bus.peek('ws-2')).toHaveLength(1); // Still there

    bus.receive('ws-2'); // Consume
    expect(bus.peek('ws-2')).toHaveLength(0);
  });

  it('cleanup() removes expired messages', () => {
    const bus = new AgentMessageBus();
    bus.send({ from: 'ws-1', to: 'ws-2', content: 'Expired', ttlMs: 1 });
    bus.send({ from: 'ws-1', to: 'ws-3', content: 'Still valid', ttlMs: 60000 });

    const start = Date.now();
    while (Date.now() - start < 5) { /* spin */ }

    const removed = bus.cleanup();
    expect(removed).toBe(1);
    expect(bus.peek('ws-3')).toHaveLength(1);
  });

  it('pendingCount() returns message count', () => {
    const bus = new AgentMessageBus();
    bus.send({ from: 'ws-1', to: 'ws-2', content: 'A' });
    bus.send({ from: 'ws-1', to: 'ws-2', content: 'B' });

    expect(bus.pendingCount('ws-2')).toBe(2);
    expect(bus.pendingCount('ws-3')).toBe(0);
  });
});

describe('send_agent_message tool', () => {
  it('sends message to another workspace agent', async () => {
    const bus = new AgentMessageBus();
    const tools = createAgentCommsTools(bus, 'ws-1');
    const sendTool = tools.find(t => t.name === 'send_agent_message')!;

    const result = JSON.parse(await sendTool.execute({ workspace: 'ws-2', message: 'Research findings' }));
    expect(result.success).toBe(true);
    expect(result.messageId).toBeTruthy();

    // Verify message arrived
    const messages = bus.receive('ws-2');
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('Research findings');
  });

  it('rejects sending to self', async () => {
    const bus = new AgentMessageBus();
    const tools = createAgentCommsTools(bus, 'ws-1');
    const sendTool = tools.find(t => t.name === 'send_agent_message')!;

    const result = JSON.parse(await sendTool.execute({ workspace: 'ws-1', message: 'Self' }));
    expect(result.success).toBe(false);
    expect(result.error).toContain('yourself');
  });

  it('fails if target workspace is not active', async () => {
    const bus = new AgentMessageBus();
    const tools = createAgentCommsTools(bus, 'ws-1', (id) => id === 'ws-1');
    const sendTool = tools.find(t => t.name === 'send_agent_message')!;

    const result = JSON.parse(await sendTool.execute({ workspace: 'ws-2', message: 'Hello' }));
    expect(result.success).toBe(false);
    expect(result.error).toContain('not active');
  });
});

describe('check_agent_messages tool', () => {
  it('returns pending messages and consumes them', async () => {
    const bus = new AgentMessageBus();
    bus.send({ from: 'ws-2', to: 'ws-1', content: 'Here are the findings' });

    const tools = createAgentCommsTools(bus, 'ws-1');
    const checkTool = tools.find(t => t.name === 'check_agent_messages')!;

    const result = JSON.parse(await checkTool.execute({}));
    expect(result.count).toBe(1);
    expect(result.messages[0].from).toBe('ws-2');
    expect(result.messages[0].content).toBe('Here are the findings');

    // Second check should be empty (consumed)
    const result2 = JSON.parse(await checkTool.execute({}));
    expect(result2.count).toBe(0);
  });
});
