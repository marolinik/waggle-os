import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../src/renderer.js';

describe('renderMarkdown', () => {
  it('renders bold text (no ** in output)', () => {
    const result = renderMarkdown('This is **bold** text');
    expect(result).not.toContain('**');
    expect(result).toContain('bold');
  });

  it('renders list items (has bullet)', () => {
    const result = renderMarkdown('- first item\n- second item');
    // The bullet character used by chalk
    expect(result).toContain('\u2022');
    expect(result).toContain('first item');
    expect(result).toContain('second item');
  });

  it('passes plain text through', () => {
    const input = 'Hello, this is just plain text.';
    const result = renderMarkdown(input);
    expect(result).toContain('Hello, this is just plain text.');
  });
});
