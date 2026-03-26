import fs from 'fs';
import path from 'path';

export interface Skill {
  name: string;
  description: string;
  prompt: string;
  model?: string;
  tools?: string[];
  path: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } | null {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return null;

  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key && value) meta[key] = value;
  }
  return { meta, body: match[2].trim() };
}

export class SkillLoader {
  private directories: string[];

  constructor(directories: string[]) {
    this.directories = directories;
  }

  discover(): Skill[] {
    const skillMap = new Map<string, Skill>();

    for (const dir of this.directories) {
      if (!fs.existsSync(dir)) continue;

      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillMdPath = path.join(dir, entry.name, 'SKILL.md');
        if (!fs.existsSync(skillMdPath)) continue;

        const content = fs.readFileSync(skillMdPath, 'utf-8');
        const parsed = parseFrontmatter(content);
        if (!parsed || !parsed.meta.name || !parsed.meta.description) continue;

        const skill: Skill = {
          name: parsed.meta.name,
          description: parsed.meta.description,
          prompt: parsed.body,
          model: parsed.meta.model,
          tools: parsed.meta.tools
            ? parsed.meta.tools.split(',').map(t => t.trim())
            : undefined,
          path: skillMdPath,
        };

        skillMap.set(skill.name, skill);
      }
    }

    return Array.from(skillMap.values());
  }
}
