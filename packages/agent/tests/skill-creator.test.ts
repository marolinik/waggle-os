import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { generateSkillMarkdown, detectWorkflowPattern, type SkillTemplate } from '../src/skill-creator.js';
import { shouldSuggestCapture } from '../src/workflow-capture.js';
import { createSkillTools } from '../src/skill-tools.js';

// ── generateSkillMarkdown ───────────────────────────────────────────────

describe('generateSkillMarkdown', () => {
  it('produces valid SKILL.md with frontmatter', () => {
    const template: SkillTemplate = {
      name: 'my-research-workflow',
      description: 'Deep research on a topic with source synthesis',
      triggerPatterns: ['research this topic', 'investigate'],
      steps: [
        'Search for sources',
        'Read top 5 results',
        'Synthesize findings',
        'Save to memory',
      ],
      tools: ['web_search', 'web_fetch', 'save_memory'],
      category: 'research',
    };

    const md = generateSkillMarkdown(template);

    // Valid frontmatter delimiters
    expect(md).toMatch(/^---\n/);
    expect(md).toMatch(/\n---\n/);

    // Name in frontmatter (kebab-case)
    expect(md).toContain('name: my-research-workflow');

    // Description in frontmatter
    expect(md).toContain('description: Deep research on a topic with source synthesis');

    // Heading
    expect(md).toContain('# my-research-workflow');

    // Steps
    expect(md).toContain('1. Search for sources');
    expect(md).toContain('2. Read top 5 results');
    expect(md).toContain('3. Synthesize findings');
    expect(md).toContain('4. Save to memory');

    // Tools
    expect(md).toContain('- web_search');
    expect(md).toContain('- web_fetch');
    expect(md).toContain('- save_memory');

    // Category
    expect(md).toContain('research');

    // Trigger patterns
    expect(md).toContain('research this topic');
    expect(md).toContain('investigate');
  });

  it('normalizes name to kebab-case', () => {
    const template: SkillTemplate = {
      name: 'My Cool Workflow!!!',
      description: 'Test',
      triggerPatterns: [],
      steps: ['Do something'],
      tools: [],
      category: 'general',
    };

    const md = generateSkillMarkdown(template);
    expect(md).toContain('name: my-cool-workflow');
  });

  it('handles empty tools array gracefully', () => {
    const template: SkillTemplate = {
      name: 'simple-skill',
      description: 'No tools needed',
      triggerPatterns: [],
      steps: ['Think about the problem', 'Respond clearly'],
      tools: [],
      category: 'general',
    };

    const md = generateSkillMarkdown(template);
    expect(md).not.toContain('## Tools Used');
    expect(md).toContain('1. Think about the problem');
    expect(md).toContain('2. Respond clearly');
  });

  it('handles empty triggerPatterns gracefully', () => {
    const template: SkillTemplate = {
      name: 'no-triggers',
      description: 'No trigger patterns',
      triggerPatterns: [],
      steps: ['Step one'],
      tools: ['bash'],
      category: 'coding',
    };

    const md = generateSkillMarkdown(template);
    expect(md).not.toContain('## Trigger Patterns');
  });
});

// ── detectWorkflowPattern ───────────────────────────────────────────────

