import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface CapabilityPack {
  id: string;
  name: string;
  description: string;
  skills: string[];
}

/**
 * Get the directory containing capability pack JSON manifests.
 * Resolves to the source directory containing .json files.
 */
export function getCapabilityPacksDir(): string {
  // When running from compiled output (dist/), go up to package root then into src/
  const srcDir = path.resolve(__dirname, '..', '..', 'src', 'capability-packs');
  if (fs.existsSync(srcDir) && fs.readdirSync(srcDir).some(f => f.endsWith('.json'))) {
    return srcDir;
  }
  // Fallback: same directory (running directly from source)
  return __dirname;
}

/**
 * List all capability packs, sorted by name.
 */
export function listCapabilityPacks(): CapabilityPack[] {
  const dir = getCapabilityPacksDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const content = fs.readFileSync(path.join(dir, f), 'utf-8');
      return JSON.parse(content) as CapabilityPack;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get a single pack manifest by ID.
 */
export function getPackManifest(packId: string): CapabilityPack | null {
  const dir = getCapabilityPacksDir();
  const filePath = path.join(dir, `${packId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}
