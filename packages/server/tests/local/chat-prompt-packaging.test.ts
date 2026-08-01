import { BEHAVIORAL_SPEC, CLOSED_WORLD_REWRITE_CONTRACT, detectTaskShape, getPersona, type AgentPersona, type AssembledPrompt } from '@waggle/agent';
import { describe, expect, it } from 'vitest';
import {
  behavioralRulesForPromptPackage,
  composeClosedWorldChatPrompt,
  composeEvidenceBoundedChatPrompt,
  composeChatPromptTail,
  composeToolFreeAdvisoryChatPrompt,
  selectChatPromptPackageMode,
} from '../../src/local/routes/chat-prompt-packaging.js';
import {
  AMBIGUITY_PROMPT,
  USER_RESPONSE_FORMAT_PRECEDENCE,
  buildTemplateWelcomePrompt,
  classifyExplicitTurnMutationPolicy,
} from '../../src/local/routes/chat-helpers.js';
import {
  conversationalToolPolicyPrompt,
  filterGatedToolsForConversationalTurn,
  filterPluginToolsForConversationalTurn,
  isExplicitGatedToolRequest,
  shouldPackageSystemPromptForTurn,
} from '../../src/local/routes/chat.js';
import { selectToolsForTurn } from '../../src/local/persona-tool-filter.js';
import { PERSONA_CASES } from '../../../../tests/vision/persona-cases.js';

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

function canonicalPrompt(id: 'coder' | 'verifier'): string {
  const acceptanceCase = PERSONA_CASES.find(item => item.id === id);
  if (!acceptanceCase) throw new Error(`Missing canonical persona case: ${id}`);
  return acceptanceCase.prompt;
}

