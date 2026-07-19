import { describe, it, expect } from 'vitest';
import type { Embedder } from '@waggle/core';
import { McpToolRetriever, buildRetrievalQuery } from '../src/mcp/mcp-tool-retrieval.js';
import type { ToolDefinition } from '../src/tools.js';

// Steal #6 — on-demand MCP tool retrieval. Locks the six invariants the wiring
// relies on: threshold gate, embedding top-k, union-only accumulation across
// turns, mock-embedder keyword degrade, dim-mismatch skip, and never breaking
// the turn on a retrieval failure.

function makeTool(name: string, description: string): ToolDefinition {
  return {
    name,
    description,
    parameters: { type: 'object', properties: {} },
    execute: async () => 'ok',
  };
}

/** N filler tools that share no query vocabulary, to push past the threshold. */
function fillerTools(n: number): ToolDefinition[] {
  return Array.from({ length: n }, (_, i) =>
    makeTool(`mcp_filler_tool_${i}`, `[MCP: filler] Unrelated capability number ${i}`),
  );
}

const VOCAB = [
  'github', 'issue', 'pull', 'slack', 'message', 'postgres',
  'query', 'stripe', 'payment', 'notion', 'page', 'search',
];

function vocabVec(text: string): Float32Array {
  const lower = text.toLowerCase();
  const v = new Float32Array(VOCAB.length);
  VOCAB.forEach((w, i) => { if (lower.includes(w)) v[i] = 1; });
  return v;
}

/** Deterministic vocabulary-overlap embedder — cosine reflects word overlap. */
const overlapEmbedder: Embedder = {
  dimensions: VOCAB.length,
  async embed(t: string) { return vocabVec(t); },
  async embedBatch(ts: string[]) { return ts.map(vocabVec); },
};

const userMsg = (content: string) => ({ role: 'user', content });

describe('buildRetrievalQuery', () => {
  it('joins the trailing <=5 user/assistant text turns, skipping tool + empty', () => {
    const q = buildRetrievalQuery([
      userMsg('first'),
      { role: 'tool', content: 'tool blob' },
      { role: 'assistant', content: '  ' },
      { role: 'assistant', content: 'second' },
    ]);
    expect(q).toBe('first\nsecond');
  });

  it('keeps only the last 5 turns', () => {
    const msgs = Array.from({ length: 8 }, (_, i) => userMsg(`m${i}`));
    expect(buildRetrievalQuery(msgs)).toBe('m3\nm4\nm5\nm6\nm7');
  });
});

describe('McpToolRetriever threshold gate', () => {
  it('injects ALL MCP tools when count <= threshold (no ranking)', async () => {
    const retriever = new McpToolRetriever({ embedder: overlapEmbedder });
    const tools = fillerTools(15);
    const out = await retriever.selectTools(tools, [userMsg('anything')], 'c1', { threshold: 20 });
    expect(out).toHaveLength(15);
  });

  it('injects ALL MCP tools when disabled, regardless of count', async () => {
    const retriever = new McpToolRetriever({ embedder: overlapEmbedder });
    const tools = fillerTools(50);
    const out = await retriever.selectTools(tools, [userMsg('anything')], 'c1', { enabled: false });
    expect(out).toHaveLength(50);
  });

  it('returns empty for an empty tool set', async () => {
    const retriever = new McpToolRetriever({ embedder: overlapEmbedder });
    expect(await retriever.selectTools([], [userMsg('x')], 'c1')).toEqual([]);
  });
});

