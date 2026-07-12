import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import HarvestTab from './HarvestTab';

const mocks = vi.hoisted(() => ({
  adapter: {
    getHarvestSources: vi.fn(),
    scanClaudeCode: vi.fn(),
    getLatestInterruptedHarvestRun: vi.fn(),
    toggleHarvestAutoSync: vi.fn(),
    removeHarvestSource: vi.fn(),
    harvestPreview: vi.fn(),
    harvestCommit: vi.fn(),
    subscribeHarvestProgress: vi.fn(),
    extractHarvestIdentity: vi.fn(),
    resumeHarvestRun: vi.fn(),
    abandonHarvestRun: vi.fn(),
  },
}));

vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter }));

function renderHarvest() {
  return render(
    <TooltipProvider>
      <HarvestTab />
    </TooltipProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adapter.getHarvestSources.mockResolvedValue({
    sources: [{
      id: 1,
      source: 'claude-code',
      displayName: 'Claude Code',
      sourcePath: 'C:/Users/Marko/.claude/projects',
      lastSyncedAt: '2026-07-08T12:00:00.000Z',
      itemsImported: 4,
      framesCreated: 9,
      autoSync: true,
      syncIntervalHours: 24,
    }],
  });
  mocks.adapter.scanClaudeCode.mockResolvedValue({ found: false, itemCount: 0, path: '' });
  mocks.adapter.getLatestInterruptedHarvestRun.mockResolvedValue({ run: null });
  mocks.adapter.toggleHarvestAutoSync.mockResolvedValue({});
  mocks.adapter.removeHarvestSource.mockResolvedValue(undefined);
  mocks.adapter.subscribeHarvestProgress.mockReturnValue({ ready: Promise.resolve(), close: vi.fn() });
  mocks.adapter.extractHarvestIdentity.mockResolvedValue({ suggestions: [] });
});

afterEach(() => {
  cleanup();
});

describe('HarvestTab', () => {
  it('names harvest controls and exposes stable import metadata', async () => {
    renderHarvest();

    await screen.findByText('Connected Sources');

    const refresh = screen.getByRole('button', { name: /refresh harvest sources/i });
    expect(refresh.className).toContain('focus-visible:ring-2');
    expect(refresh.className).toContain('focus-visible:ring-[var(--focus-ring)]');

    for (const name of [/pause claude code auto-sync/i, /remove claude code harvest source/i]) {
      const action = screen.getByRole('button', { name });
      expect(action.className).toContain('focus-visible:ring-2');
      expect(action.className).toContain('focus-visible:ring-[var(--focus-ring)]');
    }

    const chatgpt = screen.getByRole('button', { name: 'ChatGPT' });
    expect(chatgpt).toHaveAttribute('aria-pressed', 'true');
    expect(chatgpt.className).toContain('focus-visible:ring-2');

    const uploadMode = screen.getByRole('button', { name: /upload json/i });
    expect(uploadMode).toHaveAttribute('aria-pressed', 'true');
    expect(uploadMode.className).toContain('focus-visible:ring-2');

    const fileInput = screen.getByLabelText(/harvest export file/i);
    expect(fileInput).toHaveAttribute('name', 'harvestFile');

    const pasteMode = screen.getByRole('button', { name: /paste \/ drop/i });
    fireEvent.click(pasteMode);

    expect(pasteMode).toHaveAttribute('aria-pressed', 'true');
    expect(pasteMode.className).toContain('focus-visible:ring-2');

    const paste = screen.getByRole('textbox', { name: /paste harvest content/i });
    expect(paste).toHaveAttribute('name', 'harvestPasteContent');
    expect(paste).toHaveAttribute('autocomplete', 'off');
    expect(paste.className).toContain('focus-visible:ring-2');
    expect(paste.className).toContain('focus-visible:ring-[var(--focus-ring)]');
  });
});
