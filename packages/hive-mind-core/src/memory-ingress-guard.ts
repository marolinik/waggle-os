import { scanForInjection, type ScanResult } from './injection-scanner.js';

export interface ExternalMemoryIngressInput {
  title?: string;
  content: string;
}

export type ExternalMemoryIngressDecision =
  | { action: 'allow'; scan: ScanResult }
  | { action: 'block'; reason: 'prompt_injection'; scan: ScanResult };

/** Evaluate untrusted content before it can enter persistent memory. */
export function evaluateExternalMemoryIngress(
  input: ExternalMemoryIngressInput,
): ExternalMemoryIngressDecision {
  const scan = scanForInjection(`${input.title ?? ''}\n${input.content}`, 'tool_output');

  return scan.safe
    ? { action: 'allow', scan }
    : { action: 'block', reason: 'prompt_injection', scan };
}
