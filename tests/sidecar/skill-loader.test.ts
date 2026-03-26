import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SkillLoader, type Skill } from '../../sidecar/src/skill-loader.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Skill Loader', () => {
  let skillDir: string;
  let loader: SkillLoader;

  beforeEach(() => {
    skillDir = path.join(os.tmpdir(), `waggle-skills-${Date.now()}`);
    fs.mkdirSync(skillDir, { recursive: true });
    loader = new SkillLoader([skillDir]);
  });

  afterEach(() => {
    fs.rmSync(skillDir, { recursive: true, force: true });
  });

  it('discovers skills from SKILL.md files', () => {
    const skillPath = path.join(skillDir, 'summarize');
    fs.mkdirSync(skillPath, { recursive: true });
    fs.writeFileSync(path.join(skillPath, 'SKILL.md'), `---
name: summarize
description: Summarize text into key points
model: haiku
---

You are a summarization expert. Given text, produce a concise summary.
`);
    const skills = loader.discover();
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('summarize');
    expect(skills[0].description).toBe('Summarize text into key points');
    expect(skills[0].model).toBe('haiku');
    expect(skills[0].prompt).toContain('summarization expert');
  });

  it('discovers skills from multiple directories', () => {
    const dir2 = path.join(os.tmpdir(), `waggle-skills2-${Date.now()}`);
    fs.mkdirSync(dir2, { recursive: true });

    fs.mkdirSync(path.join(skillDir, 'skill-a'), { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'skill-a', 'SKILL.md'), `---
name: skill-a
description: First skill
---
Prompt A
`);

    fs.mkdirSync(path.join(dir2, 'skill-b'), { recursive: true });
    fs.writeFileSync(path.join(dir2, 'skill-b', 'SKILL.md'), `---
name: skill-b
description: Second skill
---
Prompt B
`);

    const multiLoader = new SkillLoader([skillDir, dir2]);
    const skills = multiLoader.discover();
    expect(skills).toHaveLength(2);
    fs.rmSync(dir2, { recursive: true, force: true });
  });

  it('ignores directories without SKILL.md', () => {
    fs.mkdirSync(path.join(skillDir, 'empty-dir'), { recursive: true });
    const skills = loader.discover();
    expect(skills).toHaveLength(0);
  });

  it('handles invalid YAML frontmatter gracefully', () => {
    fs.mkdirSync(path.join(skillDir, 'bad-skill'), { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'bad-skill', 'SKILL.md'), `No frontmatter here.`);
    const skills = loader.discover();
    expect(skills).toHaveLength(0);
  });

  it('parses optional tools field', () => {
    fs.mkdirSync(path.join(skillDir, 'researcher'), { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'researcher', 'SKILL.md'), `---
name: researcher
description: Research topics
tools: WebSearch, WebFetch
model: sonnet
---

Research the given topic.
`);
    const skills = loader.discover();
    expect(skills[0].tools).toEqual(['WebSearch', 'WebFetch']);
  });

  it('deduplicates skills by name (later directory wins)', () => {
    const dir2 = path.join(os.tmpdir(), `waggle-skills-dup-${Date.now()}`);
    fs.mkdirSync(dir2, { recursive: true });

    fs.mkdirSync(path.join(skillDir, 'dupe'), { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'dupe', 'SKILL.md'), `---
name: dupe
description: First version
---
First
`);

    fs.mkdirSync(path.join(dir2, 'dupe'), { recursive: true });
    fs.writeFileSync(path.join(dir2, 'dupe', 'SKILL.md'), `---
name: dupe
description: Second version
---
Second
`);

    const multiLoader = new SkillLoader([skillDir, dir2]);
    const skills = multiLoader.discover();
    expect(skills).toHaveLength(1);
    expect(skills[0].description).toBe('Second version');
    fs.rmSync(dir2, { recursive: true, force: true });
  });
});
