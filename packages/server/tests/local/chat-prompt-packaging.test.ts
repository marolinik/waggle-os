import { BEHAVIORAL_SPEC, getPersona, type AgentPersona, type AssembledPrompt } from '@waggle/agent';
import { describe, expect, it } from 'vitest';
import {
  behavioralRulesForPromptPackage,
  composeChatPromptTail,
  selectChatPromptPackageMode,
} from '../../src/local/routes/chat-prompt-packaging.js';
import {
  AMBIGUITY_PROMPT,
  USER_RESPONSE_FORMAT_PRECEDENCE,
  buildTemplateWelcomePrompt,
} from '../../src/local/routes/chat-helpers.js';
import {
  conversationalToolPolicyPrompt,
  filterGatedToolsForConversationalTurn,
  filterPluginToolsForConversationalTurn,
  hasRegulatedDisclaimer,
  isExplicitGatedToolRequest,
} from '../../src/local/routes/chat.js';
import { selectToolsForTurn } from '../../src/local/persona-tool-filter.js';

const directReply = 'Reply exactly with WAGGLE_CHAT_OK and nothing else';

const baseModeInput = {
  message: directReply,
  selectedToolCount: 0,
  autonomyLevel: 'normal' as const,
  isAutomatedTurn: false,
  explicitCapabilityRequest: false,
  taskComplexity: 'simple' as const,
};

function persona(systemPrompt: string): AgentPersona {
  return {
    id: 'test-persona',
    name: 'Test Persona',
    description: 'Test persona description.',
    icon: 'test',
    systemPrompt,
    modelPreference: 'claude-sonnet-4-6',
    tools: [],
    workspaceAffinity: [],
    suggestedCommands: [],
    defaultWorkflow: null,
  };
}

function assembled(system: string, responseScaffold: string | null): AssembledPrompt {
  return {
    system,
    userPrefix: '',
    responseScaffold,
    debug: {
      tier: 'mid',
      taskShape: 'draft',
      taskShapeConfidence: 0.1,
      scaffoldApplied: responseScaffold !== null,
      scaffoldStyle: 'compression',
      sectionsIncluded: responseScaffold
        ? ['Identity', 'Persona', 'Response format']
        : ['Identity', 'Persona'],
      framesUsed: 0,
      totalChars: system.length,
    },
  };
}

