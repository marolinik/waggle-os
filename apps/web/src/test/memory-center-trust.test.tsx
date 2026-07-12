import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import type { Memory } from '@/lib/types';
import { clearMemoryListCache } from '@/components/os/apps/memory/memory-list-cache';

const mocks = vi.hoisted(() => ({
  adapter: {
    listMemories: vi.fn(),
    patchMemory: vi.fn(),
    archiveMemory: vi.fn(),
    deleteMemoryById: vi.fn(),
    mergeMemories: vi.fn(),
    getMemoryOriginalSource: vi.fn(),
    eraseMemory: vi.fn(),
    listSuppression: vi.fn(),
    allowReimport: vi.fn(),
  },
}));

vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter }));

import MemoryCenterTab from '@/components/os/apps/memory/MemoryCenterTab';

const memory: Memory = {
  id: 'memory-research-note',
  kind: 'fact',
  title: 'Research Note',
  content: 'The supplier review belongs in the Q3 diligence packet.',
  scope: 'personal',
  workspaceId: undefined,
  source: 'user_stated',
  sourceId: null,
  sourceUrl: null,
  importance: 'normal',
  status: 'active',
  confidence: 91,
  tags: ['research'],
  evidence: [],
  hasOriginalSource: false,
  createdAt: '2026-07-08T08:00:00.000Z',
  updatedAt: '2026-07-08T09:00:00.000Z',
};

function renderMemoryCenter() {
  return render(<MemoryCenterTab consumeDeepLinks={false} />);
}

beforeEach(() => {
  clearMemoryListCache();
  vi.clearAllMocks();
  mocks.adapter.listMemories.mockResolvedValue([memory]);
  mocks.adapter.patchMemory.mockResolvedValue(memory);
  mocks.adapter.archiveMemory.mockResolvedValue({ ...memory, status: 'archived' });
  mocks.adapter.deleteMemoryById.mockResolvedValue(undefined);
  mocks.adapter.mergeMemories.mockResolvedValue(memory);
  mocks.adapter.getMemoryOriginalSource.mockResolvedValue({ archiveRows: [] });
  mocks.adapter.eraseMemory.mockResolvedValue({
    erased: true,
    result: { framesDeleted: 1, archiveRedacted: 1, entitiesErased: 1 },
  });
  mocks.adapter.listSuppression.mockResolvedValue({
    mind: 'personal',
    suppressed: [{
      source: 'chatgpt',
      sourceRef: 'research-export.json',
      erasedAt: '2026-07-08T09:30:00.000Z',
      reason: 'GDPR Art.17 erasure',
    }],
  });
  mocks.adapter.allowReimport.mockResolvedValue({ removed: true });
});

afterEach(() => {
  cleanup();
  clearMemoryListCache();
  vi.restoreAllMocks();
});

describe('Memory Center trust flows', () => {
  it('a11y: filters and detail editor expose stable form metadata', async () => {
    renderMemoryCenter();

    const search = await screen.findByRole('textbox', { name: /search memories/i });
    expect(search).toHaveAttribute('name', 'memorySearch');
    expect(search).toHaveAttribute('autocomplete', 'off');
    expect(search.parentElement?.className).toContain('focus-within:ring-2');
    expect(search.parentElement?.className).toContain('focus-within:ring-[var(--focus-ring)]');

    const confidence = screen.getByRole('combobox', { name: /filter by confidence/i });
    expect(confidence).toHaveAttribute('name', 'memoryConfidenceFilter');
    expect(confidence).toHaveAttribute('autocomplete', 'off');
    expect(confidence.className).toContain('focus-visible:ring-2');
    expect(confidence.className).toContain('focus-visible:ring-[var(--focus-ring)]');

    for (const name of [/needs review/i, /active/i, /all kinds/i, /fact/i]) {
      expect(screen.getByRole('button', { name }).className).toContain('focus-visible:ring-2');
    }

    fireEvent.click(await screen.findByLabelText('Research Note'));

    const kind = await screen.findByLabelText('Kind');
    expect(kind).toHaveAttribute('name', 'memoryKind');
    expect(kind).toHaveAttribute('autocomplete', 'off');
    expect(kind.className).toContain('focus-visible:ring-2');
    expect(kind.className).toContain('focus-visible:ring-[var(--focus-ring)]');

    const content = screen.getByLabelText('Content');
    expect(content).toHaveAttribute('name', 'memoryContent');
    expect(content).toHaveAttribute('autocomplete', 'off');
    expect(content.className).toContain('focus-visible:ring-2');
    expect(content.className).toContain('focus-visible:ring-[var(--focus-ring)]');
  });

  it('asks in-app before permanently deleting a memory', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderMemoryCenter();

    fireEvent.click(await screen.findByLabelText('Research Note'));
    fireEvent.click(await screen.findByRole('button', { name: /^delete$/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mocks.adapter.deleteMemoryById).not.toHaveBeenCalled();

    const modal = await screen.findByTestId('approval-modal');
    expect(modal).toHaveTextContent(/delete memory permanently/i);
    expect(modal).toHaveTextContent(/research note/i);
    expect(modal).toHaveTextContent(/archive/i);

    fireEvent.click(screen.getByTestId('approval-modal-approve'));

    await waitFor(() => expect(mocks.adapter.deleteMemoryById).toHaveBeenCalledWith('memory-research-note', undefined, 'personal'));
  });

  it('asks in-app before erasing a memory and derived data', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderMemoryCenter();

    fireEvent.click(await screen.findByLabelText('Research Note'));
    fireEvent.click(await screen.findByRole('button', { name: /^erase$/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mocks.adapter.eraseMemory).not.toHaveBeenCalled();

    const modal = await screen.findByTestId('approval-modal');
    expect(modal).toHaveTextContent(/erase memory and derived data/i);
    expect(modal).toHaveTextContent(/research note/i);
    expect(modal).toHaveTextContent(/cannot be undone/i);
    expect(modal).toHaveTextContent(/original source/i);

    fireEvent.click(screen.getByTestId('approval-modal-approve'));

    await waitFor(() => expect(mocks.adapter.eraseMemory).toHaveBeenCalledWith(
      { frameId: 'memory-research-note' },
      { workspaceId: undefined, mind: 'personal' },
    ));
    await screen.findByText(/erased "research note"/i);
  });

  it('asks in-app before allowing an erased source to be re-imported', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderMemoryCenter();

    fireEvent.click(await screen.findByRole('button', { name: /erased sources/i }));
    await screen.findByText('research-export.json');
    fireEvent.click(await screen.findByRole('button', { name: /allow re-import/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mocks.adapter.allowReimport).not.toHaveBeenCalled();

    const modal = await screen.findByTestId('approval-modal');
    expect(modal).toHaveTextContent(/allow source to be re-imported/i);
    expect(modal).toHaveTextContent(/research-export\.json/i);
    expect(modal).toHaveTextContent(/re-consented/i);

    fireEvent.click(screen.getByTestId('approval-modal-approve'));

    await waitFor(() => expect(mocks.adapter.allowReimport).toHaveBeenCalledWith(
      { source: 'chatgpt', sourceRef: 'research-export.json' },
      { workspaceId: undefined, mind: 'personal' },
    ));
  });
});
