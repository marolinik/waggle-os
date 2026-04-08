/**
 * Agent Personas — predefined role configurations with system prompts,
 * tool presets, model preferences, and workspace affinity.
 *
 * Personas extend (not replace) the core system prompt. The persona prompt
 * is appended after the core prompt via composePersonaPrompt().
 *
 * The PERSONAS data array lives in persona-data.ts (pure declarative data).
 * This file owns the AgentPersona interface and all persona logic.
 */

import { loadCustomPersonas } from './custom-personas.js';
import { PERSONAS } from './persona-data.js';

export { PERSONAS };

export interface AgentPersona {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Role-specific instructions appended after core system prompt */
  systemPrompt: string;
  /** Suggested model (overridable by user) */
  modelPreference: string;
  /** Tool subset this persona uses */
  tools: string[];
  /** Workspace types this persona suits */
  workspaceAffinity: string[];
  /** Commands to suggest in this persona's context */
  suggestedCommands: string[];
  /** Auto-invoke workflow template (null = none) */
  defaultWorkflow: string | null;
  /** Tools explicitly denied — overrides tools[] if conflict */
  disallowedTools?: string[];
  /** Documented failure modes — shown in hover tooltip */
  failurePatterns?: string[];
  /** True = no write tools ever. Enforced in assembleToolPool when built */
  isReadOnly?: boolean;
  /** One sentence shown in picker hover */
  tagline?: string;
  /** 3 example tasks in user-facing language */
  bestFor?: string[];
  /** Hard boundary statement — what this persona won't do */
  wontDo?: string;
  /** Skill names installable from marketplace */
  suggestedSkills?: string[];
  /** Connector IDs */
  suggestedConnectors?: string[];
  /** MCP server names from mcp-registry */
  suggestedMcpServers?: string[];
}

/** Get a persona by ID (built-in only — use listPersonas() for full catalog) */
export function getPersona(id: string): AgentPersona | null {
  return PERSONAS.find(p => p.id === id) ?? null;
}

let _customDataDir: string | null = null;

/** Set the data directory for custom personas (called once at startup) */
export function setPersonaDataDir(dataDir: string): void {
  _customDataDir = dataDir;
}

/** List all available personas — built-in + custom from disk */
export function listPersonas(): AgentPersona[] {
  const custom = _customDataDir ? loadCustomPersonas(_customDataDir) : [];
  return [...PERSONAS, ...custom];
}

const MAX_COMBINED_CHARS = 32000; // ~8000 tokens
const SEPARATOR = '\n\n---\n\n';

/** Hint appended to every composed prompt — encourages DOCX generation for structured content */
const DOCX_HINT = '\n\nWhen generating long, structured content (reports, proposals, analyses), proactively offer to save it as a DOCX document using the generate_docx tool.';

/** W7.3: Tone instruction map — maps workspace tone presets to system prompt instructions */
const TONE_INSTRUCTIONS: Record<string, string> = {
  professional: 'Maintain a professional, polished tone. Use formal language appropriate for business communication.',
  casual: 'Use a conversational, approachable tone. Be friendly but not unprofessional.',
  technical: 'Use precise technical language. Include relevant jargon and detailed explanations.',
  legal: 'Use careful, precise legal language. Include appropriate disclaimers and caveats.',
  marketing: 'Use engaging, persuasive language. Focus on benefits and compelling narratives.',
};

/**
 * Compose a system prompt by appending persona instructions after the core prompt.
 * Truncates persona prompt if combined length exceeds maxChars.
 * Returns core prompt unchanged if persona is null.
 * W7.3: If workspaceTone is provided, appends a tone instruction section.
 */
export function composePersonaPrompt(
  corePrompt: string,
  persona: AgentPersona | null,
  maxChars: number = MAX_COMBINED_CHARS,
  workspaceTone?: string,
): string {
  // Always append DOCX generation hint to the core prompt
  let basePrompt = corePrompt + DOCX_HINT;

  // W7.3: Append workspace tone instruction if set
  if (workspaceTone && TONE_INSTRUCTIONS[workspaceTone]) {
    basePrompt += `\n\n## Communication Tone\n${TONE_INSTRUCTIONS[workspaceTone]}`;
  }

  if (!persona) return basePrompt;

  const combined = `${basePrompt}${SEPARATOR}${persona.systemPrompt}`;
  if (combined.length <= maxChars) return combined;

  // Truncate persona prompt to fit
  const TRUNCATION_MARKER = '\n[...truncated]';
  const available = maxChars - basePrompt.length - SEPARATOR.length - TRUNCATION_MARKER.length;
  if (available <= 0) return basePrompt; // Core prompt alone exceeds limit

  const truncated = persona.systemPrompt.slice(0, available) + TRUNCATION_MARKER;
  return `${basePrompt}${SEPARATOR}${truncated}`;
}
