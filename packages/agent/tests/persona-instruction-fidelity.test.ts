import { describe, expect, it } from 'vitest';
import { BEHAVIORAL_SPEC } from '../src/behavioral-spec.js';
import { getPersona } from '../src/personas.js';

function personaPrompt(id: string): string {
  const persona = getPersona(id);
  expect(persona, `missing persona ${id}`).not.toBeNull();
  return persona!.systemPrompt;
}

describe('explicit-instruction fidelity contract', () => {
  it('makes explicit user constraints higher priority than persona defaults and CTAs', () => {
    const contract = BEHAVIORAL_SPEC.coreLoop;
    expect(contract).toContain('=== CRITICAL: EXPLICIT-INSTRUCTION FIDELITY ===');
    expect(contract).toMatch(/persona defaults.*yield|override persona defaults/i);
    expect(contract).toMatch(/no follow-up/i);
    expect(contract).toMatch(/no (?:files|file creation).*no (?:schedules|scheduling)/i);
    expect(contract).toMatch(/evidence-only/i);
  });

  it('defines closed-world, provenance, assumption, and source-class rules', () => {
    const contract = BEHAVIORAL_SPEC.coreLoop;
    expect(contract).toMatch(/closed-world rewrite/i);
    expect(contract).toMatch(/only.*supplied facts/i);
    expect(contract).toMatch(/user(?:-provided)? claims.*unverified/i);
    expect(contract).toMatch(/assumptions, dates, and requirements.*label/i);
    expect(contract).toMatch(/primary sources.*official (?:documentation|docs).*repositories.*papers/i);
    expect(contract).toMatch(/AI summaries.*aggregators.*not primary/i);
  });

  it('binds tool calls to the serialized schema and code claims to self-check evidence', () => {
    const contract = BEHAVIORAL_SPEC.coreLoop;
    expect(contract).toMatch(/serialized tool schema/i);
    expect(contract).toMatch(/absent.*do not call/i);
    expect(contract).toMatch(/code example/i);
    for (const invariant of ['imports', 'name scope', 'control flow', 'count semantics']) {
      expect(contract.toLowerCase()).toContain(invariant);
    }
    expect(contract).toMatch(/not executed.*UNVERIFIED/i);
  });
});

describe('persona defaults yield without losing domain discipline', () => {
  it('Researcher obeys requested source classes without padding source counts', () => {
    const prompt = personaPrompt('researcher');
    expect(prompt).toMatch(/primary sources.*official/i);
    expect(prompt).toMatch(/requested source (?:class|constraints)/i);
    expect(prompt).toMatch(/primary-source URL for each compared item/i);
    expect(prompt).toMatch(/distinguish facts from inference.*label both explicitly/i);
    expect(prompt).not.toMatch(/always triangulate across at least 3 sources/i);
  });

  it('Writer treats constrained rewrites as closed-world transformations', () => {
    const prompt = personaPrompt('writer');
    expect(prompt).toMatch(/closed-world rewrite/i);
    expect(prompt).toMatch(/do not add.*claims/i);
    expect(prompt).toMatch(/follow-up.*file/i);
  });

  it('Project Manager labels unsupplied dates, deadlines, and requirements', () => {
    const prompt = personaPrompt('project-manager');
    expect(prompt).toMatch(/dates, deadlines, or requirements/i);
    expect(prompt).toMatch(/supplied.*labeled assumptions/i);
  });

  it('Executive Assistant suppresses prohibited follow-ups and artifacts', () => {
    const prompt = personaPrompt('executive-assistant');
    expect(prompt).toMatch(/no follow-up/i);
    expect(prompt).toMatch(/calendar events.*files/i);
  });

  it('Business Finance checks units and does not append prohibited actions', () => {
    const prompt = personaPrompt('finance-owner');
    expect(prompt).toMatch(/unit semantics/i);
    expect(prompt).toMatch(/files or schedules/i);
  });

  it('Data Engineer self-checks compact examples before presenting them', () => {
    const prompt = personaPrompt('data-engineer');
    expect(prompt).toMatch(/imports.*name scope.*control flow.*count semantics/i);
    expect(prompt).toMatch(/not executed.*unverified/i);
  });

  it('Verifier never upgrades an attributed claim into verified evidence', () => {
    const prompt = personaPrompt('verifier');
    expect(prompt).toMatch(/evidence-only/i);
    expect(prompt).toMatch(/claim.*not.*verified fact/i);
  });

  it('Coordinator can specify lanes without launching agents', () => {
    const prompt = personaPrompt('coordinator');
    expect(prompt).toMatch(/forbids agent launches/i);
    expect(prompt).toMatch(/specify.*lanes.*without spawning/i);
  });
});
