// Repro: evolved persona override is shadowed by the built-in persona in the
// chat consumer (chat.ts:439-440 resolvePersona === listPersonas().find(...)).
// Runs against packages/agent/dist (built from main 2af0904d). Writes only
// under the scratchpad.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIST = 'D:/Projects/waggle-os/packages/agent/dist';
const personas = await import(pathToFileURL(path.join(DIST, 'personas.js')).href);
const deploy = await import(pathToFileURL(path.join(DIST, 'evolution-deploy.js')).href);

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(here, 'shadow-'));

// 1. Deploy an evolved override for the built-in `coder` persona, exactly as
//    routes/evolution.ts deployFromRun() does for target_kind persona-system-prompt.
const r = deploy.deployPersonaOverride(tmp, { personaId: 'coder', systemPrompt: 'EVOLVED ROUTING v2' });
console.log('deployed override ->', r.path);

// 2. Point the runtime at that dataDir (server/local/index.ts:552 setPersonaDataDir).
personas.setPersonaDataDir(tmp);

// 3. Replicate chat.ts:439-440 resolvePersona().
const resolvePersona = (id) => personas.listPersonas().find(p => p.id === id) ?? null;
const chatSees = resolvePersona('coder');
const all = personas.listPersonas().filter(p => p.id === 'coder');

console.log('listPersonas() entries with id=coder:', all.length);
console.log('entry[0].systemPrompt startsWith EVOLVED?', all[0].systemPrompt.startsWith('EVOLVED'));
console.log('entry[1].systemPrompt startsWith EVOLVED?', all[1]?.systemPrompt.startsWith('EVOLVED'));
console.log('chat resolvePersona("coder").systemPrompt includes EVOLVED?', chatSees.systemPrompt.includes('EVOLVED ROUTING'));
console.log('getPersona("coder") (used by evolution-service.ts:277 + routes/evolution.ts:259 for baseline) includes EVOLVED?',
  personas.getPersona('coder').systemPrompt.includes('EVOLVED ROUTING'));

// 4. Show why packages/agent/tests/evolution-deploy.test.ts:109-123 stays green:
const testPredicate = personas.listPersonas().find(p => p.id === 'coder' && p.systemPrompt.includes('EVOLVED ROUTING'));
console.log('test predicate (id && includes EVOLVED) finds override?', Boolean(testPredicate));

personas.setPersonaDataDir('');
fs.rmSync(tmp, { recursive: true, force: true });
