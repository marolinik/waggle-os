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
    expect(screen.getByText(/Worked across your memory/)).toBeInTheDocument();
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
      { type: 'step', blockId: 's2', description: 'Recalled 2 relevant memories', status: 'done' },
      { type: 'step', blockId: 's3', description: 'Searched 3 sites', status: 'done' },
    ];
    render(<BlockRenderer blocks={blocks} />);
    // Exactly one summary despite the tool_use splitting the step run.
    expect(screen.getAllByText(/Worked across your memory/)).toHaveLength(1);
    // Expanding the single card reveals all three step descriptions.
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('Recalling relevant memories')).toBeInTheDocument();
    expect(screen.getByText('Recalled 2 relevant memories')).toBeInTheDocument();
    expect(screen.getByText('Searched 3 sites')).toBeInTheDocument();
  });
});
