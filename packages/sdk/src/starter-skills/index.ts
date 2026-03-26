import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Get the directory containing starter skill files.
 * Resolves to the source directory containing .md files.
 */
export function getStarterSkillsDir(): string {
  // When running from compiled output (dist/), go up to package root then into src/
  // When running from source (src/), we're already in the right place
  const srcDir = path.resolve(__dirname, '..', '..', 'src', 'starter-skills');
  if (fs.existsSync(srcDir) && fs.readdirSync(srcDir).some(f => f.endsWith('.md'))) {
    return srcDir;
  }
  // Fallback: same directory (running directly from source)
  return __dirname;
}

/**
 * List all starter skill names (without .md extension).
 */
export function listStarterSkills(): string[] {
  const dir = getStarterSkillsDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''))
    .sort();
}

/**
 * Install starter skills into a target directory (e.g., ~/.waggle/skills/).
 * Only installs skills that don't already exist (no overwrite).
 * Returns list of installed skill names.
 */
export function installStarterSkills(targetDir: string): string[] {
  const sourceDir = getStarterSkillsDir();
  if (!fs.existsSync(sourceDir)) return [];
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  const installed: string[] = [];
  const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.md'));

  for (const file of files) {
    const targetPath = path.join(targetDir, file);
    if (!fs.existsSync(targetPath)) {
      fs.copyFileSync(path.join(sourceDir, file), targetPath);
      installed.push(file.replace(/\.md$/, ''));
    }
  }

  return installed;
}
