import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB, IdentityLayer } from '@waggle/core';
import { ensureIdentity } from '../src/auto-identity.js';

describe('ensureIdentity', () => {
  let db: MindDB;
  let identity: IdentityLayer;

  beforeEach(() => {
    db = new MindDB(':memory:');
    identity = new IdentityLayer(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates default identity when none exists', () => {
    expect(identity.exists()).toBe(false);

    ensureIdentity(identity);

    expect(identity.exists()).toBe(true);
    const id = identity.get();
    expect(id.name).toBe('Waggle');
    expect(id.role).toBe('AI assistant with persistent memory and web access');
    expect(id.personality).toContain('Direct, concise, helpful');
    expect(id.capabilities).toContain('persistent memory (.mind file)');
    expect(id.capabilities).toContain('task tracking');
  });

  it('does not overwrite existing identity', () => {
    identity.create({
      name: 'CustomBot',
      role: 'Custom role',
      department: 'Engineering',
      personality: 'Friendly',
      capabilities: 'custom cap',
      system_prompt: 'custom prompt',
    });

    ensureIdentity(identity);

    const id = identity.get();
    expect(id.name).toBe('CustomBot');
    expect(id.role).toBe('Custom role');
    expect(id.department).toBe('Engineering');
    expect(id.personality).toBe('Friendly');
    expect(id.capabilities).toBe('custom cap');
  });

  it('creates identity with custom config', () => {
    ensureIdentity(identity, {
      name: 'MyAgent',
      role: 'Research assistant',
      personality: 'Curious and thorough',
      capabilities: ['web search', 'data analysis'],
    });

    expect(identity.exists()).toBe(true);
    const id = identity.get();
    expect(id.name).toBe('MyAgent');
    expect(id.role).toBe('Research assistant');
    expect(id.personality).toBe('Curious and thorough');
    expect(id.capabilities).toBe('web search, data analysis');
  });

  it('uses defaults for omitted config fields', () => {
    ensureIdentity(identity, { name: 'PartialBot' });

    const id = identity.get();
    expect(id.name).toBe('PartialBot');
    // Other fields should be defaults
    expect(id.role).toBe('AI assistant with persistent memory and web access');
    expect(id.personality).toContain('Direct, concise, helpful');
  });
});
