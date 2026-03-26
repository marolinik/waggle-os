import { describe, it, expect } from 'vitest';
import { parseChatGPTExport, parseClaudeExport, extractKnowledge, processImport } from '../src/memory-import';

describe('ChatGPT Export Parser', () => {
  it('parses conversations with mapping structure', () => {
    const data = [
      {
        title: 'Test Chat',
        create_time: 1709000000,
        mapping: {
          'node1': {
            message: {
              author: { role: 'user' },
              content: { parts: ['Hello, I need help with React'] },
              create_time: 1709000001,
            },
          },
          'node2': {
            message: {
              author: { role: 'assistant' },
              content: { parts: ['Sure, I can help with React!'] },
              create_time: 1709000002,
            },
          },
        },
      },
    ];

    const result = parseChatGPTExport(data);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Test Chat');
    expect(result[0].messages).toHaveLength(2);
    expect(result[0].messages[0].role).toBe('user');
    expect(result[0].messages[0].text).toBe('Hello, I need help with React');
    expect(result[0].source).toBe('chatgpt');
  });

  it('skips system messages', () => {
    const data = [
      {
        title: 'Test',
        mapping: {
          'sys': { message: { author: { role: 'system' }, content: { parts: ['System prompt'] } } },
          'user': { message: { author: { role: 'user' }, content: { parts: ['Hi'] }, create_time: 1 } },
        },
      },
    ];
    const result = parseChatGPTExport(data);
    expect(result[0].messages).toHaveLength(1);
    expect(result[0].messages[0].role).toBe('user');
  });

  it('handles empty/missing conversations gracefully', () => {
    expect(parseChatGPTExport(null)).toEqual([]);
    expect(parseChatGPTExport({})).toEqual([]);
    expect(parseChatGPTExport([])).toEqual([]);
  });

  it('sorts messages chronologically by create_time', () => {
    const data = [
      {
        title: 'Order Test',
        mapping: {
          'late': {
            message: {
              author: { role: 'user' },
              content: { parts: ['Second message'] },
              create_time: 200,
            },
          },
          'early': {
            message: {
              author: { role: 'user' },
              content: { parts: ['First message'] },
              create_time: 100,
            },
          },
        },
      },
    ];
    const result = parseChatGPTExport(data);
    expect(result[0].messages[0].text).toBe('First message');
    expect(result[0].messages[1].text).toBe('Second message');
  });

  it('filters out conversations with no messages', () => {
    const data = [
      { title: 'Empty', mapping: {} },
      {
        title: 'Has Messages',
        mapping: {
          'n1': { message: { author: { role: 'user' }, content: { parts: ['Hello'] }, create_time: 1 } },
        },
      },
    ];
    const result = parseChatGPTExport(data);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Has Messages');
  });

  it('handles wrapped format with conversations key', () => {
    const data = {
      conversations: [
        {
          title: 'Wrapped',
          mapping: {
            'n1': { message: { author: { role: 'user' }, content: { parts: ['Test'] }, create_time: 1 } },
          },
        },
      ],
    };
    const result = parseChatGPTExport(data);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Wrapped');
  });
});

describe('Claude Export Parser', () => {
  it('parses conversations with chat_messages', () => {
    const data = [
      {
        name: 'Claude Chat',
        created_at: '2024-03-01T10:00:00Z',
        chat_messages: [
          { sender: 'human', text: 'What is TypeScript?', created_at: '2024-03-01T10:00:01Z' },
          { sender: 'assistant', text: 'TypeScript is a superset of JavaScript.', created_at: '2024-03-01T10:00:05Z' },
        ],
      },
    ];

    const result = parseClaudeExport(data);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Claude Chat');
    expect(result[0].messages).toHaveLength(2);
    expect(result[0].messages[0].role).toBe('user');
    expect(result[0].source).toBe('claude');
  });

  it('handles empty exports gracefully', () => {
    expect(parseClaudeExport(null)).toEqual([]);
    expect(parseClaudeExport([])).toEqual([]);
  });

  it('handles alternative field names (title, messages, role, content)', () => {
    const data = [
      {
        title: 'Alt Format',
        messages: [
          { role: 'user', content: 'Hello from alt format', timestamp: '2024-03-01T10:00:00Z' },
        ],
      },
    ];
    const result = parseClaudeExport(data);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Alt Format');
    expect(result[0].messages[0].text).toBe('Hello from alt format');
  });
});

