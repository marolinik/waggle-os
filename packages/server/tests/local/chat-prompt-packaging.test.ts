import { BEHAVIORAL_SPEC, type AgentPersona, type AssembledPrompt } from '@waggle/agent';
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
  filterPluginToolsForConversationalTurn,
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
