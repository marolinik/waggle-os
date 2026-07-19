/**
 * Custom Personas — user-created personas stored as JSON in ~/.waggle/personas/
 * Loaded at startup and merged with built-in PERSONAS.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { AgentPersona } from './personas.js';

const PERSONAS_DIR = 'personas';
const INVALID_PORTABLE_ID_CHARACTERS = /[<>:"/\\|?*]/;
const WINDOWS_RESERVED_BASENAME = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])$/i;

/** True when an ID is safe as one portable Windows/macOS filename segment. */
export function isValidCustomPersonaId(id: string): boolean {
  if (id.length === 0 || id.length > 200 || id === '.' || id === '..') return false;
  const hasControlCharacter = [...id].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
  if (hasControlCharacter || INVALID_PORTABLE_ID_CHARACTERS.test(id) || /[ .]$/.test(id)) return false;

  // Windows reserves device basenames even when an extension is present.
  const basename = (id.split('.')[0] ?? id).trimEnd();
  return !WINDOWS_RESERVED_BASENAME.test(basename);
}

export function assertValidCustomPersonaId(id: string): void {
  if (!isValidCustomPersonaId(id)) {
    throw new Error('Invalid custom persona ID');
  }
}

export function loadCustomPersonas(dataDir: string): AgentPersona[] {
  const dir = path.join(dataDir, PERSONAS_DIR);
  if (!fs.existsSync(dir)) return [];

  const personas: AgentPersona[] = [];
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(dir, file), 'utf-8');
        const persona = JSON.parse(content) as AgentPersona;
        if (persona.id && persona.name && persona.systemPrompt) {
          personas.push(persona);
        }
      } catch { /* skip malformed */ }
    }
  } catch { /* dir read failed */ }
  return personas;
}

export function saveCustomPersona(dataDir: string, persona: AgentPersona): void {
  assertValidCustomPersonaId(persona.id);
  const dir = path.join(dataDir, PERSONAS_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${persona.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(persona, null, 2), 'utf-8');
}

export function deleteCustomPersona(dataDir: string, id: string): boolean {
  assertValidCustomPersonaId(id);
  const filePath = path.join(dataDir, PERSONAS_DIR, `${id}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}
