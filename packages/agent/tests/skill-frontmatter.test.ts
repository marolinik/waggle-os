import { describe, it, expect } from 'vitest';
import { parseSkillFrontmatter } from '../src/skill-frontmatter.js';

describe('parseSkillFrontmatter', () => {
  it('parses frontmatter with name and description', () => {
    const content = `---
name: Deploy Helper
description: Helps deploy applications
---

# Deploy Helper
Some content here.`;

    const { frontmatter, body } = parseSkillFrontmatter(content);
    expect(frontmatter.name).toBe('Deploy Helper');
    expect(frontmatter.description).toBe('Helps deploy applications');
  });

  it('parses permissions block correctly', () => {
    const content = `---
permissions:
  network: true
  codeExecution: true
  fileSystem: false
---

# Skill`;

    const { frontmatter } = parseSkillFrontmatter(content);
    expect(frontmatter.permissions).toBeDefined();
    expect(frontmatter.permissions!.network).toBe(true);
    expect(frontmatter.permissions!.codeExecution).toBe(true);
    expect(frontmatter.permissions!.fileSystem).toBe(false);
  });

  it('returns empty frontmatter when no delimiters', () => {
    const content = `# Just a Skill

No frontmatter here.`;

    const { frontmatter, body } = parseSkillFrontmatter(content);
    expect(frontmatter).toEqual({});
    expect(body).toBe(content);
  });

  it('returns empty frontmatter when no closing delimiter', () => {
    const content = `---
name: Broken
description: Missing closing delimiter

# Skill Content`;

    const { frontmatter, body } = parseSkillFrontmatter(content);
    expect(frontmatter).toEqual({});
    expect(body).toBe(content);
  });

  it('body is content after frontmatter', () => {
    const content = `---
name: Test
---
# The Body

This is the body content.`;

    const { body } = parseSkillFrontmatter(content);
    expect(body).toContain('# The Body');
    expect(body).toContain('This is the body content.');
    expect(body).not.toContain('name: Test');
  });

  it('mixed true/false permissions parsed correctly', () => {
    const content = `---
permissions:
  fileSystem: true
  network: false
  codeExecution: true
  externalServices: false
  secrets: true
  browserAutomation: false
---

# Skill`;

    const { frontmatter } = parseSkillFrontmatter(content);
    const perms = frontmatter.permissions!;
    expect(perms.fileSystem).toBe(true);
    expect(perms.network).toBe(false);
    expect(perms.codeExecution).toBe(true);
    expect(perms.externalServices).toBe(false);
    expect(perms.secrets).toBe(true);
    expect(perms.browserAutomation).toBe(false);
  });

  it('ignores comments in frontmatter', () => {
    const content = `---
# This is a comment
name: My Skill
# Another comment
description: Does things
---

# Content`;

    const { frontmatter } = parseSkillFrontmatter(content);
    expect(frontmatter.name).toBe('My Skill');
    expect(frontmatter.description).toBe('Does things');
  });

  it('works with content that has no frontmatter (backward compat)', () => {
    const content = `# Research Team -- Multi-Agent Investigation

A coordinated 3-agent research workflow.

## When to use
- Complex research questions`;

    const { frontmatter, body } = parseSkillFrontmatter(content);
    expect(frontmatter).toEqual({});
    expect(body).toBe(content);
  });

  it('parses all fields together (name, description, permissions)', () => {
    const content = `---
name: Full Skill
description: A skill with everything
permissions:
  network: true
  secrets: true
---

# Full Skill
Content.`;

    const { frontmatter } = parseSkillFrontmatter(content);
    expect(frontmatter.name).toBe('Full Skill');
    expect(frontmatter.description).toBe('A skill with everything');
    expect(frontmatter.permissions!.network).toBe(true);
    expect(frontmatter.permissions!.secrets).toBe(true);
  });

  it('handles permissions block followed by other keys', () => {
    const content = `---
permissions:
  fileSystem: true
name: After Permissions
---

# Skill`;

    const { frontmatter } = parseSkillFrontmatter(content);
    expect(frontmatter.permissions!.fileSystem).toBe(true);
    expect(frontmatter.name).toBe('After Permissions');
  });
});
