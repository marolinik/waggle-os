/**
 * Bounded read tools for the chat turn: the direct `read_file` directive, the
 * exact skill read and the bounded exact workspace-memory lookup, with the
 * tool-failure classifier they share (TD-CHAT-3 slice 14). Moved verbatim from
 * `chat.ts` module scope so the turn-preparation module can bind these tools
 * without importing the route.
 */
import fs from 'node:fs';
import path from 'node:path';
import { executeToolWithStatus, scanForInjection, type ToolDefinition, type ToolExecutionOutcome } from '@waggle/agent';
import { parseBoundedExactMemoryRequest, type BoundedExactMemoryRequest } from './chat-turn-policy.js';

export function isReportedToolFailure(result: string): boolean {
  const trimmed = result.trim();
  if (/^(?:error|failed|denied|blocked)(?::|\s|$)/i.test(trimmed)) return true;
  // The same concept in the marker form the tool executor actually emits. A
  // blocked tool did not run, so every consumer that reads `!isError` as "the
  // effect happened" — the `file_created` disclosure, the artifact index — was
  // being told a denied write had succeeded.
  if (trimmed.startsWith('[BLOCKED]')) return true;
  // The executor's answer to a tool the turn never transmitted. It carries
  // `succeeded: false`, but `onToolResult` only receives the text, and without
  // this a file tool the model called anyway was announced as a created file
  // (TD-CHAT-50).
  if (/^Tool "[^"]+" not found./.test(trimmed)) return true;
  try {
    const parsed = JSON.parse(trimmed) as { error?: unknown; ok?: unknown; success?: unknown };
    return parsed.ok === false
      || parsed.success === false
      || (typeof parsed.error === 'string' && parsed.error.trim().length > 0);
  } catch {
    return false;
  }
}


export type DirectReadFileDirective =
  | { kind: 'unrelated' }
  | { kind: 'invalid' }
  | {
      kind: 'valid';
      expectedPath: string;
      startMarker?: string;
      endMarker?: string;
    };

const DIRECT_READ_FILE_PATH_TOKEN = '(?<path>"[^"\\r\\n]+"|\'[^\'\\r\\n]+\'|[^,\\s]+?)';
const DIRECT_READ_FILE_RESPONSE_CLAUSE =
  '(?:,\\s*then\\s+(?:report|return|show)(?:\\s+me)?\\s+(?:the\\s+)?(?:exact\\s+)?(?:file\\s+)?contents?(?:\\s+between\\s+(?<startMarker>[A-Za-z0-9_-]+)\\s+and\\s+(?<endMarker>[A-Za-z0-9_-]+))?)?';
