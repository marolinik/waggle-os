/**
 * Universal Adapter — accepts any text, JSON, or Markdown input.
 *
 * For Tier 2 platforms (Perplexity, Grok, Manus, Genspark, Qwen, Minimax,
 * z.ai, OpenClaw, Cowork, ElevenLabs, Google Flow) where formats vary.
 *
 * Strategy:
 * 1. Detect if input is a known JSON format
 * 2. If JSON with recognizable structure, parse as conversations
 * 3. Otherwise, treat as raw text and create a single import item
 */

import { randomUUID } from 'node:crypto';
import type { SourceAdapter, UniversalImportItem, ImportSourceType, ConversationMessage } from './types.js';
import { asRecord, firstString, getArray, getString, type RawRecord } from './raw-types.js';

/** Heuristic source detection from content cues. */
function detectSource(input: unknown): ImportSourceType {
  if (typeof input === 'string') {
    const lower = input.toLowerCase();
    if (lower.includes('perplexity')) return 'perplexity';
    if (lower.includes('grok') || lower.includes('x.ai')) return 'grok';
    if (lower.includes('manus')) return 'manus';
    if (lower.includes('genspark')) return 'genspark';
    if (lower.includes('qwen') || lower.includes('tongyi')) return 'qwen';
    if (lower.includes('minimax')) return 'minimax';
    if (lower.includes('elevenlabs')) return 'elevenlabs';
    return 'unknown';
  }

  const obj = asRecord(input);
  if (obj) {
    const keys = Object.keys(obj);
    const source = getString(obj, 'source');
    if (keys.includes('perplexity') || source === 'perplexity') return 'perplexity';
    if (keys.includes('grok') || source === 'grok') return 'grok';
    if (getString(obj, 'provider') === 'qwen') return 'qwen';
  }

  return 'unknown';
}

/** Try to find conversations in any JSON structure. */
function findConversations(obj: unknown): RawRecord[] | null {
  if (Array.isArray(obj)) {
    const first = asRecord(obj[0]);
    if (obj.length > 0 && first && (first.messages || first.chat_messages || first.turns || first.history)) {
      return obj.map(asRecord).filter((c): c is RawRecord => c !== null);
    }
    if (obj.length > 0 && first && (first.role || first.sender || first.author)) {
      return [{ title: 'Imported Conversation', messages: obj }];
    }
  }

  const record = asRecord(obj);
  if (record) {
    for (const key of ['conversations', 'chats', 'threads', 'sessions', 'history', 'data']) {
      const nested = getArray(record, key);
      if (nested) {
        return findConversations(nested);
      }
    }
  }

  return null;
}

export class UniversalAdapter implements SourceAdapter {
  readonly sourceType = 'unknown' as const;
  readonly displayName = 'Universal (Auto-detect)';

  parse(input: unknown): UniversalImportItem[] {
    if (typeof input === 'string') {
      return this.parseText(input);
    }
    if (typeof input === 'object' && input !== null) {
      return this.parseJson(input);
    }
    return [];
  }

  private parseText(text: string): UniversalImportItem[] {
    const source = detectSource(text);
    const items: UniversalImportItem[] = [];
    const conversations = this.splitConversations(text);

    for (const conv of conversations) {
      const messages = this.extractMessagesFromText(conv.content);

      items.push({
        id: randomUUID(),
        source,
        type: messages.length > 0 ? 'conversation' : 'memory',
        title: conv.title,
        content: conv.content,
        messages: messages.length > 0 ? messages : undefined,
        timestamp: new Date().toISOString(),
        metadata: { parseMethod: 'universal-text', detectedSource: source },
      });
    }

    return items;
  }

