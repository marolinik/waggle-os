import { AxGen, AxSignature } from '@ax-llm/ax';
import type { AxAIService } from '@ax-llm/ax';

// --- Signature Definitions ---

export const SUMMARIZER_SIGNATURE = new AxSignature(
  'textToSummarize:string "The text content to summarize" -> summaryText:string "A concise summary of the input text"'
);

export const CLASSIFIER_SIGNATURE = new AxSignature(
  'textToClassify:string "Text to classify into a category" -> intentCategory:class "question, command, observation, request, greeting"'
);

export const PROMPT_EXPANDER_SIGNATURE = new AxSignature(
  'briefPrompt:string "A brief or vague user prompt" -> expandedPrompt:string "A detailed, well-structured prompt with clear instructions"'
);

// --- Program Definitions ---

export function createSummarizer(): AxGen {
  const gen = new AxGen(SUMMARIZER_SIGNATURE);
  gen.setInstruction(
    'You are a precise summarizer. Produce a concise summary that captures the key points of the input text. ' +
    'Keep the summary under 3 sentences.'
  );
  return gen;
}

export function createClassifier(): AxGen {
  const gen = new AxGen(CLASSIFIER_SIGNATURE);
  gen.setInstruction(
    'Classify the user input into exactly one intent category. ' +
    'question = asking for information, command = directing an action, ' +
    'observation = stating a fact, request = asking for help, greeting = social pleasantry.'
  );
  return gen;
}

export function createPromptExpander(): AxGen {
  const gen = new AxGen(PROMPT_EXPANDER_SIGNATURE);
  gen.setInstruction(
    'Take a brief or vague user prompt and expand it into a detailed, well-structured prompt. ' +
    'Add context, specify the desired format, and clarify ambiguities. ' +
    'The expanded prompt should be actionable by an AI assistant.'
  );
  return gen;
}

// --- Program Registry ---

export type ProgramName = 'summarizer' | 'classifier' | 'prompt_expander';

export interface ProgramEntry {
  name: ProgramName;
  create: () => AxGen;
  signature: AxSignature;
}

export const PROGRAM_REGISTRY: ProgramEntry[] = [
  { name: 'summarizer', create: createSummarizer, signature: SUMMARIZER_SIGNATURE },
  { name: 'classifier', create: createClassifier, signature: CLASSIFIER_SIGNATURE },
  { name: 'prompt_expander', create: createPromptExpander, signature: PROMPT_EXPANDER_SIGNATURE },
];

export function getProgram(name: ProgramName): ProgramEntry {
  const entry = PROGRAM_REGISTRY.find(p => p.name === name);
  if (!entry) throw new Error(`Unknown program: ${name}`);
  return entry;
}