function canonicalPersona(id: 'coder' | 'verifier'): AgentPersona {
  const result = getPersona(id);
  if (!result) throw new Error(`Missing canonical persona: ${id}`);
  return result;
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
    expect(selectChatPromptPackageMode({ ...input, explicitCapabilityRequest: true })).toBe('compact');
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

  it('bounds the canonical compact advisory in the terminal contract', () => {
    const acceptanceCase = PERSONA_CASES.find(item => item.id === 'data-engineer');
    const dataEngineer = getPersona('data-engineer');
    if (!dataEngineer) throw new Error('Missing canonical data-engineer persona');

    expect(acceptanceCase?.prompt).toMatch(/\bcompact Python example\b/i);
    const output = composeToolFreeAdvisoryChatPrompt({
      persona: dataEngineer,
      behavioralSpec: BEHAVIORAL_SPEC,
      packageMode: 'compact',
    });
    const terminalStart = output.lastIndexOf('# SELF-CONTAINED ADVISORY TURN');
    const terminalContract = output.slice(terminalStart);

    expect(terminalStart).toBeGreaterThan(output.indexOf(BEHAVIORAL_SPEC.qualityRules));
    expect(terminalContract).toContain(
      'When any requested deliverable is described as compact, concise, brief, or short',
    );
    expect(terminalContract).toContain('entire response under 800 words including code');
    expect(terminalContract).toContain('unless the user explicitly requests a different response length');
    expect(terminalContract).toContain('Complete each requested deliverable once');
    expect(terminalContract).toContain('provide at most one implementation');
    expect(terminalContract).toContain(
      'omit optional extensions, tutorials, alternatives, and repeated explanation',
    );
    expect(terminalContract).toContain('finish cleanly before the output limit');
    expect(output.endsWith('do not mention this boundary.')).toBe(true);
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

  it('keeps a supplied inline calculation tool-free and compact', () => {
    const finance = PERSONA_CASES.find(item => item.id === 'finance-owner')!;
    const tools = [
      { name: 'calculator' },
      { name: 'search_memory' },
      { name: 'read_file' },
      { name: 'write_file' },
      { name: 'send_email' },
      { name: 'create_calendar_event' },
    ];
    const explicitCapabilityRequest = isExplicitGatedToolRequest(finance.prompt);
    const selected = filterGatedToolsForConversationalTurn(tools, finance.prompt, 'normal');
    const taskShape = detectTaskShape(finance.prompt);

    expect(explicitCapabilityRequest).toBe(false);
    expect(selected).toEqual([]);
    expect(taskShape.complexity).toBe('simple');
    expect(selectChatPromptPackageMode({
      ...baseModeInput,
      message: finance.prompt,
      selectedToolCount: selected.length,
      explicitCapabilityRequest,
      taskComplexity: taskShape.complexity,
    })).toBe('compact');
    const workbookRequest = 'Create an XLSX runway workbook using cash 40000 and burn 10000.';
    expect(isExplicitGatedToolRequest(workbookRequest)).toBe(true);
    expect(filterGatedToolsForConversationalTurn(tools, workbookRequest, 'normal'))
      .toContainEqual({ name: 'write_file' });
    expect(isExplicitGatedToolRequest('Please calculate 40000 / 10000 in a workbook.')).toBe(true);

    const savedFilesRequest = 'Calculate runway from the two values in my saved files.';
    expect(isExplicitGatedToolRequest(savedFilesRequest)).toBe(true);
    expect(filterGatedToolsForConversationalTurn(tools, savedFilesRequest, 'normal'))
      .toContainEqual({ name: 'read_file' });

    const explicitCalculatorRequest = 'Calculate 40000 / 10000. Do not create files, but use calculator.';
    expect(isExplicitGatedToolRequest(explicitCalculatorRequest)).toBe(true);
    expect(filterGatedToolsForConversationalTurn(tools, explicitCalculatorRequest, 'normal'))
      .toContainEqual({ name: 'calculator' });

    for (const negatedCalculatorRequest of [
      'Do not use the calculator tool. Calculate 40000 / 10000.',
      'Calculate 40000 / 10000. Do not create files, but do not use calculator.',
      'Without using the calculator tool, calculate 40000 / 10000.',
      'Calculate 40000 / 10000 using the supplied figures.',
      'Calculate 40000 / 10000; you must not use a calculator.',
      'Calculate 40000 / 10000; you should not use a calculator.',
      'Calculate 40000 / 10000; you cannot use a calculator.',
      'Avoid using the calculator; calculate 40000 / 10000.',
      'No calculator: calculate 40000 / 10000 from the supplied figures.',
      'Calculate 40000 / 10000, not using the calculator.',
      'Calculate 40000 / 10000 without use of a calculator.',
      'Do not use: calculator. Calculate 40000 / 10000.',
      'Avoid using: calculator. Calculate 40000 / 10000.',
      'Avoid the calculator. Calculate 40000 / 10000 from supplied figures.',
      'Refrain from using the calculator; calculate 40000 / 10000.',
      'Calculator use is prohibited; calculate 40000 / 10000.',
      'Using a calculator is prohibited; calculate 40000 / 10000.',
      'The calculator is prohibited; calculate 40000 / 10000.',
      'Calculator use is not allowed; calculate 40000 / 10000.',
      'Calculate 40000 / 10000. You do not need to use a calculator.',
      'There is no need to use a calculator; calculate 40000 / 10000.',
      'Calculate 40000 / 10000. A calculator is not needed.',
      'Calculate 40000 / 10000 and return the answer here, not in a file.',
      'The share price is 10 dollars; calculate 40000 / 10000.',
      'Calculate 40000 / 10000 and phrase it as a clear message.',
      'Do not email and publish the result.',
      'Do not email, publish, or upload the result.',
      'Do not create and edit files. Reply with OK.',
    ]) {
      expect(isExplicitGatedToolRequest(negatedCalculatorRequest), negatedCalculatorRequest).toBe(false);
      expect(filterGatedToolsForConversationalTurn(tools, negatedCalculatorRequest, 'normal'))
        .not.toContainEqual({ name: 'calculator' });
    }

    const negativeOnlyEdit = 'Do not edit files. Reply with OK.';
    expect(isExplicitGatedToolRequest(negativeOnlyEdit)).toBe(false);
    expect(filterGatedToolsForConversationalTurn(tools, negativeOnlyEdit, 'normal')).toEqual([]);

    const calculatorAfterDenial = 'Calculate 40000 / 10000 without creating a file and use the calculator tool.';
    expect(isExplicitGatedToolRequest(calculatorAfterDenial)).toBe(true);
    expect(filterGatedToolsForConversationalTurn(tools, calculatorAfterDenial, 'normal'))
      .toContainEqual({ name: 'calculator' });

    const emailRequest = 'Calculate 40000 / 10000 and email the result to the CFO.';
    expect(isExplicitGatedToolRequest(emailRequest)).toBe(true);
    expect(filterGatedToolsForConversationalTurn(tools, emailRequest, 'normal'))
      .toContainEqual({ name: 'send_email' });
    for (const externalActionRequest of [
      'Calculate 40000 / 10000 and update the dashboard.',
      'Calculate 40000 / 10000 and message the finance team.',
      'Calculate 40000 / 10000 and share the result.',
      'Calculate 40000 / 10000 and publish the report.',
      'Calculate 40000 / 10000 and upload the result.',
      'Do not use the calculator\nCalculate 40000 / 10000 and email the result to the CFO.',
      'Calculate 40000 / 10000. Do not use the calculator\nUpdate the dashboard with the result.',
      'Calculate 40000 / 10000 without using the calculator\nMessage the finance team with the result.',
      'Do not use the calculator\n- Calculate 40000 / 10000\n- Share the result.',
      'Never use the calculator\nUpload the result after calculating 40000 / 10000.',
      'Do not use the calculator: calculate 40000 / 10000 and email the result.',
      'Do not use the calculator — calculate 40000 / 10000 and publish the result.',
      'Avoid using the calculator: calculate 40000 / 10000 and email the result.',
    ]) {
      expect(isExplicitGatedToolRequest(externalActionRequest), externalActionRequest).toBe(true);
    }
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

  it('keeps the closed-world contract last and discards an unsafe assembled context', () => {
    const marker = 'CLOSED_WORLD_PERSONA_MARKER';
    const unsafeSystem = `# Identity\nOutside memory says shipping is safe.\n\n${CLOSED_WORLD_REWRITE_CONTRACT}`;
    const unsafeAssembled = assembled(unsafeSystem, null);
    unsafeAssembled.debug.closedWorldRewrite = true;
    unsafeAssembled.debug.sectionsIncluded = ['Identity', 'Closed-world rewrite'];

    const output = composeClosedWorldChatPrompt({
      persona: persona(marker),
      assembled: unsafeAssembled,
      behavioralSpec: BEHAVIORAL_SPEC,
    });

    expect(output).toContain(marker);
    expect(output).not.toContain('Outside memory says shipping is safe.');
    expect(output).toMatch(/never (?:invent|fabricate)/i);
    expect(output.endsWith(CLOSED_WORLD_REWRITE_CONTRACT)).toBe(true);
    expect(output.match(/# Closed-world rewrite/g)).toHaveLength(1);
  });

  it('reuses a safe assembled persona without duplication', () => {
    const marker = 'ASSEMBLED_CLOSED_WORLD_PERSONA';
    const safeSystem = `## Persona: Test\n${marker}\n\n${CLOSED_WORLD_REWRITE_CONTRACT}`;
    const safeAssembled = assembled(safeSystem, null);
    safeAssembled.debug.closedWorldRewrite = true;
    safeAssembled.debug.sectionsIncluded = ['Persona', 'Closed-world rewrite'];

    const output = composeClosedWorldChatPrompt({
      persona: persona(marker),
      assembled: safeAssembled,
      behavioralSpec: BEHAVIORAL_SPEC,
    });

    expect(output.match(new RegExp(marker, 'g'))).toHaveLength(1);
    expect(output.endsWith(CLOSED_WORLD_REWRITE_CONTRACT)).toBe(true);
  });

  it('fails closed when an assembled rewrite is missing the terminal contract', () => {
    const marker = 'FALLBACK_CLOSED_WORLD_PERSONA';
    const unsafeAssembled = assembled('## Persona: Test\nASSEMBLED_WITHOUT_CONTRACT', null);
    unsafeAssembled.debug.closedWorldRewrite = true;
    unsafeAssembled.debug.sectionsIncluded = ['Persona', 'Closed-world rewrite'];

    const output = composeClosedWorldChatPrompt({
      persona: persona(marker),
      assembled: unsafeAssembled,
      behavioralSpec: BEHAVIORAL_SPEC,
    });

    expect(output).toContain(marker);
    expect(output).not.toContain('ASSEMBLED_WITHOUT_CONTRACT');
    expect(output.endsWith(CLOSED_WORLD_REWRITE_CONTRACT)).toBe(true);
  });

  it('packages the canonical verifier turn inside a supplied-only evidence boundary', () => {
    const message = canonicalPrompt('verifier');
    const policy = classifyExplicitTurnMutationPolicy(message);
    expect(policy.contextScope).toBe('supplied-only');

    const output = composeEvidenceBoundedChatPrompt({
      persona: canonicalPersona('verifier'),
      behavioralSpec: BEHAVIORAL_SPEC,
      contextScope: 'supplied-only',
      selectedToolCount: 0,
    });

    expect(output).toContain('Verifier');
    expect(output).toMatch(/No tools are available/i);
    expect(output).toMatch(/current user message is the complete evidence boundary/i);
    expect(output).not.toContain('# Context From Your Memory');
    expect(output).not.toContain('# Recalled Memories');
    expect(output).not.toContain("# Why You're Here");
    expect(output.endsWith('Do not mention this boundary.')).toBe(true);
  });

  it('packages the canonical coder turn for workspace-rooted reads without recalled context', () => {
    const message = canonicalPrompt('coder');
    const policy = classifyExplicitTurnMutationPolicy(message);
    expect(policy.contextScope).toBe('workspace-only');

    const output = composeEvidenceBoundedChatPrompt({
      persona: canonicalPersona('coder'),
      behavioralSpec: BEHAVIORAL_SPEC,
      contextScope: 'workspace-only',
      selectedToolCount: 3,
      workspacePath: 'C:\\workspaces\\canonical-coder',
    });

    expect(output).toContain('Coder');
    expect(output).toContain('C:\\workspaces\\canonical-coder');
    expect(output).not.toMatch(/No tools are available in this compact turn/i);
    expect(output).toMatch(/successful workspace-rooted read tools/i);
    expect(output).toMatch(/never (?:inspect|read).*parent/i);
    expect(output).not.toContain('# Context From Your Memory');
    expect(output).not.toContain('# Recalled Memories');
    expect(output).not.toContain("# Why You're Here");
    expect(output.endsWith('Do not mention this boundary.')).toBe(true);
  });

  it('forces a tool-free bounded system package for an injected runner', () => {
    expect(shouldPackageSystemPromptForTurn(true, 'workspace-only', false)).toBe(true);
    expect(shouldPackageSystemPromptForTurn(true, 'supplied-only', false)).toBe(true);
    expect(shouldPackageSystemPromptForTurn(true, 'default', true)).toBe(true);
    expect(shouldPackageSystemPromptForTurn(true, 'default', false)).toBe(false);
    expect(shouldPackageSystemPromptForTurn(false, 'default', false)).toBe(true);

    const output = composeEvidenceBoundedChatPrompt({
      persona: canonicalPersona('coder'),
      behavioralSpec: BEHAVIORAL_SPEC,
      contextScope: 'workspace-only',
      selectedToolCount: 0,
      workspacePath: 'C:\\workspaces\\custom-runner',
    });

    expect(output).toMatch(/No tools are available in this compact turn/i);
    expect(output).toContain('C:\\workspaces\\custom-runner');
    expect(output.endsWith('Do not mention this boundary.')).toBe(true);
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
