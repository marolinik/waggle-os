import { describe, it, expect } from 'vitest';
import { routeMessage } from '../src/smart-router.js';

describe('routeMessage', () => {
  const primary = 'claude-sonnet-4-6';
  const budget = 'qwen/qwen3.6-plus:free';

  it('routes simple short message to budget model', () => {
    const result = routeMessage('What time is it?', primary, budget);
    expect(result.model).toBe(budget);
    expect(result.reason).toBe('simple_turn');
  });

  it('routes complex message to primary model', () => {
    const result = routeMessage('Implement a REST API with JWT authentication and role-based access control', primary, budget);
    expect(result.model).toBe(primary);
    expect(result.reason).toBe('normal');
  });

  it('routes message with code blocks to primary', () => {
    const result = routeMessage('Fix this:\n```\nconst x = 1;\n```', primary, budget);
    expect(result.model).toBe(primary);
  });

  it('routes message with URL to primary', () => {
    const result = routeMessage('Check https://example.com for errors', primary, budget);
    expect(result.model).toBe(primary);
  });

  it('routes message with debug keywords to primary', () => {
    const result = routeMessage('debug this error please', primary, budget);
    expect(result.model).toBe(primary);
  });

  it('routes long message to primary', () => {
    const result = routeMessage('word '.repeat(100), primary, budget);
    expect(result.model).toBe(primary);
  });

  it('routes multi-line message to primary', () => {
    const result = routeMessage('line one\nline two\nline three\nline four', primary, budget);
    expect(result.model).toBe(primary);
  });

  it('returns primary when budget model is null', () => {
    const result = routeMessage('Hello', primary, null);
    expect(result.model).toBe(primary);
    expect(result.reason).toBe('normal');
  });

  it('routes greeting to budget', () => {
    const result = routeMessage('Hi there!', primary, budget);
    expect(result.model).toBe(budget);
    expect(result.reason).toBe('simple_turn');
  });

  it('routes translation request to budget', () => {
    const result = routeMessage('Translate "hello" to Serbian', primary, budget);
    expect(result.model).toBe(budget);
    expect(result.reason).toBe('simple_turn');
  });

  it('routes message with backtick to primary', () => {
    const result = routeMessage('What does `useState` do?', primary, budget);
    expect(result.model).toBe(primary);
  });
});
