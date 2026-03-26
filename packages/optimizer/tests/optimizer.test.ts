import { describe, it, expect, vi } from 'vitest';
import {
  SUMMARIZER_SIGNATURE,
  CLASSIFIER_SIGNATURE,
  PROMPT_EXPANDER_SIGNATURE,
  createSummarizer,
  createClassifier,
  createPromptExpander,
  getProgram,
  PROGRAM_REGISTRY,
} from '../src/signatures.js';
import { PromptOptimizer } from '../src/optimizer.js';
import type { AxAIService } from '@ax-llm/ax';

// Convert camelCase to Title Case (what Ax uses in prompts)
function toTitleCase(camel: string): string {
  return camel.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
}

// Mock AI service that returns predictable outputs
// Must implement enough of AxAIService for AxGen.forward() to work
function createMockAI(responses: Record<string, string>): AxAIService {
  // Format response as Ax expects: Title Case field names followed by values
  const content = Object.entries(responses)
    .map(([k, v]) => `${toTitleCase(k)}: ${v}`)
    .join('\n');

  return {
    chat: vi.fn().mockResolvedValue({
      results: [{ content, index: 0 }],
      modelUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    }),
    embed: vi.fn(),
    getFeatures: vi.fn().mockReturnValue({
      functions: true,
      streaming: true,
      hasThinkingBudget: false,
      hasShowThoughts: false,
      structuredOutputs: false,
      media: {},
      caching: { supported: false, types: [] },
      thinking: false,
      multiTurn: true,
    }),
    getOptions: vi.fn().mockReturnValue({ debug: false, verbose: false }),
    setOptions: vi.fn(),
    getName: vi.fn().mockReturnValue('mock'),
    getId: vi.fn().mockReturnValue('mock-id'),
    getModelList: vi.fn().mockReturnValue([]),
    getLastUsedChatModel: vi.fn().mockReturnValue('mock-model'),
    getLastUsedEmbedModel: vi.fn().mockReturnValue(undefined),
    getLastUsedModelConfig: vi.fn().mockReturnValue(undefined),
    getMetrics: vi.fn().mockReturnValue(undefined),
    getLogger: vi.fn().mockReturnValue(undefined),
  } as unknown as AxAIService;
}