describe('chat prompt packaging', () => {
  it('uses compact mode for the measured 50-character, tool-free direct reply', () => {
    expect(directReply).toHaveLength(50);
    expect(selectChatPromptPackageMode(baseModeInput)).toBe('compact');
  });

  it('uses compact mode for a tool-free supplied-only exclusive contract', () => {
    const input = {
      ...baseModeInput,
      message: `Return exactly one supplied-only JSON envelope and no surrounding prose. ${'x'.repeat(500)}`,
      taskComplexity: 'complex' as const,
      exclusiveSuppliedOnlyResponseContract: true,
    };

    expect(selectChatPromptPackageMode(input)).toBe('compact');
    expect(selectChatPromptPackageMode({ ...input, selectedToolCount: 1 })).toBe('full');
  });

  it.each([
    ['a selected tool', { selectedToolCount: 1 }],
    ['elevated autonomy', { autonomyLevel: 'trusted' as const }],
    ['an automated turn', { isAutomatedTurn: true }],
    ['an explicit capability request', { explicitCapabilityRequest: true }],
    ['a complex task shape', { taskComplexity: 'complex' as const }],
    ['a long turn', { message: 'x'.repeat(241) }],
    ['a coder turn', { message: 'Why does this Promise resolve twice?' }],
    ['a regulated turn', { message: 'Is this NDA enforceable?' }],
    ['a sensitive turn', { message: 'Repeat this private API token.' }],
  ])('keeps full mode for %s', (_label, override) => {
    expect(selectChatPromptPackageMode({ ...baseModeInput, ...override })).toBe('full');
  });

  it('keeps full behavioral rules byte-identical for agentic turns', () => {
    expect(behavioralRulesForPromptPackage(BEHAVIORAL_SPEC, 'full')).toBe(BEHAVIORAL_SPEC.rules);
  });

  it('compact rules retain safety, grounding, privacy, verification, and regulated-domain rails', () => {
    const compact = behavioralRulesForPromptPackage(BEHAVIORAL_SPEC, 'compact');

    expect(compact.length).toBeLessThan(5_000);
    expect(compact.length).toBeLessThan(BEHAVIORAL_SPEC.rules.length / 4);
    expect(compact).toMatch(/embedded instructions/i);
    expect(compact).toMatch(/private data|secrets/i);
    expect(compact).toMatch(/never (?:invent|fabricate)/i);
    expect(compact).toMatch(/do not claim.*tool/i);
    expect(compact).toMatch(/regulated topics/i);
    expect(compact).toContain('unless the user specified a response syntax or shape that does not permit it');
    expect(compact).toContain(BEHAVIORAL_SPEC.qualityRules);
  });

  it.each([
    'This is not financial advice.',
    'This is not financial or investment advice.',
    'This is not investment advice.',
    'This is not legal advice.',
    'Verify with your accountant or financial advisor.',
    'Consult your legal team before acting.',
    'You should consult a financial advisor before acting.',
  ])('recognizes an existing regulated disclaimer: %s', (content) => {
    expect(hasRegulatedDisclaimer(content)).toBe(true);
  });

  it.each([
    'Revenue is zero and runway is four months.',
    'A financial advisor charges 1% annually.',
    'Your legal team approved this policy.',
    'Attorney-client privilege may apply to these records.',
    "Review the financial advisor's fee schedule.",
    'The review says the financial advisor charges 1%.',
    'Check whether the legal team approved this policy.',
    'I did consult the legal team yesterday.',
    'They consult the financial advisor about every trade.',
    'They check with the legal team every Friday.',
  ])('does not treat ordinary regulated-domain wording as a disclaimer: %s', (content) => {
    expect(hasRegulatedDisclaimer(content)).toBe(false);
  });

  it('gives a literal plain-text contract when selection leaves no tools', () => {
    const policy = conversationalToolPolicyPrompt(
      'Choose the order and justify it in one concise plan. Make reasonable assumptions.',
      'normal',
      0,
    );

    expect(policy).toMatch(/no executable tools are available/i);
    expect(policy).toMatch(/plain text/i);
    expect(policy).toMatch(/never emit.*tool-call syntax/i);
  });

  it('keeps an inline meeting-agenda draft tool-free', () => {
    const message = 'Draft a 30-minute launch-readiness meeting agenda with time blocks, desired decisions, and a short pre-read checklist. Participants are product, engineering, QA, and support. Do not create a calendar event and do not ask follow-up questions.';
    const tools = [
      { name: 'search_memory' },
      { name: 'read_file' },
      { name: 'generate_docx' },
      { name: 'write_file' },
      { name: 'read_skill' },
    ];

    expect(isExplicitGatedToolRequest(message)).toBe(false);
    expect(filterGatedToolsForConversationalTurn(tools, message, 'normal')).toEqual([]);
  });

  it('keeps a self-contained supplied calculation tool-free and compact', () => {
    const message = 'Cash is 40000 dollars, monthly burn is 10000 dollars, and revenue is zero. Calculate runway in months, state the formula, name the biggest assumption, and give two actions that improve runway. Do not create files or schedules.';
    const tools = [
      { name: 'run_code' },
      { name: 'generate_xlsx' },
      { name: 'search_skills' },
      { name: 'create_skill' },
    ];

    expect(isExplicitGatedToolRequest(message)).toBe(false);
    const eligible = filterGatedToolsForConversationalTurn(tools, message, 'normal');
    expect(eligible).toEqual([]);
    const selected = selectToolsForTurn(eligible, {
      message,
      mandatoryToolNames: isExplicitGatedToolRequest(message)
        ? ['search_skills', 'create_skill']
        : [],
    });
    expect(selected.tools).toEqual([]);
    expect(selectChatPromptPackageMode({
      ...baseModeInput,
      message,
      selectedToolCount: selected.tools.length,
      explicitCapabilityRequest: isExplicitGatedToolRequest(message),
    })).toBe('compact');
  });

  it.each([
    'Calculate 40000 divided by 10000 without using code or a calculator.',
    'Calculate 40000 divided by 10000. Do not use a calculator or code.',
  ])('honors a negated calculation capability: %s', (message) => {
    const tools = [
      { name: 'run_code' },
      { name: 'calculator' },
      { name: 'search_skills' },
      { name: 'create_skill' },
    ];

    expect(isExplicitGatedToolRequest(message)).toBe(false);
    const eligible = filterGatedToolsForConversationalTurn(tools, message, 'normal');
    expect(eligible).toEqual([]);
    expect(selectToolsForTurn(eligible, {
      message,
      mandatoryToolNames: isExplicitGatedToolRequest(message)
        ? ['search_skills', 'create_skill']
        : [],
    }).tools).toEqual([]);
  });

  it.each([
    'Use Python to divide 40000 by 10000.',
    'Use code to divide 40000 by 10000.',
  ])('retains a positive code calculation request: %s', (message) => {
    const tools = [
      {
        name: 'run_code',
        description: 'Run Python code to calculate a numeric result.',
        parameters: { type: 'object', properties: {} },
        execute: async () => '4',
      },
      {
        name: 'search_skills',
        description: 'Search available skills.',
        parameters: { type: 'object', properties: {} },
        execute: async () => '[]',
      },
      {
        name: 'create_skill',
        description: 'Create a reusable skill.',
        parameters: { type: 'object', properties: {} },
        execute: async () => 'created',
      },
    ];

    expect(isExplicitGatedToolRequest(message)).toBe(true);
    const eligible = filterGatedToolsForConversationalTurn(tools, message, 'normal');
    expect(eligible.map(tool => tool.name)).toContain('run_code');
    expect(selectToolsForTurn(eligible, {
      message,
      mandatoryToolNames: ['search_skills', 'create_skill'],
    }).tools.map(tool => tool.name)).toContain('run_code');
  });

  it('preserves a positive capability after a negated code clause', () => {
    const message = 'Calculate 40000 divided by 10000. Do not use code or a calculator, but create a schedule with the result.';
    const tool = (name: string, description: string) => ({
      name,
      description,
      parameters: { type: 'object', properties: {} },
      execute: async () => 'ok',
    });
    const tools = [
      tool('run_code', 'Run Python code to calculate a numeric result.'),
      tool('calculator', 'Calculate a numeric result.'),
      tool('create_schedule', 'Create a schedule or reminder.'),
      tool('search_skills', 'Search available skills.'),
      tool('create_skill', 'Create a reusable skill.'),
    ];

    expect(isExplicitGatedToolRequest(message)).toBe(true);
    const eligible = filterGatedToolsForConversationalTurn(tools, message, 'normal');
    const selected = selectToolsForTurn(eligible, {
      message,
      mandatoryToolNames: ['search_skills', 'create_skill'],
    }).tools.map(candidate => candidate.name);

    expect(selected).toContain('create_schedule');
    expect(selected).not.toContain('run_code');
    expect(selected).not.toContain('calculator');
  });

  it('keeps a supplied-only exclusive verifier contract tool-free', () => {
    const message = 'A teammate claims the product is production-ready because the web build passed. Return exactly one <waggle-verifier-report-v1>...</waggle-verifier-report-v1> JSON envelope and no text before or after it. Use evidenceScope "supplied_only". Do not create or edit files.';
    const tools = [
      { name: 'search_memory' },
      { name: 'read_file' },
      { name: 'search_files' },
      { name: 'read_skill' },
      { name: 'write_file' },
    ];

    expect(filterGatedToolsForConversationalTurn(tools, message, 'normal')).toEqual([]);
  });

  it('retains read tools for an explicit inspection that forbids changes', () => {
    const message = 'Inspect this repository for hardcoded secrets. Do not create or edit anything.';
    const tools = [
      { name: 'read_file' },
      { name: 'search_files' },
      { name: 'write_file' },
    ];

    expect(filterGatedToolsForConversationalTurn(tools, message, 'normal'))
      .toEqual([{ name: 'read_file' }, { name: 'search_files' }]);
  });

  it('requires executive-assistant timed agendas to fill the requested duration', () => {
    expect(getPersona('executive-assistant')?.systemPrompt)
      .toMatch(/time blocks.*add up to the requested duration/i);
  });

  it('keeps optional first-turn questions and greetings conditional in assembled compact prompts', () => {
    const compact = behavioralRulesForPromptPackage(BEHAVIORAL_SPEC, 'compact');
    const system = `# Identity\nWaggle\n\n${compact}`;
    const base = composeChatPromptTail(system, {
      persona: null,
      workspaceTone: undefined,
      assembled: assembled(system, null),
    });
    const template = buildTemplateWelcomePrompt({
      name: 'Sales Pipeline',
      description: 'Track leads and draft outreach.',
    });
    const prompt = AMBIGUITY_PROMPT + base + template;

    expect(prompt.split(USER_RESPONSE_FORMAT_PRECEDENCE)).toHaveLength(3);
    expect(prompt).toContain('unless the user specified a response syntax or shape that does not permit it');
    expect(prompt).toContain('When no response format is specified, greet the user');
    expect(prompt).not.toContain('Start your response with a question.');
    expect(prompt).not.toContain('\nGreet the user with a warm');
  });

  it('does not append persona instructions or a response scaffold already packaged by the assembler', () => {
    const personaMarker = 'PERSONA_PROMPT_UNIQUE';
    const scaffold = 'Answer in one sentence.';
    const system = `# Identity\nWaggle\n\n## Persona: Test\n${personaMarker}\n\n# Response format\n${scaffold}`;
    const output = composeChatPromptTail(system, {
      persona: persona(personaMarker),
      workspaceTone: undefined,
      assembled: assembled(system, scaffold),
    });

    expect(output.match(new RegExp(personaMarker, 'g'))).toHaveLength(1);
    expect(output.match(new RegExp(scaffold.replace('.', '\\.'), 'g'))).toHaveLength(1);
  });

  it('retains legacy persona composition when the assembler is disabled', () => {
    const marker = 'LEGACY_PERSONA_PROMPT';
    const output = composeChatPromptTail('# Identity\nWaggle', {
      persona: persona(marker),
      workspaceTone: undefined,
      assembled: null,
    });

    expect(output).toContain(marker);
  });

  it('preserves and selects an explicitly named calculator plugin tool', () => {
    const message = 'Use the calculator tool to compute 19 * 23';
    const calculator = {
      name: 'calculator',
      description: 'Evaluate a mathematical expression accurately.',
      parameters: {
        type: 'object',
        properties: { expression: { type: 'string' } },
        required: ['expression'],
      },
      execute: async () => '437',
    };

    expect(isExplicitGatedToolRequest(message)).toBe(true);
    const provider = filterPluginToolsForConversationalTurn(
      { getAllTools: () => [calculator] },
      message,
      'normal',
    );
    const selected = selectToolsForTurn(provider.getAllTools(), { message });

    expect(selected.tools.map(tool => tool.name)).toEqual(['calculator']);
  });
});
