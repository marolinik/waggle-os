import type { AxAIService } from '@ax-llm/ax';
import { type ProgramName, getProgram, PROGRAM_REGISTRY } from './signatures.js';

export interface ExecutionResult {
  programName: ProgramName;
  input: Record<string, string>;
  output: Record<string, string>;
}

export interface OptimizerConfig {
  ai: AxAIService;
}

export class PromptOptimizer {
  private ai: AxAIService;

  constructor(config: OptimizerConfig) {
    this.ai = config.ai;
  }

  async execute(programName: ProgramName, input: Record<string, string>): Promise<ExecutionResult> {
    const entry = getProgram(programName);
    const program = entry.create();
    const result = await program.forward(this.ai, input);
    return {
      programName,
      input,
      output: result as Record<string, string>,
    };
  }

  async summarize(text: string): Promise<string> {
    const result = await this.execute('summarizer', { textToSummarize: text });
    return result.output.summaryText;
  }

  async classify(text: string): Promise<string> {
    const result = await this.execute('classifier', { textToClassify: text });
    return result.output.intentCategory;
  }

  async expandPrompt(text: string): Promise<string> {
    const result = await this.execute('prompt_expander', { briefPrompt: text });
    return result.output.expandedPrompt;
  }

  listPrograms(): ProgramName[] {
    return PROGRAM_REGISTRY.map(p => p.name);
  }
}
