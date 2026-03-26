import * as fs from 'node:fs';
import * as path from 'node:path';

export interface LoadedSkill {
  name: string;
  content: string;
}

export function loadSystemPrompt(waggleDir: string): string | null {
  const filePath = path.join(waggleDir, 'system-prompt.md');
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf-8').trim();
  return content || null;
}

export function loadSkills(waggleDir: string): LoadedSkill[] {
  const skillsDir = path.join(waggleDir, 'skills');
  if (!fs.existsSync(skillsDir)) return [];

  const files = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'));
  return files.map(f => ({
    name: f.replace(/\.md$/, ''),
    content: fs.readFileSync(path.join(skillsDir, f), 'utf-8').trim(),
  }));
}