describe('Knowledge Extraction', () => {
  it('extracts decisions from user messages', () => {
    const convs = [{
      title: 'Tech Discussion',
      messages: [
        { role: 'user' as const, text: 'I decided to use React for the frontend and Node.js for the backend' },
        { role: 'assistant' as const, text: 'Great choice!' },
      ],
      source: 'chatgpt' as const,
    }];

    const knowledge = extractKnowledge(convs);
    const decisions = knowledge.filter(k => k.type === 'decision');
    expect(decisions.length).toBeGreaterThan(0);
    expect(decisions[0].content).toContain('decided');
    expect(decisions[0].importance).toBe('important');
  });

  it('extracts preferences from user messages', () => {
    const convs = [{
      title: 'Preferences',
      messages: [
        { role: 'user' as const, text: 'I prefer bullet-point summaries over long paragraphs' },
      ],
      source: 'claude' as const,
    }];

    const knowledge = extractKnowledge(convs);
    const prefs = knowledge.filter(k => k.type === 'preference');
    expect(prefs.length).toBeGreaterThan(0);
    expect(prefs[0].content).toContain('prefer');
    expect(prefs[0].importance).toBe('important');
  });

  it('extracts facts about the user', () => {
    const convs = [{
      title: 'About me',
      messages: [
        { role: 'user' as const, text: 'I work at Egzakta Advisory as a partner and consultant' },
      ],
      source: 'chatgpt' as const,
    }];

    const knowledge = extractKnowledge(convs);
    const facts = knowledge.filter(k => k.type === 'fact');
    expect(facts.length).toBeGreaterThan(0);
    expect(facts[0].content).toContain('Egzakta');
  });

  it('extracts conversation topics', () => {
    const convs = [{
      title: 'Building a SaaS Platform',
      messages: [
        { role: 'user' as const, text: 'Help me plan the architecture' },
      ],
      source: 'chatgpt' as const,
    }];

    const knowledge = extractKnowledge(convs);
    const topics = knowledge.filter(k => k.type === 'topic');
    expect(topics.length).toBeGreaterThan(0);
    expect(topics[0].content).toContain('Building a SaaS Platform');
  });

  it('caps extraction at 100 items', () => {
    const convs = Array.from({ length: 200 }, (_, i) => ({
      title: `Conversation ${i}`,
      messages: [
        { role: 'user' as const, text: `I decided to use approach ${i} for the implementation` },
      ],
      source: 'chatgpt' as const,
    }));

    const knowledge = extractKnowledge(convs);
    expect(knowledge.length).toBeLessThanOrEqual(100);
  });

  it('deduplicates similar content', () => {
    const convs = [
      {
        title: 'Chat 1',
        messages: [{ role: 'user' as const, text: 'I prefer TypeScript over JavaScript for type safety' }],
        source: 'chatgpt' as const,
      },
      {
        title: 'Chat 2',
        messages: [{ role: 'user' as const, text: 'I prefer TypeScript over JavaScript for type safety' }],
        source: 'chatgpt' as const,
      },
    ];

    const knowledge = extractKnowledge(convs);
    const prefs = knowledge.filter(k => k.type === 'preference');
    expect(prefs.length).toBe(1); // Deduped
  });

  it('skips very short and very long messages', () => {
    const convs = [{
      title: 'Test',
      messages: [
        { role: 'user' as const, text: 'Hi' }, // Too short
        { role: 'user' as const, text: 'x'.repeat(600) }, // Too long
        { role: 'user' as const, text: 'I decided to use Python for data analysis tasks' }, // Just right
      ],
      source: 'chatgpt' as const,
    }];

    const knowledge = extractKnowledge(convs);
    const decisions = knowledge.filter(k => k.type === 'decision');
    expect(decisions.length).toBe(1);
  });

  it('skips assistant messages', () => {
    const convs = [{
      title: 'Test',
      messages: [
        { role: 'assistant' as const, text: 'I decided to use a different approach for this solution' },
      ],
      source: 'chatgpt' as const,
    }];

    const knowledge = extractKnowledge(convs);
    const decisions = knowledge.filter(k => k.type === 'decision');
    expect(decisions.length).toBe(0);
  });
});

describe('processImport (end-to-end)', () => {
  it('processes a ChatGPT export end-to-end', () => {
    const data = [
      {
        title: 'Project Planning',
        create_time: 1709000000,
        mapping: {
          'n1': { message: { author: { role: 'user' }, content: { parts: ['I decided to use React with TypeScript for the frontend'] }, create_time: 1 } },
          'n2': { message: { author: { role: 'assistant' }, content: { parts: ['Great choice!'] }, create_time: 2 } },
          'n3': { message: { author: { role: 'user' }, content: { parts: ['I prefer concise responses without filler words'] }, create_time: 3 } },
        },
      },
    ];

    const result = processImport(data, 'chatgpt');
    expect(result.source).toBe('chatgpt');
    expect(result.conversationsFound).toBe(1);
    expect(result.conversationsParsed).toBe(1);
    expect(result.knowledgeExtracted.length).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);

    const decisions = result.knowledgeExtracted.filter(k => k.type === 'decision');
    expect(decisions.length).toBeGreaterThan(0);
  });

  it('processes a Claude export end-to-end', () => {
    const data = [
      {
        name: 'Architecture Discussion',
        created_at: '2024-03-01T10:00:00Z',
        chat_messages: [
          { sender: 'human', text: 'I work at Acme Corp as a senior engineer', created_at: '2024-03-01T10:00:01Z' },
          { sender: 'assistant', text: 'Nice to meet you!', created_at: '2024-03-01T10:00:05Z' },
        ],
      },
    ];

    const result = processImport(data, 'claude');
    expect(result.source).toBe('claude');
    expect(result.conversationsFound).toBe(1);
    expect(result.knowledgeExtracted.length).toBeGreaterThan(0);
  });

  it('returns errors for invalid data', () => {
    const result = processImport('not json', 'chatgpt');
    expect(result.conversationsFound).toBe(0);
    expect(result.knowledgeExtracted).toHaveLength(0);
  });

  it('reports when no conversations found', () => {
    const result = processImport([], 'chatgpt');
    expect(result.errors).toContain('No conversations found in export');
  });
});
