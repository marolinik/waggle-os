/**
 * Custom Personas — user-created personas stored as JSON in ~/.waggle/personas/
 * Loaded at startup and merged with built-in PERSONAS.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { AgentPersona } from './personas.js';

const PERSONAS_DIR = 'personas';

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
  const dir = path.join(dataDir, PERSONAS_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${persona.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(persona, null, 2), 'utf-8');
}

export function deleteCustomPersona(dataDir: string, id: string): boolean {
  const filePath = path.join(dataDir, PERSONAS_DIR, `${id}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}
