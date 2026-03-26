/**
 * Memory Import — parse ChatGPT and Claude exports, extract knowledge.
 *
 * Flow: raw JSON → parse conversations → extract knowledge items → ImportResult
 */

export type ImportSource = 'chatgpt' | 'claude';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  text: string;
  timestamp?: string;
}

export interface ParsedConversation {
  title: string;
  messages: ConversationMessage[];
  createdAt?: string;
  source: ImportSource;
}

export interface ExtractedKnowledge {
  type: 'decision' | 'fact' | 'preference' | 'topic';
  content: string;
  source: ImportSource;
  conversationTitle: string;
  importance: 'important' | 'normal';
}

export interface ImportResult {
  source: ImportSource;
  conversationsFound: number;
  conversationsParsed: number;
  knowledgeExtracted: ExtractedKnowledge[];
  errors: string[];
}

// ── Parsers ───────────────────────────────────────

export function parseChatGPTExport(json: unknown): ParsedConversation[] {
  const conversations = Array.isArray(json) ? json : (json as any)?.conversations;
  if (!Array.isArray(conversations)) return [];

  return conversations.map((conv: any) => {
    const title = conv.title || 'Untitled';
    const messages: ConversationMessage[] = [];

    // ChatGPT uses a mapping object with node IDs
    if (conv.mapping && typeof conv.mapping === 'object') {
      const nodes = Object.values(conv.mapping) as any[];
      // Sort by create_time for chronological order
      const sorted = nodes
        .filter((n: any) => n?.message?.content?.parts?.length > 0)
        .sort((a: any, b: any) => (a.message?.create_time ?? 0) - (b.message?.create_time ?? 0));

      for (const node of sorted) {
        const msg = node.message;
        if (!msg || !msg.author?.role) continue;
        const role = msg.author.role === 'user' ? 'user' : 'assistant';
        if (msg.author.role === 'system') continue; // Skip system messages

        const text = (msg.content?.parts ?? [])
          .filter((p: any) => typeof p === 'string')
          .join('\n')
          .trim();
        if (!text) continue;

        messages.push({
          role,
          text,
          timestamp: msg.create_time ? new Date(msg.create_time * 1000).toISOString() : undefined,
        });
      }
    }

    return {
      title,
      messages,
      createdAt: conv.create_time ? new Date(conv.create_time * 1000).toISOString() : undefined,
      source: 'chatgpt' as ImportSource,
    };
  }).filter(c => c.messages.length > 0);
}

export function parseClaudeExport(json: unknown): ParsedConversation[] {
  const conversations = Array.isArray(json) ? json : (json as any)?.conversations;
  if (!Array.isArray(conversations)) return [];

  return conversations.map((conv: any) => {
    const title = conv.name || conv.title || 'Untitled';
    const messages: ConversationMessage[] = [];

    const chatMessages = conv.chat_messages ?? conv.messages ?? [];
    for (const msg of chatMessages) {
      const role = (msg.sender === 'human' || msg.role === 'user') ? 'user' : 'assistant';
      const text = (msg.text ?? msg.content ?? '').trim();
      if (!text) continue;

      messages.push({
        role,
        text,
        timestamp: msg.created_at ?? msg.timestamp,
      });
    }

    return {
      title,
      messages,
      createdAt: conv.created_at ?? conv.create_time,
      source: 'claude' as ImportSource,
    };
  }).filter(c => c.messages.length > 0);
}

// ── Knowledge Extraction ──────────────────────────

const DECISION_PATTERNS = [
  /\b(?:decided|chose|going with|we'll use|confirmed|agreed|settled on|picked|selected)\b/i,
  /\b(?:decision|choice):\s/i,
  /\blet's go with\b/i,
];

const PREFERENCE_PATTERNS = [
  /\b(?:I prefer|I like|I always|I never|I don't like|don't use|use .+ instead)\b/i,
  /\b(?:my preference|I'd rather|please always|please never|from now on)\b/i,
  /\b(?:my style is|I want you to|format it as)\b/i,
];

const FACT_PATTERNS = [
  /\b(?:my name is|I work at|I'm a|I am a|my company|my team|my role|our product|our stack)\b/i,
  /\b(?:we use|our tech|we're building|the project is|the codebase)\b/i,
];

export function extractKnowledge(conversations: ParsedConversation[]): ExtractedKnowledge[] {
  const knowledge: ExtractedKnowledge[] = [];
  const seen = new Set<string>(); // Deduplicate

  for (const conv of conversations) {
    // Extract conversation topic
    if (conv.title && conv.title !== 'Untitled' && conv.title.length > 5) {
      const topicKey = `topic:${conv.title.toLowerCase().trim()}`;
      if (!seen.has(topicKey)) {
        seen.add(topicKey);
        knowledge.push({
          type: 'topic',
          content: `Conversation topic: ${conv.title}`,
          source: conv.source,
          conversationTitle: conv.title,
          importance: 'normal',
        });
      }
    }

    // Scan user messages for decisions, preferences, facts
    for (const msg of conv.messages) {
      if (msg.role !== 'user') continue;
      if (msg.text.length < 10 || msg.text.length > 500) continue; // Skip too short/long

      const sentences = msg.text.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 10);

      for (const sentence of sentences) {
        const contentKey = sentence.toLowerCase().slice(0, 80);
        if (seen.has(contentKey)) continue;

        // Check for decisions
        if (DECISION_PATTERNS.some(p => p.test(sentence))) {
          seen.add(contentKey);
          knowledge.push({
            type: 'decision',
            content: `Decision: ${sentence}`,
            source: conv.source,
            conversationTitle: conv.title,
            importance: 'important',
          });
          continue;
        }

        // Check for preferences
        if (PREFERENCE_PATTERNS.some(p => p.test(sentence))) {
          seen.add(contentKey);
          knowledge.push({
            type: 'preference',
            content: `Preference: ${sentence}`,
            source: conv.source,
            conversationTitle: conv.title,
            importance: 'important',
          });
          continue;
        }

        // Check for facts
        if (FACT_PATTERNS.some(p => p.test(sentence))) {
          seen.add(contentKey);
          knowledge.push({
            type: 'fact',
            content: `${sentence}`,
            source: conv.source,
            conversationTitle: conv.title,
            importance: 'normal',
          });
          continue;
        }
      }
    }
  }

  // Cap at 100 items to avoid polluting memory
  return knowledge.slice(0, 100);
}

// ── Main Import Function ──────────────────────────

export function processImport(jsonData: unknown, source: ImportSource): ImportResult {
  const errors: string[] = [];

  let conversations: ParsedConversation[];
  try {
    conversations = source === 'chatgpt'
      ? parseChatGPTExport(jsonData)
      : parseClaudeExport(jsonData);
  } catch (err: any) {
    return {
      source,
      conversationsFound: 0,
      conversationsParsed: 0,
      knowledgeExtracted: [],
      errors: [`Parse error: ${err.message}`],
    };
  }

  if (conversations.length === 0) {
    errors.push('No conversations found in export');
  }

  const knowledge = extractKnowledge(conversations);

  return {
    source,
    conversationsFound: conversations.length,
    conversationsParsed: conversations.filter(c => c.messages.length > 0).length,
    knowledgeExtracted: knowledge,
    errors,
  };
}