describe('McpToolRetriever embedding top-k', () => {
  it('selects the top-k most relevant MCP tools above the threshold', async () => {
    const retriever = new McpToolRetriever({ embedder: overlapEmbedder });
    const tools = [
      makeTool('mcp_github_create_issue', '[MCP: github] Create a github issue'),
      makeTool('mcp_slack_send', '[MCP: slack] Send a slack message'),
      makeTool('mcp_postgres_query', '[MCP: postgres] Run a postgres query'),
      ...fillerTools(25),
    ];
    const out = await retriever.selectTools(
      tools, [userMsg('open a github issue for the bug')], 'c1', { threshold: 20, topK: 2 },
    );
    const names = out.map(t => t.name);
    expect(names).toContain('mcp_github_create_issue');
    // top-k caps the added set; filler tools with zero overlap never win.
    expect(out.length).toBeLessThanOrEqual(2);
    expect(names).not.toContain('mcp_slack_send');
  });

  it('lets the newest user intent dominate while retaining recent context', async () => {
    const retriever = new McpToolRetriever({ embedder: overlapEmbedder });
    const tools = [
      makeTool('mcp_github_create_issue', '[MCP: github] Create a github issue'),
      makeTool('mcp_slack_send', '[MCP: slack] Send a slack message'),
      makeTool('mcp_postgres_query', '[MCP: postgres] Run a postgres query'),
      ...fillerTools(25),
    ];

    await retriever.selectTools(
      tools, [userMsg('open a github issue')], 'conv', { threshold: 20, topK: 1 },
    );
    const slackTurn = await retriever.selectTools(
      tools,
      [userMsg('open a github issue'), userMsg('send a slack message')],
      'conv',
      { threshold: 20, topK: 1 },
    );
    const postgresTurn = await retriever.selectTools(
      tools,
      [
        userMsg('open a github issue'),
        userMsg('send a slack message'),
        userMsg('query postgres'),
      ],
      'conv',
      { threshold: 20, topK: 1 },
    );

    expect(slackTurn.map(tool => tool.name)).toEqual([
      'mcp_github_create_issue',
      'mcp_slack_send',
    ]);
    expect(postgresTurn.map(tool => tool.name)).toEqual([
      'mcp_github_create_issue',
      'mcp_slack_send',
      'mcp_postgres_query',
    ]);
  });

  it('reports only this turn semantic matches separately from the accumulated pool', async () => {
    const retriever = new McpToolRetriever({ embedder: overlapEmbedder });
    const tools = [
      makeTool('mcp_github_create_issue', '[MCP: github] Create a github issue'),
      makeTool('mcp_slack_send', '[MCP: slack] Send a slack message'),
      ...fillerTools(25),
    ];

    await retriever.selectTools(
      tools, [userMsg('open a github issue')], 'conv', { threshold: 20, topK: 1 },
    );
    const selection = await retriever.selectToolsWithDetails(
      tools,
      [userMsg('open a github issue'), userMsg('send a slack message')],
      'conv',
      { threshold: 20, topK: 1 },
    );

    expect(selection.tools.map(tool => tool.name)).toEqual([
      'mcp_github_create_issue',
      'mcp_slack_send',
    ]);
    expect(selection.retrievedToolNames).toEqual(['mcp_slack_send']);
  });
});

describe('McpToolRetriever union-only accumulation', () => {
  it('keeps previously selected tools across turns even as the query shifts', async () => {
    const retriever = new McpToolRetriever({ embedder: overlapEmbedder });
    const tools = [
      makeTool('mcp_github_create_issue', '[MCP: github] Create a github issue'),
      makeTool('mcp_slack_send', '[MCP: slack] Send a slack message'),
      ...fillerTools(25),
    ];
    const t1 = await retriever.selectTools(tools, [userMsg('github issue')], 'conv', { threshold: 20, topK: 1 });
    expect(t1.map(t => t.name)).toContain('mcp_github_create_issue');

    const t2 = await retriever.selectTools(tools, [userMsg('send a slack message')], 'conv', { threshold: 20, topK: 1 });
    const names = t2.map(t => t.name);
    // Union-only: the github tool from turn 1 survives, slack is added.
    expect(names).toContain('mcp_github_create_issue');
    expect(names).toContain('mcp_slack_send');
  });

  it('isolates accumulators per conversation', async () => {
    const retriever = new McpToolRetriever({ embedder: overlapEmbedder });
    const tools = [
      makeTool('mcp_github_create_issue', '[MCP: github] Create a github issue'),
      ...fillerTools(25),
    ];
    await retriever.selectTools(tools, [userMsg('github issue')], 'A', { threshold: 20, topK: 1 });
    const other = await retriever.selectTools(tools, [userMsg('nothing relevant here')], 'B', { threshold: 20, topK: 1 });
    expect(other.map(t => t.name)).not.toContain('mcp_github_create_issue');
  });
});

