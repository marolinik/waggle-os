import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

const mocks = vi.hoisted(() => ({
  adapter: {
    getWikiPages: vi.fn(),
    getWikiPageContent: vi.fn(),
    compileWiki: vi.fn(),
    getWikiHealth: vi.fn(),
    exportWikiToObsidian: vi.fn(),
    exportWikiToNotion: vi.fn(),
  },
}));

vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter }));

import WikiTab, { type WikiPage } from '@/components/os/apps/memory/WikiTab';

const wikiPage: WikiPage = {
  slug: 'research-guide',
  pageType: 'entity',
  name: 'Research Guide',
  contentHash: 'hash-research-guide',
  markdown: '# Research Guide',
  frameIds: 'memory-1',
  compiledAt: '2026-07-08T09:00:00.000Z',
  sourceCount: 3,
};

function renderWikiTab() {
  return render(
    <TooltipProvider>
      <WikiTab />
    </TooltipProvider>,
  );
}

function exportButtons() {
  const buttons = screen.getAllByRole('button');
  return {
    obsidian: buttons[2],
    notion: buttons[3],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adapter.getWikiPages.mockResolvedValue([wikiPage]);
  mocks.adapter.getWikiPageContent.mockResolvedValue({ slug: wikiPage.slug, markdown: wikiPage.markdown });
  mocks.adapter.exportWikiToObsidian.mockResolvedValue({
    outDir: 'C:/Research Vault',
    filesWritten: 3,
    indexPath: 'C:/Research Vault/index.md',
    byType: { entity: 1, concept: 2 },
  });
  mocks.adapter.exportWikiToNotion.mockResolvedValue({
    pagesCreated: 1,
    pagesUpdated: 2,
    pagesUnchanged: 0,
    pagesFailed: 0,
    byType: { entity: 1 },
    errors: [],
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Wiki export trust flows', () => {
  it('a11y: search exposes stable metadata and an input-level token focus ring', async () => {
    renderWikiTab();

    await screen.findByText('Research Guide');

    const search = screen.getByRole('textbox', { name: /search wiki pages/i });
    expect(search).toHaveAttribute('name', 'wikiSearch');
    expect(search).toHaveAttribute('autocomplete', 'off');
    expect(search.className).toContain('focus-visible:ring-2');
    expect(search.className).toContain('focus-visible:ring-[var(--focus-ring)]');
  });

  it('asks for the Obsidian vault path in-app before exporting', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('C:/Research Vault');
    renderWikiTab();

    await screen.findByText('Research Guide');
    fireEvent.click(exportButtons().obsidian);

    expect(promptSpy).not.toHaveBeenCalled();
    expect(mocks.adapter.exportWikiToObsidian).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('alertdialog', { name: /export to obsidian/i });
    const pathInput = within(dialog).getByLabelText(/obsidian vault directory/i);
    expect(pathInput).toHaveAttribute('name', 'obsidianVaultDirectory');
    expect(pathInput).toHaveAttribute('autocomplete', 'off');
    expect(pathInput.className).toContain('focus-visible:ring-2');
    expect(pathInput.className).toContain('focus-visible:ring-[var(--focus-ring)]');
    fireEvent.change(pathInput, { target: { value: '  C:/Research Vault  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^export to obsidian$/i }));

    await waitFor(() => expect(mocks.adapter.exportWikiToObsidian).toHaveBeenCalledWith('C:/Research Vault'));
    await screen.findByText(/obsidian export complete/i);
  });

  it('asks for the Notion root page in-app before exporting', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('https://notion.so/root');
    renderWikiTab();

    await screen.findByText('Research Guide');
    fireEvent.click(exportButtons().notion);

    expect(promptSpy).not.toHaveBeenCalled();
    expect(mocks.adapter.exportWikiToNotion).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('alertdialog', { name: /export to notion/i });
    const urlInput = within(dialog).getByLabelText(/notion root page url/i);
    expect(urlInput).toHaveAttribute('name', 'notionRootPageUrl');
    expect(urlInput).toHaveAttribute('autocomplete', 'off');
    expect(urlInput.className).toContain('focus-visible:ring-2');
    expect(urlInput.className).toContain('focus-visible:ring-[var(--focus-ring)]');
    fireEvent.change(urlInput, { target: { value: '  https://notion.so/root  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^export to notion$/i }));

    await waitFor(() => expect(mocks.adapter.exportWikiToNotion).toHaveBeenCalledWith('https://notion.so/root'));
    await screen.findByText(/notion export complete/i);
  });
});
