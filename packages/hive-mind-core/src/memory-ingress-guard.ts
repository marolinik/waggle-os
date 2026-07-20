import { scanForInjection, type ScanResult } from './injection-scanner.js';

export interface ExternalMemoryIngressInput {
  title?: string;
  content: string;
}

export interface ExternalMemoryProjectionInput {
  content: string;
  messages?: unknown;
  parseMethod?: unknown;
  maxChars?: number;
}

export type ExternalMemoryIngressDecision =
  | { action: 'allow'; scan: ScanResult }
  | { action: 'block'; reason: 'prompt_injection'; scan: ScanResult };

const NAMED_HTML_ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  amp: '&',
  apos: "'",
  colon: ':',
  emsp: ' ',
  ensp: ' ',
  gt: '>',
  hairsp: ' ',
  lt: '<',
  newline: '\n',
  nbsp: ' ',
  quot: '"',
  tab: '\t',
  thinsp: ' ',
  zwj: '',
  zwnj: '',
  zwsp: '',
});

type CanonicalMemoryMessage = {
  role: 'user' | 'assistant' | 'system';
  text: string;
};

/**
 * Return only the attacker-controlled text represented by a stored adapter
 * projection. Role prefixes may be omitted only when plain canonical messages
 * exactly reproduce the full content and did not come from universal raw text.
 */
export function projectExternalMemoryContent(input: ExternalMemoryProjectionInput): string {
  let cappedContent = '';
  try {
    const content = typeof input.content === 'string' ? input.content : '';
    const maxChars = input.maxChars;
    cappedContent = maxChars === undefined
      || !Number.isSafeInteger(maxChars)
      || maxChars < 0
      ? content
      : content.slice(0, maxChars);
    if (input.parseMethod === 'universal-text'
      || !Array.isArray(input.messages)
      || input.messages.length === 0) {
      return cappedContent;
    }

    const messages: CanonicalMemoryMessage[] = [];
    for (const candidate of input.messages) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        return cappedContent;
      }
      const prototype = Object.getPrototypeOf(candidate);
      if (prototype !== Object.prototype && prototype !== null) return cappedContent;
      const roleDescriptor = Object.getOwnPropertyDescriptor(candidate, 'role');
      const textDescriptor = Object.getOwnPropertyDescriptor(candidate, 'text');
      if (!roleDescriptor || !('value' in roleDescriptor)
        || !textDescriptor || !('value' in textDescriptor)) {
        return cappedContent;
      }
      const role = roleDescriptor.value as unknown;
      const text = textDescriptor.value as unknown;
      if ((role !== 'user' && role !== 'assistant' && role !== 'system')
        || typeof text !== 'string') {
        return cappedContent;
      }
      messages.push({ role, text });
    }

    const serialized = messages
      .map(message => `${message.role}: ${message.text}`)
      .join('\n\n');
    if (serialized !== content) return cappedContent;

    const parts: string[] = [];
    let cursor = 0;
    let offset = 0;
    for (const [index, message] of messages.entries()) {
      if (index > 0) offset += 2;
      const prefixStart = offset;
      const prefixEnd = prefixStart + `${message.role}: `.length;
      if (prefixStart >= cappedContent.length) break;
      if (message.role === 'system') return cappedContent;
      parts.push(cappedContent.slice(cursor, prefixStart));
      cursor = Math.min(prefixEnd, cappedContent.length);
      offset = prefixEnd + message.text.length;
    }
    parts.push(cappedContent.slice(cursor));
    return parts.join('');
  } catch {
    return cappedContent;
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&(?:amp;){2,}/gi, '&')
    .replace(/&#(?:x([0-9a-f]{1,6})|([0-9]{1,7}));?/gi, (match, hex: string, decimal: string) => {
      const codePoint = Number.parseInt(hex ?? decimal, hex ? 16 : 10);
      if (!Number.isInteger(codePoint)
        || codePoint <= 0
        || codePoint > 0x10ffff
        || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
        return match;
      }
      return String.fromCodePoint(codePoint);
    })
    .replace(/&([a-z][a-z0-9]+);/gi, (match, name: string) =>
      NAMED_HTML_ENTITIES[name.toLowerCase()] ?? match)
    .replace(
      /&(amp|apos|colon|emsp|ensp|gt|hairsp|lt|newline|nbsp|quot|tab|thinsp|zwj|zwnj|zwsp)(?=[^a-z0-9;]|$)/gi,
      (_match, name: string) => NAMED_HTML_ENTITIES[name.toLowerCase()],
    );
}

