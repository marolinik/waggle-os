/**
 * ArtifactBlock (UX-Northstar Phase C2) — artifact-first chat rendering.
 * Pins:
 *  - completed write_file/edit_file blocks render the artifact card
 *  - running / failed / non-file tool blocks keep the generic tool row
 *  - Open in Files stashes a path deep-link and fires waggle:open-app
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import BlockRenderer from '@/components/os/apps/chat-blocks/BlockRenderer';
import { isArtifactBlock } from '@/components/os/apps/chat-blocks/ArtifactBlock';
import { consumeDeepLink } from '@/lib/app-deeplink';
import type { ToolUseContentBlock } from '@/lib/types';

const toolBlock = (over: Partial<ToolUseContentBlock>): ToolUseContentBlock => ({
  type: 'tool_use',
  id: 'tb-1',
  name: 'write_file',
  status: 'done',
  input: { path: 'reports/q3-summary.md' },
  ...over,
});

describe('ArtifactBlock', () => {
  afterEach(() => {
    cleanup();
    consumeDeepLink('files'); // drain any stashed link between tests
  });

  it('renders the artifact card for a completed write_file', () => {
    render(<BlockRenderer blocks={[toolBlock({})]} />);
    expect(screen.getByTestId('chat-artifact-block')).toBeTruthy();
    expect(screen.getByText('q3-summary.md')).toBeTruthy();
    expect(screen.getByText(/Created by the agent/)).toBeTruthy();
  });

  it('says Updated for edit_file', () => {
    render(<BlockRenderer blocks={[toolBlock({ name: 'edit_file' })]} />);
    expect(screen.getByText(/Updated by the agent/)).toBeTruthy();
  });

  it('keeps the generic tool row while running and on error', () => {
    render(
      <BlockRenderer
        blocks={[
          toolBlock({ id: 'tb-r', status: 'running' }),
          toolBlock({ id: 'tb-e', status: 'error' }),
        ]}
      />,
    );
    expect(screen.queryByTestId('chat-artifact-block')).toBeNull();
  });

  it('does not treat non-file tools as artifacts', () => {
    expect(isArtifactBlock(toolBlock({ name: 'web_search', input: { path: 'x' } }))).toBe(false);
    expect(isArtifactBlock(toolBlock({ input: {} }))).toBe(false);
    expect(isArtifactBlock(toolBlock({}))).toBe(true);
  });

  it('Open in Files stashes the path deep-link and fires waggle:open-app', () => {
    const events: string[] = [];
    const handler = (e: Event) => events.push((e as CustomEvent).detail?.appId);
    window.addEventListener('waggle:open-app', handler);

    render(<BlockRenderer blocks={[toolBlock({})]} />);
    fireEvent.click(screen.getByTestId('chat-artifact-open'));

    window.removeEventListener('waggle:open-app', handler);
    expect(events).toEqual(['files']);
    expect(consumeDeepLink('files')).toMatchObject({ appId: 'files', path: 'reports/q3-summary.md' });
  });
});
