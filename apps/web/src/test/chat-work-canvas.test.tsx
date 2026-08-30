/**
 * PR3 Phase B2/B3 — Chat work-canvas selector + activity grouping.
 *
 * Locks two net-new behaviors:
 *  - selectCanvasArtifact: latest completed file-write → {path, body}, body
 *    prefers input.content over the opaque result; null when none.
 *  - BlockRenderer: a consecutive run of `step` blocks collapses into ONE
 *    Activity card (default-collapsed off the active turn, open while streaming),
 *    while a completed write_file still routes to the artifact card.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { ChatMessage, ContentBlock } from '@/lib/types';
import { BlockRenderer } from '@/components/os/apps/chat-blocks';
import { selectCanvasArtifact } from '@/components/os/apps/chat-blocks/ChatWorkCanvas';

afterEach(cleanup);

function asstMsg(blocks: ContentBlock[]): ChatMessage {
  return { id: 'm1', role: 'assistant', content: '', blocks, timestamp: new Date().toISOString() };
}

const writeBlock = (path: string, content?: string, result?: string): ContentBlock => ({
  type: 'tool_use', id: 't1', name: 'write_file', status: 'done',
  input: { path, ...(content !== undefined ? { content } : {}) },
  ...(result !== undefined ? { result } : {}),
});

const contextBlock = (): ContentBlock => ({
  type: 'tool_context',
  blockId: 'context-1',
  metrics: {
    toolCatalogCount: 29,
    toolEligibleCount: 29,
    toolSelectedCount: 4,
    toolOmittedCount: 25,
    transmittedToolSchemaChars: 3200,
    estimatedToolSchemaTokens: 800,
    finalSystemPromptChars: 4800,
    estimatedSystemPromptTokens: 1200,
    packageMode: 'compact',
    selectorLatencyMs: 3,
    timeToFirstTokenMs: 140,
    agentLatencyMs: 420,
    totalServerLatencyMs: 450,
    providerInputTokens: 1500,
    providerOutputTokens: 120,
  },
});

describe('selectCanvasArtifact', () => {
  it('returns the latest completed file-write, preferring input.content', () => {
    const out = selectCanvasArtifact([asstMsg([writeBlock('docs/teardown.md', '# Q2 Teardown', 'ok')])]);
    expect(out).toEqual({ path: 'docs/teardown.md', body: '# Q2 Teardown' });
  });

  it('falls back to the result string when no input.content', () => {
    const out = selectCanvasArtifact([asstMsg([writeBlock('a.md', undefined, 'wrote 9 rows')])]);
    expect(out).toEqual({ path: 'a.md', body: 'wrote 9 rows' });
  });

  it('ignores running/non-file blocks and returns null when none qualify', () => {
    const running: ContentBlock = { type: 'tool_use', id: 't2', name: 'write_file', status: 'running', input: { path: 'x.md' } };
    expect(selectCanvasArtifact([asstMsg([running])])).toBeNull();
    expect(selectCanvasArtifact([asstMsg([{ type: 'text', blockId: 'b', content: 'hi' }])])).toBeNull();
  });
});

describe('BlockRenderer — activity grouping', () => {
  const steps: ContentBlock[] = [
    { type: 'step', blockId: 's1', description: 'Recalled 6 memories', status: 'done' },
    { type: 'step', blockId: 's2', description: 'Searched 9 sites', status: 'done' },
  ];

  it('collapses consecutive steps into one Activity card (closed off the active turn)', () => {
    render(<BlockRenderer blocks={steps} />);
    expect(screen.getByRole('button', { name: /Activity.*2 steps/ })).toBeInTheDocument();
    expect(screen.queryByText(/memory|web|files/i)).not.toBeInTheDocument();
    // collapsed → step text hidden until expanded
    expect(screen.queryByText('Recalled 6 memories')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('Recalled 6 memories')).toBeInTheDocument();
    expect(screen.getByText('Searched 9 sites')).toBeInTheDocument();
  });

  it('opens the Activity card by default while streaming', () => {
    render(<BlockRenderer blocks={steps} isStreaming />);
    expect(screen.getByText('Recalled 6 memories')).toBeInTheDocument();
  });

  it('still routes a completed write_file to the artifact card', () => {
    render(<BlockRenderer blocks={[writeBlock('out/report.md', '# R')]} />);
    expect(screen.getByTestId('chat-artifact-block')).toBeInTheDocument();
  });

  it('F11: steps split by a tool_use (auto-recall) still yield ONE Activity card', () => {
    const blocks: ContentBlock[] = [
      { type: 'step', blockId: 's1', description: 'Recalling relevant memories', status: 'done' },
      { type: 'tool_use', id: 't1', name: 'auto_recall', status: 'done', input: {}, result: '2 memories recalled' },
      {
        type: 'step', blockId: 's2', description: 'Recalled 2 relevant memories', status: 'done',
        provenance: { sources: ['chatgpt'] },
      },
      { type: 'step', blockId: 's3', description: 'Searched 3 sites', status: 'done' },
    ];
    render(<BlockRenderer blocks={blocks} />);
    // Exactly one truthful summary despite the tool_use splitting the step run.
    expect(screen.getAllByText(/Used saved memory/)).toHaveLength(1);
    expect(screen.queryByText('Auto Recall')).not.toBeInTheDocument();
    // Expanding the single card reveals all three step descriptions.
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('Recalling relevant memories')).toBeInTheDocument();
    expect(screen.getByText('Recalled 2 relevant memories')).toBeInTheDocument();
    expect(screen.getByText('Searched 3 sites')).toBeInTheDocument();
    expect(screen.queryByText('Auto Recall')).not.toBeInTheDocument();
  });

  it.each([
    ['empty', 'done', 'No relevant memories found', 'Checked saved memory'],
    ['failed', 'error', 'Error: memory index unavailable', 'Memory check failed'],
    ['denied', 'denied', 'Denied by policy', 'Memory check denied'],
  ] as const)('never calls an %s recall successful', (_case, status, result, summary) => {
    const recall: ContentBlock = {
      type: 'tool_use', id: `recall-${_case}`, name: 'auto_recall', status, result,
    };
    render(<BlockRenderer blocks={[recall]} />);
    expect(screen.getByText(new RegExp(summary))).toBeInTheDocument();
    expect(screen.queryByText(/Used saved memory/)).not.toBeInTheDocument();
  });

  it('progressively discloses real tool execution and compact-context efficiency', () => {
    const tool: ContentBlock = {
      type: 'tool_use', id: 'tool-1', name: 'web_search', status: 'done',
      input: { query: 'Waggle' }, result: 'Found 3 results', duration: 80,
    };

    render(<BlockRenderer blocks={[tool, contextBlock()]} />);
    expect(screen.getByText(/Used 1 tool/)).toBeInTheDocument();
    expect(screen.queryByText('Web Search')).not.toBeInTheDocument();
    expect(screen.queryByText(/Prepared 4 of 29/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('Web Search')).toBeInTheDocument();
    expect(screen.getByText('Context efficiency')).toBeInTheDocument();
    expect(screen.queryByText(/Prepared 4 of 29/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Web Search/ }));
    expect(screen.getByText(/"query": "Waggle"/)).toBeInTheDocument();
    expect(screen.getByText('Found 3 results')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Context efficiency'));
    expect(screen.getByText(/Prepared 4 of 29 eligible tools/)).toBeInTheDocument();
    expect(screen.getByText(/25 kept out of model context/)).toBeInTheDocument();
    expect(screen.queryByText(/applied skill|used skill/i)).not.toBeInTheDocument();
  });

  it('keeps selection-without-execution and artifact context inspectable without claiming a run', () => {
    const first = render(<BlockRenderer blocks={[contextBlock()]} />);
    expect(screen.getByRole('button', { name: 'Context efficiency' })).toBeInTheDocument();
    expect(screen.queryByText(/Used \d+ tools?/)).not.toBeInTheDocument();
    first.unmount();

    render(<BlockRenderer blocks={[writeBlock('out/report.md', '# R'), contextBlock()]} />);
    expect(screen.getByTestId('chat-artifact-block')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Context efficiency' })).toBeInTheDocument();
  });

  it('counts artifact execution without duplicating its artifact card', () => {
    const web: ContentBlock = {
      type: 'tool_use', id: 'tool-web', name: 'web_search', status: 'done', result: 'ok',
    };
    const write: ContentBlock = {
      type: 'tool_use', id: 'tool-write', name: 'write_file', status: 'done',
      input: { path: 'out/report.md', content: '# R' }, result: 'ok',
    };
    render(<BlockRenderer blocks={[web, write, contextBlock()]} />);
    expect(screen.getByText(/Used 2 tools/)).toBeInTheDocument();
    expect(screen.getByTestId('chat-artifact-block')).toBeInTheDocument();
  });

  it.each([
    ['success', 'done', /Used 1 tool.*1 denied/],
    ['failure', 'error', /1 tool failed.*1 denied/],
  ] as const)('keeps a denied tool visible beside a %s execution', (_case, status, expected) => {
    const executed: ContentBlock = {
      type: 'tool_use', id: `executed-${_case}`, name: 'web_search', status, result: 'result',
    };
    const denied: ContentBlock = {
      type: 'tool_use', id: `denied-${_case}`, name: 'write_file', status: 'denied',
      input: { path: 'blocked.md' }, result: 'Denied by policy',
    };
    render(<BlockRenderer blocks={[executed, denied]} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('shows a failed tool truthfully without claiming success or skill application', () => {
    const failed: ContentBlock = {
      type: 'tool_use', id: 'tool-failed', name: 'read_skill', status: 'error',
      input: { name: 'research' }, result: 'Error: unavailable', duration: 12,
    };

    render(<BlockRenderer blocks={[failed]} />);
    expect(screen.getByText(/1 tool failed/)).toBeInTheDocument();
    expect(screen.queryByText(/applied skill|used skill/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText("Couldn't open Research skill")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Couldn't open Research skill/ }));
    expect(screen.getByText('Error: unavailable')).toBeInTheDocument();
  });

  it('reports a successful skill read as opened, never applied', () => {
    const read: ContentBlock = {
      type: 'tool_use', id: 'skill-read', name: 'read_skill', status: 'done',
      input: { name: 'meeting-prep' }, result: 'Skill guidance', duration: 5,
    };
    render(<BlockRenderer blocks={[read]} />);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('Opened Meeting Prep skill')).toBeInTheDocument();
    expect(screen.queryByText(/applied|used Meeting Prep skill/i)).not.toBeInTheDocument();
  });
});
