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

  if (typeof input === 'object' && input !== null) {
    const keys = Object.keys(input);
    if (keys.includes('perplexity') || (input as any).source === 'perplexity') return 'perplexity';
    if (keys.includes('grok') || (input as any).source === 'grok') return 'grok';
    if ((input as any).provider === 'qwen') return 'qwen';
  }

  return 'unknown';
}

/** Try to find conversations in any JSON structure. */
function findConversations(obj: any): any[] | null {
  if (Array.isArray(obj)) {
    if (obj.length > 0 && (obj[0].messages || obj[0].chat_messages || obj[0].turns || obj[0].history)) {
      return obj;
    }
    if (obj.length > 0 && (obj[0].role || obj[0].sender || obj[0].author)) {
      return [{ title: 'Imported Conversation', messages: obj }];
    }
  }

  if (typeof obj === 'object' && obj !== null) {
    for (const key of ['conversations', 'chats', 'threads', 'sessions', 'history', 'data']) {
      if (Array.isArray(obj[key])) {
        return findConversations(obj[key]);
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

  private parseJson(input: any): UniversalImportItem[] {
    const source = detectSource(input);
    const items: UniversalImportItem[] = [];
    const conversations = findConversations(input);

    if (conversations) {
      for (const conv of conversations) {
        const title = conv.title ?? conv.name ?? conv.subject ?? 'Imported Conversation';
        const rawMessages = conv.messages ?? conv.chat_messages ?? conv.turns ?? conv.history ?? [];
        const messages: ConversationMessage[] = [];

        for (const msg of rawMessages) {
          const role = this.resolveRole(msg);
          if (!role) continue;
          const text = this.extractText(msg);
          if (!text) continue;
          messages.push({ role, text, timestamp: msg.timestamp ?? msg.created_at ?? msg.createTime });
        }

        if (messages.length === 0) continue;

        items.push({
          id: randomUUID(),
          source,
          type: 'conversation',
          title,
          content: messages.map(m => `${m.role}: ${m.text}`).join('\n\n'),
          messages,
          timestamp: conv.created_at ?? conv.createTime ?? conv.timestamp ?? new Date().toISOString(),
          metadata: { parseMethod: 'universal-json', detectedSource: source, conversationId: conv.id },
        });
      }
    }

    if (items.length === 0) {
      items.push({
        id: randomUUID(),
        source,
        type: 'memory',
        title: (input as any).title ?? 'Imported Data',
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

  private resolveRole(msg: any): 'user' | 'assistant' | null {
    const role = msg.role ?? msg.sender ?? msg.author ?? msg.type;
    if (!role) return null;
    const r = String(role).toLowerCase();
    if (['user', 'human', 'me'].includes(r)) return 'user';
    if (['assistant', 'ai', 'bot', 'model', 'system'].includes(r)) return 'assistant';
    return null;
  }

  private extractText(msg: any): string {
    if (typeof msg.text === 'string') return msg.text.trim();
    if (typeof msg.content === 'string') return msg.content.trim();
    if (Array.isArray(msg.content)) {
      return msg.content
        .filter((b: any) => typeof b === 'string' || b.type === 'text')
        .map((b: any) => typeof b === 'string' ? b : b.text)
        .join('\n')
        .trim();
    }
    if (Array.isArray(msg.parts)) {
      return msg.parts.filter((p: any) => p.text).map((p: any) => p.text).join('\n').trim();
    }
    return '';
  }
}