const EXPLICIT_DIRECT_READ_FILE_RE = new RegExp(
  `^\\s*(?:please\\s+)?(?:use|call|invoke)\\s+(?:the\\s+)?(?:read_file(?:\\s+tool)?|tool\\s+read_file)\\s+to\\s+(?:read|open|inspect)\\s+${DIRECT_READ_FILE_PATH_TOKEN}${DIRECT_READ_FILE_RESPONSE_CLAUSE}[.!]?\\s*$`,
  'i',
);
const NATURAL_DIRECT_READ_FILE_RE = new RegExp(
  `^\\s*(?:please\\s+)?(?:read|open|inspect)\\s+${DIRECT_READ_FILE_PATH_TOKEN}\\s+in\\s+(?:this|the)\\s+workspace${DIRECT_READ_FILE_RESPONSE_CLAUSE}[.!]?\\s*$`,
  'i',
);
const EXTENSIONLESS_DIRECT_READ_FILE_NAME = '(?:Makefile|Dockerfile|LICENSE|NOTICE|README|CHANGELOG|AUTHORS|CONTRIBUTORS|Gemfile|Rakefile|Procfile)';
const WINDOWS_RESERVED_DIRECT_READ_FILE_TOKEN = '(?:(?:con|prn|aux|nul|(?:com|lpt)(?:[1-9]|[¹²³]))(?:[. ]+)?|conin\\$|conout\\$)';
const NATURAL_DIRECT_READ_FILE_INTENT_PATH_TOKEN = `(?:"[^"\\r\\n]+"|'[^'\\r\\n]+'|[^,\\s]*(?:[\\\\/]|\\.[A-Za-z0-9_-]+)[^,\\s]*|${EXTENSIONLESS_DIRECT_READ_FILE_NAME}(?=\\s)|${WINDOWS_RESERVED_DIRECT_READ_FILE_TOKEN}(?=\\s))`;
const NATURAL_DIRECT_READ_FILE_INTENT_RE = new RegExp(
  `^\\s*(?:please\\s+)?(?:read|open|inspect)\\s+${NATURAL_DIRECT_READ_FILE_INTENT_PATH_TOKEN}[\\s\\S]*\\bin\\s+(?:this|the)\\s+workspace\\b`,
  'i',
);
export const WARNING_TIER_DIRECT_READ_FILE_INTENT_RE = /\b(?:read|open|inspect)\b[\s\S]*\bin\s+(?:this|the)\s+workspace\b/i;
const DIRECT_READ_FILE_MAX_EXACT_BYTES = 2_048;
const WINDOWS_RESERVED_DEVICE_SEGMENT = /^(?:(?:con|prn|aux|nul|(?:com|lpt)(?:[1-9]|[¹²³]))(?:\..*)?|conin\$|conout\$)$/i;

function normalizeDirectReadFilePath(candidate: string): string | undefined {
  const unquoted = ((candidate.startsWith('"') && candidate.endsWith('"'))
    || (candidate.startsWith("'") && candidate.endsWith("'")))
    ? candidate.slice(1, -1)
    : candidate;
  if (!unquoted
    || unquoted.length > 240
    || Array.from(unquoted).some(character => character.charCodeAt(0) < 32)) {
    return undefined;
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(unquoted)
    || /^[\\/]/.test(unquoted)
    || /[:*?<>|%$~{}]/.test(unquoted)
    || unquoted.includes('[')
    || unquoted.includes(']')) {
    return undefined;
  }

  const segments = unquoted.replace(/\\/g, '/').split('/');
  if (segments.some(segment => !segment
    || segment === '..'
    || /[. ]$/.test(segment)
    || WINDOWS_RESERVED_DEVICE_SEGMENT.test(segment))) {
    return undefined;
  }
  const normalized = segments.filter(segment => segment !== '.').join('/');
  return normalized || undefined;
}

/**
 * Recognize only a complete, single-file workspace read. `invalid` is
 * intentionally distinct from `unrelated`: a malformed direct-read request
 * must fail closed instead of falling through to broad tool selection.
 */
export function parseDirectReadFileDirective(message: string): DirectReadFileDirective {
  const directReadIntent = /\bread_file\b/i.test(message)
    || NATURAL_DIRECT_READ_FILE_INTENT_RE.test(message);
  if (!directReadIntent) return { kind: 'unrelated' };
  if (!message.trim() || message.length > 240 || /[\r\n]/.test(message)) return { kind: 'invalid' };

  const match = EXPLICIT_DIRECT_READ_FILE_RE.exec(message)
    ?? NATURAL_DIRECT_READ_FILE_RE.exec(message);
  const rawPath = match?.groups?.path;
  if (!rawPath) return { kind: 'invalid' };
  const expectedPath = normalizeDirectReadFilePath(rawPath);
  return expectedPath
    ? {
        kind: 'valid',
        expectedPath,
        ...(match?.groups?.startMarker && match.groups.endMarker
          ? {
              startMarker: match.groups.startMarker,
              endMarker: match.groups.endMarker,
            }
          : {}),
      }
    : { kind: 'invalid' };
}

