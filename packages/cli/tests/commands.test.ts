import { describe, it, expect } from 'vitest';
import { parseCommand } from '../src/commands.js';

describe('parseCommand', () => {
  it('parses /model command with args', () => {
    const result = parseCommand('/model gpt-4o');
    expect(result).toEqual({ name: 'model', args: 'gpt-4o' });
  });

  it('parses /exit (no args)', () => {
    const result = parseCommand('/exit');
    expect(result).toEqual({ name: 'exit', args: '' });
  });

  it('parses /help', () => {
    const result = parseCommand('/help');
    expect(result).toEqual({ name: 'help', args: '' });
  });

  it('returns null for regular messages', () => {
    expect(parseCommand('hello world')).toBeNull();
    expect(parseCommand('what is the weather?')).toBeNull();
    expect(parseCommand('')).toBeNull();
    expect(parseCommand('  some text  ')).toBeNull();
  });

  it('parses /clear', () => {
    const result = parseCommand('/clear');
    expect(result).toEqual({ name: 'clear', args: '' });
  });

  it('parses /identity', () => {
    const result = parseCommand('/identity');
    expect(result).toEqual({ name: 'identity', args: '' });
  });
});
