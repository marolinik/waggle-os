import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Scaffold a new skill directory with a SKILL.md template and package.json.
 *
 * @param dir  - Parent directory where the skill folder will be created
 * @param name - Name of the skill (used as folder name and in metadata)
 */
export function initSkill(dir: string, name: string): void {
  const skillDir = join(dir, name);
  mkdirSync(skillDir, { recursive: true });

  const skillMd = `---
name: ${name}
description: TODO — describe what this skill does
version: 0.1.0
author: anonymous
---

You are a helpful assistant with the "${name}" skill.
`;

  const packageJson = JSON.stringify(
    {
      name: `@waggle-skill/${name}`,
      version: '0.1.0',
      description: `Waggle skill: ${name}`,
      type: 'module',
      license: 'MIT',
    },
    null,
    2,
  );

  writeFileSync(join(skillDir, 'SKILL.md'), skillMd, 'utf-8');
  writeFileSync(join(skillDir, 'package.json'), packageJson + '\n', 'utf-8');
}