describe('detectWorkflowPattern', () => {
  it('finds repeated tool patterns', () => {
    // Simulate a session with repeated web_search -> web_fetch -> save_memory
    const messages = [
      { role: 'user', content: 'Research topic A' },
      { role: 'assistant', content: 'Found info', toolsUsed: ['web_search', 'web_fetch', 'save_memory'] },
      { role: 'user', content: 'Research topic B' },
      { role: 'assistant', content: 'Found more', toolsUsed: ['web_search', 'web_fetch', 'save_memory'] },
      { role: 'user', content: 'Research topic C' },
      { role: 'assistant', content: 'Even more', toolsUsed: ['web_search', 'web_fetch', 'save_memory'] },
    ];

    const result = detectWorkflowPattern(messages);
    expect(result).not.toBeNull();
    expect(result!.tools).toContain('web_search');
    expect(result!.tools).toContain('web_fetch');
    expect(result!.tools).toContain('save_memory');
    expect(result!.steps.length).toBeGreaterThanOrEqual(3);
  });

  it('returns null for unique workflows (no repetition)', () => {
    const messages = [
      { role: 'user', content: 'Do something unique' },
      { role: 'assistant', content: 'Done', toolsUsed: ['bash'] },
      { role: 'user', content: 'Something else' },
      { role: 'assistant', content: 'Done again', toolsUsed: ['read_file'] },
      { role: 'user', content: 'And another' },
      { role: 'assistant', content: 'More done', toolsUsed: ['write_file'] },
    ];

    const result = detectWorkflowPattern(messages);
    expect(result).toBeNull();
  });

  it('returns null for too few messages', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi', toolsUsed: ['web_search'] },
    ];

    const result = detectWorkflowPattern(messages);
    expect(result).toBeNull();
  });

  it('returns null when no tools are used', () => {
    const messages = [
      { role: 'user', content: 'Just chatting' },
      { role: 'assistant', content: 'Sure' },
      { role: 'user', content: 'More chat' },
      { role: 'assistant', content: 'Indeed' },
      { role: 'user', content: 'And more' },
      { role: 'assistant', content: 'Yes' },
    ];

    const result = detectWorkflowPattern(messages);
    expect(result).toBeNull();
  });

  it('infers category from tool names', () => {
    const messages = [
      { role: 'user', content: 'Research A' },
      { role: 'assistant', content: 'Ok', toolsUsed: ['web_search', 'web_fetch', 'save_memory'] },
      { role: 'user', content: 'Research B' },
      { role: 'assistant', content: 'Ok', toolsUsed: ['web_search', 'web_fetch', 'save_memory'] },
      { role: 'user', content: 'Research C' },
      { role: 'assistant', content: 'Ok', toolsUsed: ['web_search', 'web_fetch', 'save_memory'] },
    ];

    const result = detectWorkflowPattern(messages);
    expect(result).not.toBeNull();
    expect(result!.category).toBe('research');
  });
});

// ── shouldSuggestCapture ────────────────────────────────────────────────

describe('shouldSuggestCapture', () => {
  it('suggests capture when pattern appears 3+ times across sessions', () => {
    const currentMessages = [
      { role: 'user', content: 'Do research', toolsUsed: undefined as string[] | undefined },
      { role: 'assistant', content: 'Done', toolsUsed: ['web_search', 'web_fetch', 'save_memory'] },
    ];

    const sessionHistory = [
      { toolSequence: ['web_search', 'web_fetch', 'save_memory'] },
      { toolSequence: ['web_search', 'web_fetch', 'save_memory'] },
      { toolSequence: ['web_search', 'web_fetch', 'save_memory'] },
    ];

    const result = shouldSuggestCapture({
      messages: currentMessages,
      sessionHistory,
    });

    expect(result.suggest).toBe(true);
    expect(result.pattern).toBeDefined();
    expect(result.reason).toBeDefined();
    expect(result.reason).toContain('sessions');
  });

  it('does not suggest when fewer than 3 repetitions', () => {
    const currentMessages = [
      { role: 'user', content: 'Research' },
      { role: 'assistant', content: 'Done', toolsUsed: ['web_search', 'web_fetch', 'save_memory'] },
    ];

    // Only 1 historical match (need 2+ for 3+ total)
    const sessionHistory = [
      { toolSequence: ['web_search', 'web_fetch', 'save_memory'] },
      { toolSequence: ['bash', 'read_file', 'write_file'] },
    ];

    const result = shouldSuggestCapture({
      messages: currentMessages,
      sessionHistory,
    });

    expect(result.suggest).toBe(false);
  });

  it('does not suggest for very short tool sequences', () => {
    const currentMessages = [
      { role: 'user', content: 'Quick question' },
      { role: 'assistant', content: 'Answer', toolsUsed: ['bash'] },
    ];

    const sessionHistory = [
      { toolSequence: ['bash'] },
      { toolSequence: ['bash'] },
      { toolSequence: ['bash'] },
    ];

    const result = shouldSuggestCapture({
      messages: currentMessages,
      sessionHistory,
    });

    // Only 1 tool — too short to be a meaningful workflow
    expect(result.suggest).toBe(false);
  });

  it('does not suggest when session history is empty', () => {
    const currentMessages = [
      { role: 'user', content: 'Research' },
      { role: 'assistant', content: 'Done', toolsUsed: ['web_search', 'web_fetch', 'save_memory'] },
    ];

    const result = shouldSuggestCapture({
      messages: currentMessages,
      sessionHistory: [],
    });

    expect(result.suggest).toBe(false);
  });

  it('includes a pre-filled pattern template when suggesting', () => {
    const currentMessages = [
      { role: 'user', content: 'Research X' },
      { role: 'assistant', content: 'Done', toolsUsed: ['web_search', 'web_fetch', 'save_memory'] },
    ];

    const sessionHistory = [
      { toolSequence: ['web_search', 'web_fetch', 'save_memory'] },
      { toolSequence: ['web_search', 'web_fetch', 'save_memory'] },
      { toolSequence: ['web_search', 'web_fetch', 'save_memory'] },
    ];

    const result = shouldSuggestCapture({
      messages: currentMessages,
      sessionHistory,
    });

    expect(result.suggest).toBe(true);
    expect(result.pattern).toBeDefined();
    expect(result.pattern!.name).toBeDefined();
    expect(result.pattern!.tools.length).toBeGreaterThan(0);
    expect(result.pattern!.steps.length).toBeGreaterThan(0);
  });
});

