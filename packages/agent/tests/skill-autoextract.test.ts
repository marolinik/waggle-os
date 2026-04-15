/**
 * Skills 2.0 gap A — auto-extract skills pipeline.
 *
 * Tests the end-to-end flow: session messages → detectWorkflowPattern →
 * generateSkillMarkdown → SKILL.md on disk with scope: personal +
 * workflow_pattern signal recorded.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MindDB, ImprovementSignalStore } from '@waggle/core';
import {
  autoExtractAndCreateSkill,
  skillFilename,
  type AutoExtractMessage,
} from '../src/skill-autoextract.js';
import { parseSkillFrontmatter } from '../src/skill-frontmatter.js';
import type { SkillTemplate } from '../src/skill-creator.js';

/**
 * Build a session that detectWorkflowPattern recognizes — the same 3+ tools
 * repeated 2+ times in the same order within the same session.
 */
function repeatedSession(): AutoExtractMessage[] {
  return [
    { role: 'user', content: 'Find info on Tauri 2.0' },
    { role: 'agent', content: 'Results...', toolsUsed: ['web_search', 'web_fetch', 'save_memory'] },
    { role: 'user', content: 'Find info on React 19' },
    { role: 'agent', content: 'Results...', toolsUsed: ['web_search', 'web_fetch', 'save_memory'] },
    { role: 'user', content: 'Find info on Vite 6' },
    { role: 'agent', content: 'Results...', toolsUsed: ['web_search', 'web_fetch', 'save_memory'] },
  ];
}

describe('autoExtractAndCreateSkill — gap A', () => {
  let tmpDir: string;
  let db: MindDB;
  let signals: ImprovementSignalStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-autoextract-'));
    db = new MindDB(':memory:');
    signals = new ImprovementSignalStore(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a personal-scope SKILL.md from a repeated workflow', async () => {
    const result = await autoExtractAndCreateSkill(repeatedSession(), {
      personalSkillsDir: tmpDir,
      improvementSignals: signals,
    });

    expect(result.filePath).not.toBeNull();
    expect(result.template).toBeDefined();
    expect(fs.existsSync(result.filePath!)).toBe(true);

    const md = fs.readFileSync(result.filePath!, 'utf-8');
    const { frontmatter, body } = parseSkillFrontmatter(md);
    expect(frontmatter.name).toBeDefined();
    expect(frontmatter.scope).toBe('personal');
    expect(body).toContain('## Steps');
    expect(body).toContain('## Tools Used');
  });

  it('records a workflow_pattern signal with auto-extract pattern_key', async () => {
    const result = await autoExtractAndCreateSkill(repeatedSession(), {
      personalSkillsDir: tmpDir,
      improvementSignals: signals,
    });
    expect(result.filePath).not.toBeNull();

    const recorded = signals.getByCategory('workflow_pattern');
    const autoExtract = recorded.find(s => s.pattern_key.startsWith('auto-extract:'));
    expect(autoExtract).toBeDefined();
    expect(autoExtract!.detail).toContain('Auto-extracted');
  });

  it('returns no_pattern for short or random sessions', async () => {
    const messages: AutoExtractMessage[] = [
      { role: 'user', content: 'Hi' },
      { role: 'agent', content: 'Hello', toolsUsed: ['get_identity'] },
    ];
    const result = await autoExtractAndCreateSkill(messages, {
      personalSkillsDir: tmpDir,
    });
    expect(result.filePath).toBeNull();
    expect(result.reason).toBe('no_pattern');
  });

  it('returns already_exists when a skill with the same filename is present', async () => {
    // First run creates the file
    const first = await autoExtractAndCreateSkill(repeatedSession(), {
      personalSkillsDir: tmpDir,
    });
    expect(first.filePath).not.toBeNull();

    // Second run against the same session — same filename → dedup
    const second = await autoExtractAndCreateSkill(repeatedSession(), {
      personalSkillsDir: tmpDir,
    });
    expect(second.filePath).toBeNull();
    expect(second.reason).toBe('already_exists');
    expect(second.template).toBeDefined(); // template still returned so caller can log
  });

  it('runs without a signal store (graceful degrade)', async () => {
    const result = await autoExtractAndCreateSkill(repeatedSession(), {
      personalSkillsDir: tmpDir,
    });
    expect(result.filePath).not.toBeNull(); // Creation still succeeded
  });

  it('uses enrichTemplate hook when provided and falls back on throw', async () => {
    // Hook rewrites the template description
    const enriched = await autoExtractAndCreateSkill(repeatedSession(), {
      personalSkillsDir: tmpDir,
      enrichTemplate: async (t: SkillTemplate) => ({ ...t, description: 'LLM-enriched description' }),
    });
    expect(enriched.filePath).not.toBeNull();
    const md = fs.readFileSync(enriched.filePath!, 'utf-8');
    expect(md).toContain('LLM-enriched description');

    // Hook throws — falls back to deterministic template, still writes file
    const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-autoextract-2-'));
    try {
      const fallback = await autoExtractAndCreateSkill(repeatedSession(), {
        personalSkillsDir: tmp2,
        enrichTemplate: async () => { throw new Error('LLM exploded'); },
      });
      expect(fallback.filePath).not.toBeNull();
    } finally {
      fs.rmSync(tmp2, { recursive: true, force: true });
    }
  });

  it('skillFilename produces a valid kebab-case stem', () => {
    expect(skillFilename({
      name: 'Web Search + Save Memory',
      description: '', triggerPatterns: [], steps: [], tools: [], category: 'research',
    })).toBe('web-search-save-memory');
    expect(skillFilename({
      name: '  leading+trailing+ ',
      description: '', triggerPatterns: [], steps: [], tools: [], category: 'x',
    })).toBe('leading-trailing');
  });
});