export function formatDirectReadFileResponse(
  directive: Extract<DirectReadFileDirective, { kind: 'valid' }>,
  result: string,
): string {
  if (!directive.startMarker || !directive.endMarker) {
    if (!result) return '(The file is empty.)';
    return result.trim() ? result : '(The file contains only whitespace.)';
  }
  return `${directive.startMarker}\n${result}${result.endsWith('\n') ? '' : '\n'}${directive.endMarker}`;
}

function canonicalBoundReadPath(workspaceRoot: string, candidate: string): string | undefined {
  const normalized = normalizeDirectReadFilePath(candidate);
  if (!normalized) return undefined;
  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(root, ...normalized.split('/'));
  const relative = path.relative(root, resolved);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return undefined;
  }
  return resolved;
}

export async function boundDirectReadFilePathsMatch(
  workspaceRoot: string,
  expectedPath: string,
  suppliedPath: string,
  resolveRealPath: (candidate: string) => Promise<string> = candidate => fs.promises.realpath(candidate),
): Promise<boolean> {
  const expected = canonicalBoundReadPath(workspaceRoot, expectedPath);
  const supplied = canonicalBoundReadPath(workspaceRoot, suppliedPath);
  if (!expected || !supplied) return false;
  if (expected === supplied) return true;
  if (expected.toLowerCase() !== supplied.toLowerCase()) return false;
  try {
    const [expectedRealPath, suppliedRealPath] = await Promise.all([
      resolveRealPath(expected),
      resolveRealPath(supplied),
    ]);
    return expectedRealPath === suppliedRealPath;
  } catch {
    return false;
  }
}

export function bindDirectReadFileTool(
  tools: ToolDefinition[],
  workspaceRoot: string,
  expectedPath: string,
  reportOutcome: (outcome: ToolExecutionOutcome) => void,
): ToolDefinition[] {
  if (!canonicalBoundReadPath(workspaceRoot, expectedPath)) {
    return tools.filter(tool => tool.name !== 'read_file');
  }
  return tools.map((tool) => {
    if (tool.name !== 'read_file') return tool;
    return {
      ...tool,
      execute: async (args) => {
        const suppliedPath = typeof args.path === 'string' ? args.path : '';
        const unsupportedArgument = Object.keys(args).some(key => (
          key !== 'path' && key !== 'offset' && key !== 'line_numbers'
        ));
        const partialRead = (args.offset !== undefined
          && (typeof args.offset !== 'number' || args.offset !== 1))
          || (args.line_numbers !== undefined && args.line_numbers !== false);
        const pathMatches = await boundDirectReadFilePathsMatch(
          workspaceRoot,
          expectedPath,
          suppliedPath,
        );
        if (!pathMatches || partialRead || unsupportedArgument) {
          const outcome = {
            content: `Error: read_file must read the complete explicitly requested workspace file: ${expectedPath}`,
            isError: true,
          };
          reportOutcome(outcome);
          return outcome.content;
        }
        const outcome = await executeToolWithStatus(tool, args);
        if (Buffer.byteLength(outcome.content, 'utf8') > DIRECT_READ_FILE_MAX_EXACT_BYTES) {
          const oversizedOutcome = {
            content: `Error: exact read_file response exceeds the ${DIRECT_READ_FILE_MAX_EXACT_BYTES}-byte direct-read limit; use a scoped or partial read request instead.`,
            isError: true,
          };
          reportOutcome(oversizedOutcome);
          return oversizedOutcome.content;
        }
        reportOutcome(outcome);
        return outcome.content;
      },
    };
  });
}

export function bindExactReadSkillTool(
  tools: ToolDefinition[],
  expectedSkillName: string,
): ToolDefinition[] {
  return tools.map((tool) => {
    if (tool.name !== 'read_skill') return tool;
    return {
      ...tool,
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            enum: [expectedSkillName],
            description: `Exact installed skill name: ${expectedSkillName}`,
          },
        },
        required: ['name'],
        additionalProperties: false,
      },
      execute: async (args) => {
        if (Object.keys(args).length !== 1 || args.name !== expectedSkillName) {
          return `Error: read_skill must use the exact requested skill name: ${expectedSkillName}`;
        }
        return tool.execute(args);
      },
    };
  });
}

