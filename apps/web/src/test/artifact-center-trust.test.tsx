import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Artifact, RelatedSearchResult } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  adapter: {
    listArtifacts: vi.fn(),
    searchRelatedArtifacts: vi.fn(),
    deleteArtifact: vi.fn(),
    archiveArtifact: vi.fn(),
    patchArtifact: vi.fn(),
    createArtifact: vi.fn(),
    downloadFile: vi.fn(),
  },
}));

vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter }));

import ArtifactCenterApp, { resetArtifactRouteCache } from '@/components/os/apps/ArtifactCenterApp';

const artifact: Artifact = {
  id: 'artifact-brief',
  title: 'Quarterly Research Brief',
  kind: 'document',
  workspaceId: 'workspace-research',
  createdBy: 'agent-researcher',
  source: 'agent',
  status: 'ready',
  storagePath: '/artifacts/quarterly-brief.md',
  tags: ['research'],
  createdAt: '2026-07-08T08:00:00.000Z',
  updatedAt: '2026-07-08T09:00:00.000Z',
};

const emptyRelated: RelatedSearchResult = {
  memories: [],
  sessions: [],
  tasks: [],
  agents: [],
  artifacts: [],
};

function renderArtifactCenter() {
  return render(
    <MemoryRouter>
      <ArtifactCenterApp activeWorkspaceId="workspace-research" workspaceName="Research" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  resetArtifactRouteCache();
  mocks.adapter.listArtifacts.mockResolvedValue([artifact]);
  mocks.adapter.searchRelatedArtifacts.mockResolvedValue(emptyRelated);
  mocks.adapter.deleteArtifact.mockResolvedValue(undefined);
  mocks.adapter.downloadFile.mockResolvedValue(new Blob(['artifact']));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('repaints the keyed artifact list on return and refreshes silently', async () => {
  const first = renderArtifactCenter();
  expect(await screen.findByText('Quarterly Research Brief')).toBeInTheDocument();
  const baseline = mocks.adapter.listArtifacts.mock.calls.length;
  first.unmount();

  renderArtifactCenter();
  expect(screen.getByText('Quarterly Research Brief')).toBeInTheDocument();
  await waitFor(() => expect(mocks.adapter.listArtifacts.mock.calls.length).toBeGreaterThan(baseline));
});

describe('Artifact Center trust flows', () => {
  it('a11y: search and create controls expose stable form metadata', () => {
    renderArtifactCenter();

    const search = screen.getByRole('textbox', { name: 'Search artifacts' });
    expect(search).toHaveAttribute('name', 'artifactSearch');
    expect(search).toHaveAttribute('autocomplete', 'off');

    const title = screen.getByRole('textbox', { name: 'New artifact title' });
    expect(title).toHaveAttribute('name', 'artifactTitle');
    expect(title).toHaveAttribute('autocomplete', 'off');

    const kind = screen.getByRole('combobox', { name: 'New artifact kind' });
    expect(kind).toHaveAttribute('name', 'artifactKind');
    expect(kind).toHaveAttribute('autocomplete', 'off');
  });

  it('scopes artifact card hover transitions to explicit properties', async () => {
    renderArtifactCenter();

    const card = await screen.findByRole('button', { name: /quarterly research brief/i });
    expect(card.className).not.toContain('transition-all');
    expect(card.className).toContain('transition-[border-color,transform]');
  });

  it('a11y: detail editor controls expose stable form metadata', async () => {
    renderArtifactCenter();

    fireEvent.click(await screen.findByRole('button', { name: /quarterly research brief/i }));

    const title = await screen.findByLabelText('Title');
    expect(title).toHaveAttribute('name', 'artifactDraftTitle');
    expect(title).toHaveAttribute('autocomplete', 'off');

    const kind = screen.getByLabelText('Kind');
    expect(kind).toHaveAttribute('name', 'artifactDraftKind');
    expect(kind).toHaveAttribute('autocomplete', 'off');
    expect(kind.className).toContain('focus-visible:ring-2');
  });

  it('asks in-app before permanently deleting an artifact', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderArtifactCenter();

    fireEvent.click(await screen.findByRole('button', { name: /quarterly research brief/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^delete$/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mocks.adapter.deleteArtifact).not.toHaveBeenCalled();

    const modal = await screen.findByTestId('approval-modal');
    expect(modal).toHaveTextContent(/delete artifact permanently/i);
    expect(modal).toHaveTextContent(/quarterly research brief/i);
    expect(modal).toHaveTextContent(/backing file/i);

    fireEvent.click(screen.getByTestId('approval-modal-approve'));

    await waitFor(() => expect(mocks.adapter.deleteArtifact).toHaveBeenCalledWith('artifact-brief', 'workspace-research'));
  });

  it('lets users download a generated artifact from its Library detail', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:artifact'),
      revokeObjectURL: vi.fn(),
    });
    renderArtifactCenter();

    fireEvent.click(await screen.findByRole('button', { name: /quarterly research brief/i }));
    fireEvent.click(await screen.findByRole('button', { name: /download file/i }));

    await waitFor(() => expect(mocks.adapter.downloadFile).toHaveBeenCalledWith(
      'workspace-research',
      '/artifacts/quarterly-brief.md',
    ));
    expect(click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:artifact');
  });
});