function decodePercentEncoding(value: string): string {
  const withSpaces = value.replace(/\+/g, ' ');
  return withSpaces.replace(/(?:%[0-9a-f]{2})+/gi, (run) => {
    try {
      return decodeURIComponent(run);
    } catch {
      const bytes = Uint8Array.from(
        run.match(/[0-9a-f]{2}/gi) ?? [],
        hex => Number.parseInt(hex, 16),
      );
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    }
  });
}

type HtmlTagBoundary =
  | { kind: 'close'; index: number }
  | { kind: 'nested'; index: number }
  | { kind: 'eof'; index: number };

function findHtmlTagBoundary(value: string, start: number): HtmlTagBoundary {
  let quote: '"' | "'" | undefined;
  for (let index = start; index < value.length; index++) {
    const char = value[index];
    if (char === '<') return { kind: 'nested', index };
    if (quote) {
      if (char === quote) quote = undefined;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      return { kind: 'close', index };
    }
  }
  return { kind: 'eof', index: value.length };
}

function normalizeHtmlToken(value: string): string {
  return value.replace(/[:_-]+/g, ' ');
}

function extractHtmlAttributeTokens(value: string, start: number, end: number): string {
  const tokens: string[] = [];
  let index = start;
  while (index < end) {
    while (index < end && /[\s/]/.test(value[index])) index++;
    const nameStart = index;
    while (index < end && !/[\s=/>]/.test(value[index])) index++;
    if (index === nameStart) {
      index++;
      continue;
    }
    const name = normalizeHtmlToken(value.slice(nameStart, index));
    while (index < end && /\s/.test(value[index])) index++;
    if (value[index] !== '=') {
      if (name) tokens.push(name);
      continue;
    }
    index++;
    while (index < end && /\s/.test(value[index])) index++;

    const quote = value[index] === '"' || value[index] === "'"
      ? value[index]
      : undefined;
    if (quote) index++;
    const valueStart = index;
    if (quote) {
      while (index < end && value[index] !== quote) index++;
    } else {
      while (index < end && !/[\s>]/.test(value[index])) index++;
    }
    if (index > valueStart) tokens.push(normalizeHtmlToken(value.slice(valueStart, index)));
    if (quote && index < end) index++;
  }
  return tokens.join(' ');
}