const BOUNDED_EXACT_MEMORY_SEARCH_LIMIT = 3;
const BOUNDED_EXACT_MEMORY_SENSITIVE_PATTERN = /\b(?:password|passcode|one[- ]time\s+(?:password|code)|otp|access[_ -]?token|api[_ -]?key|credential|private\s+key|client[_ -]?secret)\b/i;

export type BoundedExactMemoryExecutionOutcome =
  | { status: 'found' }
  | { status: 'no-match' }
  | { status: 'failure' };


function extractWorkspaceMemorySection(result: string): string | null {
  const marker = /^## Workspace Memory\s*$/m.exec(result);
  if (!marker || marker.index === undefined) return null;
  const start = marker.index + marker[0].length;
  const remainder = result.slice(start);
  const nextSection = /\n## [^\r\n]+/m.exec(remainder);
  return remainder.slice(0, nextSection?.index ?? remainder.length).trim();
}

function extractBoundedExactWorkspaceMemoryValue(
  result: string,
  request: BoundedExactMemoryRequest,
): string | null {
  const workspaceSection = extractWorkspaceMemorySection(result);
  if (!workspaceSection) return null;
  const contents = workspaceSection
    .split(/\n(?=\[\d+\]\s+\()/)
    .map(entry => entry.replace(/^\[\d+\]\s+\([^\r\n]*\)\s*/i, '').trim())
    .filter(Boolean);
  const candidates: Array<{ value: string; relevance: number }> = [];
  const field = request.fieldPattern;
  const scalar = request.strictCodenameToken
    ? String.raw`[A-Za-z0-9][A-Za-z0-9._-]{0,79}`
    : String.raw`[A-Za-z0-9][A-Za-z0-9._ -]{0,79}?`;
  const scalarBoundary = String.raw`(?:["'”])?(?=\s*(?:$|[—–](?=\s|$)|[.,;](?=\s|$)))`;
  const strictScalarTerminator = String.raw`(?:["'”])?\s*(?:\.?\s*$|[—–]\s*\d+\s+messages?\s*$)`;
  const beforeField = new RegExp(
    String.raw`\b(?:choose|chose|selected|pick|picked|use|using|go\s+with|went\s+with)\s+(?:the\s+)?(${scalar})\s+(?:as|for)\s+(?:the\s+|our\s+)?[^.\r\n]{0,100}\b${field}\b`,
    'i',
  );
  const decidedField = new RegExp(
    String.raw`^User asked:\s*(?:We|I)\s+decided\s+that\s+["'“”]?(?!(?:if|maybe|perhaps|possibly|could|might|would|should)\b)(${scalar})["'“”]?\s+(?:is|was)\s+(?:the|our)\s+[^.\r\n]{0,100}\b${field}\b`,
    'i',
  );
  const nonAuthoritativeDecision = /\b(?:not|never|rejected|discarded)\b/i;
  const afterField = new RegExp(
    String.raw`\b${field}\b[^.\r\n]{0,40}?\b(?:is|was|equals?|set\s+to)\b\s*["'“]?(${scalar})${scalarBoundary}`,
    'i',
  );
  const labelledField = new RegExp(
    String.raw`\b${field}\b(?:\s+(?:decision|choice|selected|chosen))?\s*[:=]\s*["'“]?(${scalar})${scalarBoundary}`,
    'i',
  );
  const rememberedExactField = field === 'codename'
    ? new RegExp(
      String.raw`\b(?:remember(?:ed)?(?:\s+this)?\s+exact\s+)?(?:project\s+)?codename(?:\s*\([^\r\n)]{1,60}\))?\s*[:=]\s*["'“]?(${scalar})${scalarBoundary}`,
      'i',
    )
    : null;
  const strictRememberedExactField = request.strictCodenameToken
    ? new RegExp(
      String.raw`^(?:Session\s*\(\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?\)\s*:\s*)?Remember(?:ed)?\s+this\s+exact\s+(?:project\s+)?codename\s*[:=]\s*["'“]?(${scalar})${strictScalarTerminator}`,
      'i',
    )
    : null;
  const strictUserStatedField = request.strictCodenameToken
    ? new RegExp(
      String.raw`^(?:Project\s+)?codename\s*\(\s*user-stated\s*,\s*exact\s*\)\s*[:=]\s*["'“]?(${scalar})${strictScalarTerminator}`,
      'i',
    )
    : null;
  const strictDeclarativeField = request.strictCodenameToken
    ? new RegExp(
      String.raw`^(?:The\s+)?(?:project\s+)?codename\s+(?:is|was|equals?|set\s+to)\s*["'“]?(${scalar})${strictScalarTerminator}`,
      'i',
    )
    : null;

  for (const content of contents) {
    for (const line of content.split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
      if (BOUNDED_EXACT_MEMORY_SENSITIVE_PATTERN.test(line)
        || nonAuthoritativeDecision.test(line)) continue;
      const normalized = line.toLowerCase();
      const relevance = request.topicTerms.filter(term => normalized.includes(term)).length;
      if (relevance === 0) continue;
      const match = request.strictCodenameToken
        ? strictRememberedExactField?.exec(line)
          ?? strictUserStatedField?.exec(line)
          ?? strictDeclarativeField?.exec(line)
        : beforeField.exec(line)
          ?? decidedField.exec(line)
          ?? rememberedExactField?.exec(line)
          ?? labelledField.exec(line)
          ?? afterField.exec(line);
      const value = match?.[1]
        ?.trim()
        .replace(/^["'“”]+|["'“”,;:.]+$/g, '');
      if (!value || value.length > 80 || BOUNDED_EXACT_MEMORY_SENSITIVE_PATTERN.test(value)) continue;
      try {
        if (!scanForInjection(value, 'tool_output').safe) continue;
      } catch {
        continue;
      }
      candidates.push({ value, relevance });
    }
  }
  candidates.sort((left, right) => right.relevance - left.relevance);
  const topRelevance = candidates[0]?.relevance;
  if (topRelevance === undefined) return null;
  const topValues = new Set(
    candidates.filter(candidate => candidate.relevance === topRelevance).map(candidate => candidate.value),
  );
  return topValues.size === 1 ? candidates[0]!.value : null;
}

export function bindExactWorkspaceMemorySearchTool(
  tools: ToolDefinition[],
  message: string,
  onOutcome?: (outcome: BoundedExactMemoryExecutionOutcome) => void,
): ToolDefinition[] {
  const request = parseBoundedExactMemoryRequest(message);
  return tools.map((tool) => {
    if (tool.name !== 'search_memory') return tool;
    return {
      ...tool,
      description: 'Return the one exact non-credential value requested from the current workspace memory.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
      execute: async (_args) => {
        if (!request) {
          onOutcome?.({ status: 'failure' });
          return 'Error: exact workspace memory lookup could not bind the current request.';
        }
        let rawResult: string;
        try {
          rawResult = await tool.execute({
            query: request.query,
            scope: 'workspace',
            limit: BOUNDED_EXACT_MEMORY_SEARCH_LIMIT,
            profile: 'balanced',
          });
        } catch (error) {
          onOutcome?.({ status: 'failure' });
          throw error;
        }
        if (isReportedToolFailure(rawResult)) {
          onOutcome?.({ status: 'failure' });
          return rawResult;
        }
        const value = extractBoundedExactWorkspaceMemoryValue(rawResult, request);
        if (value !== null) {
          onOutcome?.({ status: 'found' });
          return value;
        }
        if (request.fallback) {
          onOutcome?.({ status: 'no-match' });
          return request.fallback;
        }
        onOutcome?.({ status: 'failure' });
        return 'Error: the requested exact workspace memory value could not be isolated safely.';
      },
    };
  });
}