// ── create_skill tool (structured input) ────────────────────────────────

describe('create_skill tool — structured input', () => {
  let tmpDir: string;
  let skillsDir: string;
  let tools: ReturnType<typeof createSkillTools>;
  let reloadCount: number;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-skill-creator-test-'));
    skillsDir = path.join(tmpDir, 'skills');
    reloadCount = 0;
    tools = createSkillTools({
      waggleHome: tmpDir,
      onSkillsChanged: () => { reloadCount++; },
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function run(name: string, args: Record<string, unknown> = {}) {
    const tool = tools.find(t => t.name === name);
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool.execute(args);
  }

  it('creates skill from raw content (backward compatible)', async () => {
    const result = await run('create_skill', {
      name: 'test-skill',
      content: '# Test Skill\nDo something useful.',
    });

    expect(result).toContain('Created skill "test-skill"');
    expect(fs.existsSync(path.join(skillsDir, 'test-skill.md'))).toBe(true);
    expect(reloadCount).toBe(1);
  });

  it('creates skill from structured template (description + steps)', async () => {
    const result = await run('create_skill', {
      name: 'research-flow',
      description: 'Research workflow for deep investigation',
      steps: ['Search for sources', 'Read top results', 'Synthesize findings'],
      tools: ['web_search', 'web_fetch'],
      category: 'research',
    });

    expect(result).toContain('Created skill "research-flow"');
    expect(fs.existsSync(path.join(skillsDir, 'research-flow.md'))).toBe(true);

    // Verify generated content has proper structure
    const content = fs.readFileSync(path.join(skillsDir, 'research-flow.md'), 'utf-8');
    expect(content).toContain('---');
    expect(content).toContain('name: research-flow');
    expect(content).toContain('description: Research workflow');
    expect(content).toContain('1. Search for sources');
    expect(content).toContain('2. Read top results');
    expect(content).toContain('- web_search');
    expect(reloadCount).toBe(1);
  });

  it('returns error when neither content nor structured input provided', async () => {
    const result = await run('create_skill', {
      name: 'empty-skill',
    });

    expect(result).toContain('Error');
    expect(result).toContain('content');
  });

  it('returns error for structured input without steps', async () => {
    const result = await run('create_skill', {
      name: 'no-steps',
      description: 'A skill without steps',
      steps: [],
    });

    expect(result).toContain('Error');
  });

  it('raw content takes priority over structured input', async () => {
    const rawContent = '# Custom Content\nThis is raw.';
    const result = await run('create_skill', {
      name: 'priority-test',
      content: rawContent,
      description: 'Should be ignored',
      steps: ['Should be ignored'],
    });

    expect(result).toContain('Created skill "priority-test"');
    const saved = fs.readFileSync(path.join(skillsDir, 'priority-test.md'), 'utf-8');
    expect(saved).toBe(rawContent);
    expect(saved).not.toContain('Should be ignored');
  });

  it('rejects invalid names', async () => {
    const result = await run('create_skill', {
      name: '../etc/passwd',
      content: 'malicious',
    });
    expect(result).toContain('Error');
  });
});
