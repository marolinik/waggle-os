import { describe, it, expect } from 'vitest';
import {
  validateSkillMd,
  isValidSemver,
  compareSemver,
  checkSkillDependencies,
  checkVersionDowngrade,
} from '../src/validate-skill.js';

describe('validateSkillMd', () => {
  it('parses valid SKILL.md', () => {
    const content = `---
name: summarizer
description: Summarizes long documents
version: 1.0.0
author: waggle-team
---

You are an expert summarizer. Given a document, produce a concise summary.
`;

    const result = validateSkillMd(content);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.metadata).toBeDefined();
    expect(result.metadata!.name).toBe('summarizer');
    expect(result.metadata!.description).toBe('Summarizes long documents');
    expect(result.metadata!.version).toBe('1.0.0');
    expect(result.metadata!.author).toBe('waggle-team');
    expect(result.metadata!.systemPrompt).toBe(
      'You are an expert summarizer. Given a document, produce a concise summary.',
    );
  });

  it('rejects missing name', () => {
    const content = `---
description: A skill without a name
---

Some prompt.
`;

    const result = validateSkillMd(content);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required field: name');
  });

  it('rejects missing description', () => {
    const content = `---
name: no-desc
---

Some prompt.
`;

    const result = validateSkillMd(content);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required field: description');
  });

  it('rejects missing frontmatter', () => {
    const content = `Just a plain markdown file with no frontmatter.`;

    const result = validateSkillMd(content);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Missing YAML frontmatter (must be wrapped in --- delimiters)',
    );
  });

  it('extracts system prompt from body', () => {
    const content = `---
name: coder
description: Writes code
---

You are a coding assistant.

Always use TypeScript.
Write clean, tested code.
`;

    const result = validateSkillMd(content);
    expect(result.valid).toBe(true);
    expect(result.metadata!.systemPrompt).toBe(
      'You are a coding assistant.\n\nAlways use TypeScript.\nWrite clean, tested code.',
    );
  });

  // F18: Version validation tests
  it('warns on invalid semver version', () => {
    const content = `---
name: bad-version
description: Has invalid version
version: abc
---

Prompt.
`;

    const result = validateSkillMd(content);
    expect(result.valid).toBe(true); // still valid, just warns
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('Invalid semver version');
    expect(result.warnings[0]).toContain('abc');
  });

  it('accepts valid semver with pre-release', () => {
    const content = `---
name: prerelease
description: Has pre-release version
version: 2.0.0-beta.1
---

Prompt.
`;

    const result = validateSkillMd(content);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(result.metadata!.version).toBe('2.0.0-beta.1');
  });

  // F18: Dependency parsing tests
  it('parses dependencies from bracket syntax', () => {
    const content = `---
name: researcher
description: Research skill
dependencies: [search_memory, save_memory, query_knowledge]
---

Research prompt.
`;

    const result = validateSkillMd(content);
    expect(result.valid).toBe(true);
    expect(result.metadata!.dependencies).toEqual(['search_memory', 'save_memory', 'query_knowledge']);
  });

  it('parses dependencies from comma-separated syntax', () => {
    const content = `---
name: researcher
description: Research skill
dependencies: search_memory, save_memory
---

Research prompt.
`;

    const result = validateSkillMd(content);
    expect(result.valid).toBe(true);
    expect(result.metadata!.dependencies).toEqual(['search_memory', 'save_memory']);
  });

  it('returns undefined dependencies when field is absent', () => {
    const content = `---
name: no-deps
description: No dependencies
---

Prompt.
`;

    const result = validateSkillMd(content);
    expect(result.valid).toBe(true);
    expect(result.metadata!.dependencies).toBeUndefined();
  });
});