describe('Prompt Optimization (Ax Integration)', () => {
  describe('Signature definitions', () => {
    it('summarizer signature has correct input/output fields', () => {
      const inputs = SUMMARIZER_SIGNATURE.getInputFields();
      const outputs = SUMMARIZER_SIGNATURE.getOutputFields();
      expect(inputs).toHaveLength(1);
      expect(inputs[0].name).toBe('textToSummarize');
      expect(outputs).toHaveLength(1);
      expect(outputs[0].name).toBe('summaryText');
    });

    it('classifier signature has correct input/output fields', () => {
      const inputs = CLASSIFIER_SIGNATURE.getInputFields();
      const outputs = CLASSIFIER_SIGNATURE.getOutputFields();
      expect(inputs).toHaveLength(1);
      expect(inputs[0].name).toBe('textToClassify');
      expect(outputs).toHaveLength(1);
      expect(outputs[0].name).toBe('intentCategory');
      expect(outputs[0].type?.name).toBe('class');
      expect(outputs[0].type?.options).toEqual(['question', 'command', 'observation', 'request', 'greeting']);
    });

    it('prompt expander signature has correct input/output fields', () => {
      const inputs = PROMPT_EXPANDER_SIGNATURE.getInputFields();
      const outputs = PROMPT_EXPANDER_SIGNATURE.getOutputFields();
      expect(inputs).toHaveLength(1);
      expect(inputs[0].name).toBe('briefPrompt');
      expect(outputs).toHaveLength(1);
      expect(outputs[0].name).toBe('expandedPrompt');
    });
  });

  describe('Program creation', () => {
    it('creates summarizer program with instruction', () => {
      const program = createSummarizer();
      expect(program).toBeDefined();
      expect(program.getInstruction()).toContain('summarizer');
    });

    it('creates classifier program with instruction', () => {
      const program = createClassifier();
      expect(program).toBeDefined();
      expect(program.getInstruction()).toContain('Classify');
    });

    it('creates prompt expander program with instruction', () => {
      const program = createPromptExpander();
      expect(program).toBeDefined();
      expect(program.getInstruction()).toContain('expand');
    });
  });

  describe('Program registry', () => {
    it('contains all three programs', () => {
      expect(PROGRAM_REGISTRY).toHaveLength(3);
      const names = PROGRAM_REGISTRY.map(p => p.name);
      expect(names).toContain('summarizer');
      expect(names).toContain('classifier');
      expect(names).toContain('prompt_expander');
    });

    it('getProgram returns correct entry', () => {
      const entry = getProgram('summarizer');
      expect(entry.name).toBe('summarizer');
      expect(typeof entry.create).toBe('function');
      expect(entry.signature).toBe(SUMMARIZER_SIGNATURE);
    });

    it('getProgram throws for unknown program', () => {
      expect(() => getProgram('nonexistent' as any)).toThrow('Unknown program: nonexistent');
    });

    it('each registry entry creates a valid program', () => {
      for (const entry of PROGRAM_REGISTRY) {
        const program = entry.create();
        expect(program).toBeDefined();
        expect(program.getInstruction()).toBeTruthy();
      }
    });
  });

  describe('PromptOptimizer', () => {
    it('lists all available programs', () => {
      const mockAI = createMockAI({});
      const optimizer = new PromptOptimizer({ ai: mockAI });
      const programs = optimizer.listPrograms();
      expect(programs).toEqual(['summarizer', 'classifier', 'prompt_expander']);
    });
  });

  // API-dependent tests - these test actual execution through the Ax framework
  // They use a mock AI service, but still exercise the full AxGen.forward() pipeline
  describe('Signature execution (API-dependent)', () => {
    it('summarizer produces string output type', async () => {
      const mockAI = createMockAI({ summaryText: 'This is a test summary.' });
      const optimizer = new PromptOptimizer({ ai: mockAI });
      const result = await optimizer.execute('summarizer', {
        textToSummarize: 'A long text about AI agents and their capabilities in modern software.',
      });
      expect(result.programName).toBe('summarizer');
      expect(result.input.textToSummarize).toContain('AI agents');
      expect(typeof result.output.summaryText).toBe('string');
    });

    it('classifier returns valid category', async () => {
      const mockAI = createMockAI({ intentCategory: 'question' });
      const optimizer = new PromptOptimizer({ ai: mockAI });
      const result = await optimizer.execute('classifier', {
        textToClassify: 'What is the weather like today?',
      });
      expect(result.programName).toBe('classifier');
      expect(['question', 'command', 'observation', 'request', 'greeting']).toContain(
        result.output.intentCategory
      );
    });

    it('prompt expander produces expanded output', async () => {
      const mockAI = createMockAI({ expandedPrompt: 'Please write a comprehensive blog post about AI, covering...' });
      const optimizer = new PromptOptimizer({ ai: mockAI });
      const result = await optimizer.execute('prompt_expander', {
        briefPrompt: 'Write about AI',
      });
      expect(result.programName).toBe('prompt_expander');
      expect(typeof result.output.expandedPrompt).toBe('string');
      expect(result.output.expandedPrompt.length).toBeGreaterThan(0);
    });
  });

  describe('Intent classification across categories', () => {
    const categories = [
      { input: 'What time is it?', expected: 'question' },
      { input: 'Delete all files now', expected: 'command' },
      { input: 'The sky is blue', expected: 'observation' },
      { input: 'Can you help me with this?', expected: 'request' },
      { input: 'Hello, how are you?', expected: 'greeting' },
    ];

    for (const { input, expected } of categories) {
      it(`classifies "${input}" as ${expected}`, async () => {
        const mockAI = createMockAI({ intentCategory: expected });
        const optimizer = new PromptOptimizer({ ai: mockAI });
        const category = await optimizer.classify(input);
        expect(category).toBe(expected);
      });
    }
  });

  describe('Convenience methods', () => {
    it('summarize() returns summary string', async () => {
      const mockAI = createMockAI({ summaryText: 'Brief summary here.' });
      const optimizer = new PromptOptimizer({ ai: mockAI });
      const summary = await optimizer.summarize('Long text about many topics...');
      expect(typeof summary).toBe('string');
      expect(summary.length).toBeGreaterThan(0);
    });

    it('expandPrompt() returns expanded string', async () => {
      const mockAI = createMockAI({ expandedPrompt: 'Detailed expanded prompt...' });
      const optimizer = new PromptOptimizer({ ai: mockAI });
      const expanded = await optimizer.expandPrompt('Fix bug');
      expect(typeof expanded).toBe('string');
      expect(expanded.length).toBeGreaterThan(0);
    });
  });
});