describe('McpToolRetriever mock-embedder degrade', () => {
  it('falls back to keyword scoring when the embedder is the deterministic mock', async () => {
    // embedBatch throws — proving the keyword path is taken (never the embedder).
    const mockEmbedder = {
      dimensions: 8,
      async embed() { throw new Error('mock embed must not be called'); },
      async embedBatch() { throw new Error('mock embedBatch must not be called'); },
      getActiveProvider() { return 'mock'; },
    } as unknown as Embedder;
    const retriever = new McpToolRetriever({ embedder: mockEmbedder });
    const tools = [
      makeTool('mcp_github_create_issue', '[MCP: github] Create a github issue'),
      ...fillerTools(25),
    ];
    const out = await retriever.selectTools(tools, [userMsg('github issue please')], 'c1', { threshold: 20, topK: 3 });
    const names = out.map(t => t.name);
    expect(names).toContain('mcp_github_create_issue');
    // Keyword fallback never full-dumps above the threshold.
    expect(out.length).toBeLessThanOrEqual(3);
  });

  it('uses keyword scoring when no embedder is configured', async () => {
    const retriever = new McpToolRetriever({ embedder: null });
    const tools = [
      makeTool('mcp_notion_search', '[MCP: notion] Search notion pages'),
      ...fillerTools(25),
    ];
    const out = await retriever.selectTools(tools, [userMsg('search notion')], 'c1', { threshold: 20, topK: 3 });
    expect(out.map(t => t.name)).toContain('mcp_notion_search');
    expect(out.length).toBeLessThanOrEqual(3);
  });

  it('weights the newest intent in keyword fallback too', async () => {
    const retriever = new McpToolRetriever({ embedder: null });
    const tools = [
      makeTool('mcp_github', '[MCP] github'),
      makeTool('mcp_slack', '[MCP] slack'),
      makeTool('mcp_postgres', '[MCP] postgres'),
      ...fillerTools(25),
    ];

    await retriever.selectTools(
      tools, [userMsg('github')], 'conv', { threshold: 20, topK: 1 },
    );
    const slackTurn = await retriever.selectTools(
      tools,
      [userMsg('github'), userMsg('slack')],
      'conv',
      { threshold: 20, topK: 1 },
    );
    const postgresTurn = await retriever.selectTools(
      tools,
      [userMsg('github'), userMsg('slack'), userMsg('postgres')],
      'conv',
      { threshold: 20, topK: 1 },
    );

    expect(slackTurn.map(tool => tool.name)).toContain('mcp_slack');
    expect(postgresTurn.map(tool => tool.name)).toContain('mcp_postgres');
  });
});

describe('McpToolRetriever dim-mismatch skip', () => {
  it('skips tools whose indexed vector length differs from the query vector', async () => {
    // A tool named with "baddim" gets a length-3 vector; everything else length-12.
    const mismatchEmbedder: Embedder = {
      dimensions: VOCAB.length,
      async embed(t: string) { return vocabVec(t); },
      async embedBatch(ts: string[]) {
        return ts.map(t => (t.includes('baddim') ? new Float32Array(3) : vocabVec(t)));
      },
    };
    const retriever = new McpToolRetriever({ embedder: mismatchEmbedder });
    const tools = [
      // Strong textual match, but its vector is the wrong length → must be skipped.
      makeTool('mcp_baddim_github', '[MCP: baddim] github issue pull message'),
      makeTool('mcp_github_create_issue', '[MCP: github] Create a github issue'),
      ...fillerTools(25),
    ];
    const out = await retriever.selectTools(tools, [userMsg('github issue')], 'c1', { threshold: 20, topK: 2 });
    const names = out.map(t => t.name);
    expect(names).not.toContain('mcp_baddim_github');
    expect(names).toContain('mcp_github_create_issue');
  });
});

describe('McpToolRetriever failure isolation', () => {
  it('returns the accumulated set (never throws) when ranking fails mid-conversation', async () => {
    let fail = false;
    const flakyEmbedder: Embedder = {
      dimensions: VOCAB.length,
      async embed(t: string) { return vocabVec(t); },
      async embedBatch(ts: string[]) {
        if (fail) throw new Error('embedding backend down');
        return ts.map(vocabVec);
      },
    };
    const retriever = new McpToolRetriever({ embedder: flakyEmbedder });
    const tools = [
      makeTool('mcp_github_create_issue', '[MCP: github] Create a github issue'),
      ...fillerTools(25),
    ];
    // Turn 1 succeeds and seeds the accumulator.
    const t1 = await retriever.selectTools(tools, [userMsg('github issue')], 'conv', { threshold: 20, topK: 1 });
    expect(t1.map(t => t.name)).toContain('mcp_github_create_issue');

    // Turn 2: the query embed throws (index is cached, so only the query embeds).
    fail = true;
    const t2 = await retriever.selectTools(tools, [userMsg('slack message')], 'conv', { threshold: 20, topK: 1 });
    // No throw; accumulated set preserved, nothing new added.
    expect(t2.map(t => t.name)).toEqual(['mcp_github_create_issue']);
  });

  it('returns empty (not all) when the first turn fails with no accumulated tools', async () => {
    const deadEmbedder: Embedder = {
      dimensions: VOCAB.length,
      async embed() { throw new Error('down'); },
      async embedBatch() { throw new Error('down'); },
    };
    const retriever = new McpToolRetriever({ embedder: deadEmbedder });
    const tools = [makeTool('mcp_github_create_issue', '[MCP: github] issue'), ...fillerTools(25)];
    const out = await retriever.selectTools(tools, [userMsg('github issue')], 'c1', { threshold: 20, topK: 1 });
    expect(out).toEqual([]);
  });
});