describe('isValidSemver', () => {
  it('accepts standard semver', () => {
    expect(isValidSemver('1.0.0')).toBe(true);
    expect(isValidSemver('0.1.0')).toBe(true);
    expect(isValidSemver('12.34.56')).toBe(true);
  });

  it('accepts semver with pre-release', () => {
    expect(isValidSemver('1.0.0-alpha')).toBe(true);
    expect(isValidSemver('1.0.0-beta.1')).toBe(true);
  });

  it('accepts semver with build metadata', () => {
    expect(isValidSemver('1.0.0+build.123')).toBe(true);
  });

  it('rejects invalid semver', () => {
    expect(isValidSemver('1.0')).toBe(false);
    expect(isValidSemver('abc')).toBe(false);
    expect(isValidSemver('v1.0.0')).toBe(false);
    expect(isValidSemver('1')).toBe(false);
    expect(isValidSemver('')).toBe(false);
  });
});

describe('compareSemver', () => {
  it('compares equal versions', () => {
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
  });

  it('compares different major versions', () => {
    expect(compareSemver('2.0.0', '1.0.0')).toBe(1);
    expect(compareSemver('1.0.0', '2.0.0')).toBe(-1);
  });

  it('compares different minor versions', () => {
    expect(compareSemver('1.2.0', '1.1.0')).toBe(1);
    expect(compareSemver('1.0.0', '1.1.0')).toBe(-1);
  });

  it('compares different patch versions', () => {
    expect(compareSemver('1.0.2', '1.0.1')).toBe(1);
    expect(compareSemver('1.0.0', '1.0.1')).toBe(-1);
  });

  it('ignores pre-release when comparing', () => {
    expect(compareSemver('1.0.0-alpha', '1.0.0-beta')).toBe(0);
  });
});

describe('checkSkillDependencies', () => {
  it('returns no warnings when all dependencies are available', () => {
    const metadata = {
      name: 'test-skill',
      description: 'test',
      dependencies: ['search_memory', 'save_memory'],
      systemPrompt: '',
    };
    const warnings = checkSkillDependencies(metadata, ['search_memory', 'save_memory', 'get_identity']);
    expect(warnings).toHaveLength(0);
  });

  it('warns about missing dependency tools', () => {
    const metadata = {
      name: 'test-skill',
      description: 'test',
      dependencies: ['search_memory', 'nonexistent_tool'],
      systemPrompt: '',
    };
    const warnings = checkSkillDependencies(metadata, ['search_memory', 'save_memory']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('nonexistent_tool');
    expect(warnings[0]).toContain('not available');
  });

  it('returns no warnings when no dependencies declared', () => {
    const metadata = {
      name: 'test-skill',
      description: 'test',
      systemPrompt: '',
    };
    const warnings = checkSkillDependencies(metadata, ['search_memory']);
    expect(warnings).toHaveLength(0);
  });
});

describe('checkVersionDowngrade', () => {
  it('detects downgrade', () => {
    const warning = checkVersionDowngrade('my-skill', '2.0.0', '1.0.0');
    expect(warning).toContain('Downgrade detected');
    expect(warning).toContain('1.0.0 < 2.0.0');
  });

  it('detects same version re-install', () => {
    const warning = checkVersionDowngrade('my-skill', '1.0.0', '1.0.0');
    expect(warning).toContain('Same version re-install');
  });

  it('returns null for upgrade', () => {
    const warning = checkVersionDowngrade('my-skill', '1.0.0', '2.0.0');
    expect(warning).toBeNull();
  });

  it('returns null when versions are missing', () => {
    expect(checkVersionDowngrade('s', undefined, '1.0.0')).toBeNull();
    expect(checkVersionDowngrade('s', '1.0.0', undefined)).toBeNull();
    expect(checkVersionDowngrade('s', undefined, undefined)).toBeNull();
  });

  it('returns null for invalid semver', () => {
    expect(checkVersionDowngrade('s', 'abc', '1.0.0')).toBeNull();
    expect(checkVersionDowngrade('s', '1.0.0', 'xyz')).toBeNull();
  });
});
