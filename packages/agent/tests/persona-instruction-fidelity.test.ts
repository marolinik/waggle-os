import { describe, expect, it } from 'vitest';
import { BEHAVIORAL_SPEC } from '../src/behavioral-spec.js';
import { composePersonaPrompt, getPersona } from '../src/personas.js';

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
    expect(prompt).toMatch(/archive, deprecation, or replacement notices/i);
    expect(prompt).toMatch(/exact source selected from search results/i);
    expect(prompt).toMatch(/never transfer features between compared products/i);
    expect(prompt).toMatch(/distinguish facts from inference.*label both explicitly/i);
    expect(prompt).toMatch(/once one qualifying primary source per compared item has been fetched.*stop searching and synthesize/i);
    expect(prompt).toMatch(/raw README.*unusable.*stop using that repository.*different qualifying primary source/i);
    expect(prompt).toMatch(/never cite.*fetch.*unusable/i);
    expect(prompt).toMatch(/final source list.*only qualifying primary sources.*never list (?:a )?secondary/i);
    expect(prompt).not.toMatch(/always triangulate across at least 3 sources/i);
  });

  it('Writer treats constrained rewrites as closed-world transformations', () => {
    const prompt = personaPrompt('writer');
    expect(prompt).toMatch(/closed-world rewrite/i);
    expect(prompt).toMatch(/do not add.*claims/i);
    expect(prompt).toMatch(/preserve the meaning.*retained.*requested selection or summary/i);
    expect(prompt).toMatch(/do not invent or strengthen.*urgency.*risks.*consequences.*rationale.*certainty/i);
    expect(prompt).toMatch(/follow-up.*file/i);
  });

  it('Project Manager maps directed dependencies without inventing release requirements', () => {
    const prompt = personaPrompt('project-manager');
    expect(prompt).toMatch(/dates, deadlines, or requirements/i);
    expect(prompt).toMatch(/supplied.*labeled assumptions/i);
    expect(prompt).toMatch(/milestone-plan requests.*directed milestone dependency edges/i);
    expect(prompt).toMatch(/task, approval, resource, and external dependencies.*explicit/i);
    expect(prompt).toMatch(/do not invent.*platforms.*metrics.*requirements/i);
    expect(prompt).toMatch(/target criteria.*not established current behavior/i);
    expect(prompt).toMatch(/do not add.*operating systems.*quantified thresholds.*soak periods/i);
    expect(prompt).toMatch(/bounded milestone-plan requests.*at most four milestones.*under 500 words/i);
  });

  it('Executive Assistant completes timed agendas and suppresses prohibited follow-ups', () => {
    const prompt = personaPrompt('executive-assistant');
    expect(prompt).toMatch(/before concluding.*each requested element.*time block.*desired decision.*pre-read checklist/i);
    expect(prompt).toMatch(/no follow-up/i);
    expect(prompt).toMatch(/calendar events.*files/i);
    expect(prompt).toMatch(/pre-read checklist items.*requested materials.*not assertions.*already exist.*completed/i);
  });

  it('Business Finance makes runway calculations and actions explicit', () => {
    const prompt = personaPrompt('finance-owner');
    expect(prompt).toMatch(/unit semantics/i);
    expect(prompt).toMatch(/cash\s*\/\s*net monthly burn/i);
    expect(prompt).toMatch(/when the user asks for recommendations.*distinct actions.*cost reduction.*cash inflow/i);
    expect(prompt).toMatch(/files or schedules/i);
  });

  it('Coder inventories the bounded workspace before trying named files', () => {
    const prompt = personaPrompt('coder');
    expect(prompt).toMatch(/report exactly what files exist.*search_files.*\*\*\/\*.*before.*read_file/i);
    expect(prompt).toMatch(/successful search result.*inventory evidence/i);
  });

  it('General Purpose keeps operational recommendations evidence-bounded', () => {
    const prompt = personaPrompt('general-purpose');
    expect(prompt).toMatch(/operational recommendations.*supplied or verified tool-derived evidence/i);
    expect(prompt).toMatch(/do not invent absolute instructions or urgency/i);
  });

  it('Data Engineer self-checks and scopes compact examples before presenting them', () => {
    const prompt = personaPrompt('data-engineer');
    expect(prompt).toMatch(/imports.*name scope.*control flow.*count semantics/i);
    expect(prompt).toMatch(/not executed.*unverified/i);
    expect(prompt).toMatch(/compact example or compact design.*whole answer.*900 words/i);
    expect(prompt).toMatch(/each requested dimension once.*one minimal complete example/i);
    expect(prompt).toMatch(/omit optional extensions.*unless.*requested/i);
    expect(prompt).toMatch(/retry behavior.*executable bounded retry.*(?:backoff|busy_timeout)/i);
    expect(prompt).toMatch(/place the retry loop inside try.*attach finally to try.*never attach finally to (?:a )?(?:for|while)/i);
  });

  it('Verifier never upgrades an attributed claim into verified evidence', () => {
    const prompt = personaPrompt('verifier');
    expect(prompt).toMatch(/evidence-only/i);
    expect(prompt).toMatch(/claim.*not.*verified fact/i);
  });

  it('Verifier yields its human-readable default to an exclusive response contract', () => {
    const prompt = personaPrompt('verifier');
    expect(prompt).toMatch(/whole-response contract.*replaces only the default format/is);
    expect(prompt).toMatch(/schema, field set, or tagged envelope alone is not exclusive/i);
    expect(prompt).toMatch(/one requested payload and nothing else/i);
    expect(prompt).toMatch(/add no headings, commentary, offers, extra fields, or second VERDICT line/i);
    expect(prompt).toMatch(/raw means no Markdown fence, not no wrapper/i);
    expect(prompt).toMatch(/preserve.*JSON value types.*numeric literals.*unquoted/is);
    expect(prompt).toMatch(/syntax\/shape override never relaxes read-only, evidence, attribution, anti-fabrication/is);
    expect(prompt).toMatch(/Never emit a fixed result contrary to evidence/i);
    expect(prompt).toMatch(/explain the incompatibility rather than fabricate/i);
    expect(prompt).toMatch(/When no exclusive response contract is requested, every verification ends/i);
    expect(prompt).not.toContain('### Required Output Format (MANDATORY)');
  });

  it('the universal DOCX hint yields to exact output, no-offer, and no-file constraints', () => {
    const composed = composePersonaPrompt('Core prompt', getPersona('verifier'));
    expect(composed).toMatch(/Offer DOCX for long content only if generate_docx exists and file writes\/offers are allowed/i);
    expect(composed).toMatch(/Never add it to exclusive\/no-prose output unless the payload requires DOCX/i);
  });

  it('Coordinator can specify lanes without launching agents', () => {
    const prompt = personaPrompt('coordinator');
    expect(prompt).toMatch(/forbids agent launches/i);
    expect(prompt).toMatch(/specify.*lanes.*without spawning/i);
    expect(prompt).toMatch(/use only.*supplied.*requirements.*do not invent.*compliance regimes.*deployment targets/i);
  });
});