function stripHtmlMarkup(value: string): {
  rendered: string;
  tagNames: string;
  attributes: string;
  lexical: string;
} {
  const rendered: string[] = [];
  const tagNames: string[] = [];
  const attributes: string[] = [];
  const lexical: string[] = [];
  for (let index = 0; index < value.length;) {
    if (value.startsWith('<!--', index)) {
      const commentEnd = value.indexOf('-->', index + 4);
      if (commentEnd === -1) {
        const visibleTail = value.slice(index + 4);
        rendered.push(visibleTail);
        tagNames.push(visibleTail);
        attributes.push(visibleTail);
        lexical.push(visibleTail);
        break;
      }
      const commentText = value.slice(index + 4, commentEnd);
      if (commentText) {
        tagNames.push(' ', commentText, ' ');
        attributes.push(' ', commentText, ' ');
        lexical.push(' ', commentText, ' ');
      }
      index = commentEnd + 3;
      continue;
    }
    if (value.startsWith('-->', index)) {
      index += 3;
      continue;
    }
    if (value[index] === '<' && /[!/A-Za-z?]/.test(value[index + 1] ?? '')) {
      let tagNameEnd = index + 1;
      if (value[tagNameEnd] === '/') tagNameEnd++;
      const tagNameStart = tagNameEnd;
      while (/[A-Za-z0-9:!_-]/.test(value[tagNameEnd] ?? '')) tagNameEnd++;
      const tagName = normalizeHtmlToken(value.slice(tagNameStart, tagNameEnd));
      const boundary = findHtmlTagBoundary(value, tagNameEnd);
      if (boundary.kind === 'close') {
        const attributeTokens = extractHtmlAttributeTokens(
          value,
          tagNameEnd,
          boundary.index,
        );
        if (tagName) tagNames.push(' ', tagName, ' ');
        if (attributeTokens) attributes.push(' ', attributeTokens, ' ');
        if (tagName || attributeTokens) {
          lexical.push(' ', tagName, ' ', attributeTokens, ' ');
        }
        index = boundary.index + 1;
        continue;
      }
      const visibleTail = value.slice(tagNameEnd, boundary.index);
      rendered.push(visibleTail);
      if (tagName) tagNames.push(' ', tagName, ' ');
      tagNames.push(visibleTail);
      attributes.push(visibleTail);
      if (tagName) lexical.push(' ', tagName, ' ');
      lexical.push(visibleTail);
      if (boundary.kind === 'eof') break;
      index = boundary.index;
      continue;
    }
    rendered.push(value[index]);
    tagNames.push(value[index]);
    attributes.push(value[index]);
    lexical.push(value[index]);
    index++;
  }
  return {
    rendered: rendered.join(''),
    tagNames: tagNames.join(''),
    attributes: attributes.join(''),
    lexical: lexical.join(''),
  };
}

function normalizedIngressProjections(value: string): {
  projections: string[];
  complete: boolean;
} {
  const maxPasses = 64;
  const maxWork = 1_000_000;
  let decodedProjection = value.normalize('NFKC');
  let complete = false;
  let work = 0;
  for (let pass = 0; pass < maxPasses; pass++) {
    work += decodedProjection.length;
    if (work > maxWork) break;
    const decoded = decodeHtmlEntities(decodePercentEncoding(decodedProjection)).normalize('NFKC');
    if (decoded === decodedProjection) {
      complete = true;
      break;
    }
    decodedProjection = decoded;
  }
  if (!complete) return { projections: [decodedProjection], complete: false };

  const htmlProjections = stripHtmlMarkup(decodedProjection);
  const projections = new Set([decodedProjection]);
  for (const projection of [
    htmlProjections.rendered,
    htmlProjections.tagNames,
    htmlProjections.attributes,
    htmlProjections.lexical,
  ]) {
    projections.add(projection
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
      .replace(/\p{Cf}/gu, '')
      .replace(/[*_~`]/g, ''));
  }
  return { projections: [...projections], complete: true };
}

/** Evaluate untrusted content before it can enter persistent memory. */
export function evaluateExternalMemoryIngress(
  input: ExternalMemoryIngressInput,
): ExternalMemoryIngressDecision {
  const projection = `${input.title ?? ''}\n${input.content}`;
  let scan = scanForInjection(projection, 'tool_output');
  if (scan.safe) {
    const normalizedIngress = normalizedIngressProjections(projection);
    for (const normalized of normalizedIngress.projections) {
      if (normalized === projection) continue;
      const normalizedScan = scanForInjection(normalized, 'tool_output');
      if (!normalizedScan.safe) {
        scan = normalizedScan;
        break;
      }
    }
    if (scan.safe && !normalizedIngress.complete) {
      scan = { safe: false, score: 0.6, flags: ['normalization_limit'] };
    }
  }

  return scan.safe
    ? { action: 'allow', scan }
    : { action: 'block', reason: 'prompt_injection', scan };
}