  private parseJson(input: object): UniversalImportItem[] {
    const source = detectSource(input);
    const items: UniversalImportItem[] = [];
    const conversations = findConversations(input);

    if (conversations) {
      for (const conv of conversations) {
        const title = firstString(conv, 'title', 'name', 'subject') ?? 'Imported Conversation';
        const rawMessages = getArray(conv, 'messages') ?? getArray(conv, 'chat_messages')
          ?? getArray(conv, 'turns') ?? getArray(conv, 'history') ?? [];
        const messages: ConversationMessage[] = [];

        for (const rawMsg of rawMessages) {
          const msg = asRecord(rawMsg);
          if (!msg) continue;
          const role = this.resolveRole(msg);
          if (!role) continue;
          const text = this.extractText(msg);
          if (!text) continue;
          messages.push({ role, text, timestamp: firstString(msg, 'timestamp', 'created_at', 'createTime') });
        }

        if (messages.length === 0) continue;

        items.push({
          id: randomUUID(),
          source,
          type: 'conversation',
          title,
          content: messages.map(m => `${m.role}: ${m.text}`).join('\n\n'),
          messages,
          timestamp: firstString(conv, 'created_at', 'createTime', 'timestamp') ?? new Date().toISOString(),
          metadata: { parseMethod: 'universal-json', detectedSource: source, conversationId: getString(conv, 'id') },
        });
      }
    }

    if (items.length === 0) {
      const record = asRecord(input);
      items.push({
        id: randomUUID(),
        source,
        type: 'memory',
        title: (record && getString(record, 'title')) ?? 'Imported Data',
        content: JSON.stringify(input, null, 2).slice(0, 50000),
        timestamp: new Date().toISOString(),
        metadata: { parseMethod: 'universal-json-raw', detectedSource: source },
      });
    }

    return items;
  }

  private splitConversations(text: string): { title: string; content: string }[] {
    const separators = [
      /^#{1,3}\s+/gm,
      /^={3,}$/gm,
      /^-{3,}$/gm,
      /^Conversation \d+/gim,
    ];

    for (const sep of separators) {
      const parts = text.split(sep).filter(p => p.trim().length > 20);
      if (parts.length > 1) {
        return parts.map((p, i) => ({
          title: `Conversation ${i + 1}`,
          content: p.trim(),
        }));
      }
    }

    return [{ title: 'Imported Text', content: text.trim() }];
  }

  private extractMessagesFromText(text: string): ConversationMessage[] {
    const messages: ConversationMessage[] = [];
    const pattern = /^(User|Human|Me|Assistant|AI|Bot|Claude|ChatGPT|Gemini|Grok):\s*([\s\S]*?)(?=^(?:User|Human|Me|Assistant|AI|Bot|Claude|ChatGPT|Gemini|Grok):|$)/gim;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const speaker = match[1].toLowerCase();
      const content = match[2].trim();
      if (!content) continue;

      const role = ['user', 'human', 'me'].includes(speaker) ? 'user' as const : 'assistant' as const;
      messages.push({ role, text: content });
    }

    return messages;
  }

  private resolveRole(msg: RawRecord): 'user' | 'assistant' | null {
    const role = firstString(msg, 'role', 'sender', 'author', 'type');
    if (!role) return null;
    const r = role.toLowerCase();
    if (['user', 'human', 'me'].includes(r)) return 'user';
    if (['assistant', 'ai', 'bot', 'model', 'system'].includes(r)) return 'assistant';
    return null;
  }

  private extractText(msg: RawRecord): string {
    const directText = getString(msg, 'text');
    if (directText !== undefined) return directText.trim();
    const directContent = getString(msg, 'content');
    if (directContent !== undefined) return directContent.trim();
    const contentBlocks = getArray(msg, 'content');
    if (contentBlocks) {
      return contentBlocks
        .map(b => {
          if (typeof b === 'string') return b;
          const rec = asRecord(b);
          return rec && rec.type === 'text' ? getString(rec, 'text') ?? '' : undefined;
        })
        .filter((t): t is string => typeof t === 'string')
        .join('\n')
        .trim();
    }
    const parts = getArray(msg, 'parts');
    if (parts) {
      return parts
        .map(asRecord)
        .map(p => (p ? getString(p, 'text') : undefined))
        .filter((t): t is string => typeof t === 'string')
        .join('\n')
        .trim();
    }
    return '';
  }
}
