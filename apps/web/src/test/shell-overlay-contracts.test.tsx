import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, cleanup, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotificationInbox from '@/components/os/overlays/NotificationInbox';
import CreateWorkspaceDialog from '@/components/os/overlays/CreateWorkspaceDialog';
import WorkspaceSwitcher from '@/components/os/overlays/WorkspaceSwitcher';
import PersonaSwitcher from '@/components/os/overlays/PersonaSwitcher';
import ContextRail from '@/components/os/overlays/ContextRail';
import OnboardingTooltips from '@/components/os/overlays/OnboardingTooltips';
import UpgradeModal from '@/components/os/overlays/UpgradeModal';
import TrialExpiredModal from '@/components/os/overlays/TrialExpiredModal';
import type { Notification, Workspace, WorkspaceTemplate } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  adapter: {
    getWorkspaceTemplates: vi.fn(),
    getConnectors: vi.fn(),
    getPersonas: vi.fn(),
    getAgentGroups: vi.fn(),
    deleteWorkspaceTemplate: vi.fn(),
    browseLocal: vi.fn(),
    browseLocalMkdir: vi.fn(),
  },
  fetchContextRailItems: vi.fn(),
  useWorkspaces: vi.fn(),
  useShell: vi.fn(),
}));

vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));
vi.mock('@/lib/context-rail-fetch', () => ({ fetchContextRailItems: mocks.fetchContextRailItems }));
vi.mock('@/hooks/useWorkspaces', () => ({ useWorkspaces: mocks.useWorkspaces }));
vi.mock('@/providers/ShellContext', () => ({ useShell: mocks.useShell }));

const customTemplate: WorkspaceTemplate = {
  id: 'custom-retention',
  name: 'Retention Sprint',
  description: 'Customer retention workspace',
  category: 'sales',
  persona: 'analyst',
  connectors: [],
  suggestedCommands: [],
  starterMemory: [],
  builtIn: false,
};

const switcherWorkspace: Workspace = {
  id: 'alpha',
  name: 'Alpha Workspace',
  group: 'Engineering',
  status: 'active',
  updatedAt: '2026-07-09T00:00:00Z',
};

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <TooltipProvider>
        {ui}
      </TooltipProvider>
    </MemoryRouter>,
  );
}

function WorkspaceSwitcherHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open workspace switcher</button>
      {open && (
        <WorkspaceSwitcher
          open
          onClose={() => setOpen(false)}
          workspaces={[switcherWorkspace]}
          activeWorkspaceId="alpha"
          onSelect={vi.fn()}
          onCreateNew={vi.fn()}
        />
      )}
      <button type="button">Behind shell control</button>
    </>
  );
}

describe('Shell overlay contracts', () => {
  beforeEach(() => {
    mocks.useWorkspaces.mockReturnValue({ workspaces: [] });
    mocks.useShell.mockReturnValue({ billingTier: 'FREE' });
    mocks.adapter.getWorkspaceTemplates.mockResolvedValue({ templates: [] });
    mocks.adapter.getConnectors.mockResolvedValue([]);
    mocks.adapter.getPersonas.mockResolvedValue([]);
    mocks.adapter.getAgentGroups.mockResolvedValue([]);
    mocks.adapter.deleteWorkspaceTemplate.mockResolvedValue(undefined);
    mocks.adapter.browseLocal.mockResolvedValue({ entries: [], current: '/' });
    mocks.adapter.browseLocalMkdir.mockResolvedValue({ name: 'Drafts', path: '/Drafts', type: 'directory' });
    mocks.fetchContextRailItems.mockResolvedValue([]);
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('Notification Inbox is a named dismissible dialog with named icon actions', () => {
    const onClose = vi.fn();
    const onMarkAllRead = vi.fn();
    const notifications: Notification[] = [{
      id: 'n1',
      type: 'message',
      title: 'Agent finished',
      body: 'Review the draft',
      timestamp: new Date().toISOString(),
      read: false,
    }];

    renderWithProviders(
      <NotificationInbox
        open
        onClose={onClose}
        notifications={notifications}
        onMarkRead={vi.fn()}
        onMarkAllRead={onMarkAllRead}
      />,
    );

    expect(screen.getByRole('dialog', { name: /notifications/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /mark all notifications as read/i }));
    expect(onMarkAllRead).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByRole('dialog', { name: /notifications/i }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /close notifications/i })).toBeInTheDocument();
  });

  it('Create Workspace opens as a named dialog and closes on Escape', async () => {
    const onClose = vi.fn();

    renderWithProviders(<CreateWorkspaceDialog open onClose={onClose} onCreate={vi.fn()} />);
    await waitFor(() => expect(mocks.adapter.getWorkspaceTemplates).toHaveBeenCalled());

    const dialog = screen.getByRole('dialog', { name: /create workspace/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close create workspace/i })).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Create Workspace asks in-app before deleting a custom template', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    mocks.adapter.getWorkspaceTemplates.mockResolvedValue({ templates: [customTemplate] });

    renderWithProviders(<CreateWorkspaceDialog open onClose={vi.fn()} onCreate={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /start from template/i }));
    await screen.findByText('Retention');
    fireEvent.click(screen.getByRole('button', { name: /select template retention sprint/i }));
    fireEvent.click(screen.getByRole('button', { name: /delete selected template retention sprint/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    const confirmDialog = screen.getByRole('dialog', { name: /delete template/i });
    expect(confirmDialog).toBeInTheDocument();
    expect(within(confirmDialog).getByText(/Retention Sprint/)).toBeInTheDocument();

    fireEvent.click(within(confirmDialog).getByRole('button', { name: /delete template/i }));

    await waitFor(() => expect(mocks.adapter.deleteWorkspaceTemplate).toHaveBeenCalledWith('custom-retention'));
  });

  it('Create Workspace prioritizes the primary setup before optional templates', async () => {
    renderWithProviders(<CreateWorkspaceDialog open onClose={vi.fn()} onCreate={vi.fn()} />);
    await waitFor(() => expect(mocks.adapter.getWorkspaceTemplates).toHaveBeenCalled());

    const dialog = screen.getByRole('dialog', { name: /create workspace/i });
    const nameInput = within(dialog).getByRole('textbox', { name: /what project or area/i });
    const startFromTemplate = within(dialog).getByRole('button', { name: /start from template/i });

    expect(nameInput).toBeInTheDocument();
    expect(nameInput.compareDocumentPosition(startFromTemplate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(dialog).queryByPlaceholderText(/search templates/i)).not.toBeInTheDocument();

    fireEvent.click(startFromTemplate);
    expect(within(dialog).getByPlaceholderText(/search templates/i)).toBeInTheDocument();

    const chooseAgent = within(dialog).getByRole('button', { name: /choose an agent/i });
    expect(chooseAgent).toHaveAttribute('aria-expanded', 'false');
    expect(within(dialog).queryByText('Agent (optional)', { exact: true })).not.toBeInTheDocument();

    fireEvent.click(chooseAgent);
    expect(chooseAgent).toHaveAttribute('aria-expanded', 'true');
    expect(within(dialog).getByText('Agent (optional)', { exact: true })).toBeInTheDocument();
  });

  it('Create Workspace resets optional disclosures after a cancelled attempt', async () => {
    const props = { onClose: vi.fn(), onCreate: vi.fn() };
    const view = renderWithProviders(<CreateWorkspaceDialog open {...props} />);
    await waitFor(() => expect(mocks.adapter.getWorkspaceTemplates).toHaveBeenCalled());

    const dialog = screen.getByRole('dialog', { name: /create workspace/i });
    const chooseAgent = within(dialog).getByRole('button', { name: /choose an agent/i });
    fireEvent.click(chooseAgent);
    expect(chooseAgent).toHaveAttribute('aria-expanded', 'true');

    view.rerender(<CreateWorkspaceDialog open={false} {...props} />);
    view.rerender(<CreateWorkspaceDialog open {...props} />);

    const reopened = screen.getByRole('dialog', { name: /create workspace/i });
    expect(within(reopened).getByRole('button', { name: /choose an agent/i })).toHaveAttribute('aria-expanded', 'false');
    expect(within(reopened).queryByText('Agent (optional)', { exact: true })).not.toBeInTheDocument();
  });

  it('Create Workspace visible setup fields expose stable form metadata and focus rings', async () => {
    renderWithProviders(<CreateWorkspaceDialog open onClose={vi.fn()} onCreate={vi.fn()} />);
    await waitFor(() => expect(mocks.adapter.getWorkspaceTemplates).toHaveBeenCalled());

    const dialog = screen.getByRole('dialog', { name: /create workspace/i });
    const workspaceName = within(dialog).getByRole('textbox', { name: /what project or area/i });
    expect(workspaceName).toHaveAttribute('name', 'workspaceName');
    expect(workspaceName).toHaveAttribute('autocomplete', 'off');
    expect(workspaceName.className).toContain('focus-visible:ring-2');

    fireEvent.click(within(dialog).getByRole('button', { name: /local/i }));
    const storagePath = within(dialog).getByRole('textbox', { name: /local directory path/i });
    expect(storagePath).toHaveAttribute('name', 'workspaceStoragePath');
    expect(storagePath).toHaveAttribute('autocomplete', 'off');
    expect(storagePath.className).toContain('focus-visible:ring-2');

    fireEvent.click(within(dialog).getByRole('button', { name: /start from template/i }));
    const templateSearch = within(dialog).getByRole('textbox', { name: /search workspace templates/i });
    expect(templateSearch).toHaveAttribute('name', 'workspaceTemplateSearch');
    expect(templateSearch).toHaveAttribute('autocomplete', 'off');
    expect(templateSearch.className).toContain('focus-visible:ring-2');
  });

  it('Create Workspace scoped controls avoid broad transition-all animations', async () => {
    mocks.adapter.getWorkspaceTemplates.mockResolvedValue({ templates: [customTemplate] });
    mocks.adapter.getAgentGroups.mockResolvedValue([{
      id: 'group-1',
      name: 'Launch Squad',
      strategy: 'parallel',
      memberCount: 2,
      members: [],
    }]);

    renderWithProviders(<CreateWorkspaceDialog open onClose={vi.fn()} onCreate={vi.fn()} />);
    await waitFor(() => expect(mocks.adapter.getWorkspaceTemplates).toHaveBeenCalled());

    const dialog = screen.getByRole('dialog', { name: /create workspace/i });
    fireEvent.click(within(dialog).getByRole('button', { name: /start from template/i }));
    await within(dialog).findByRole('button', { name: /select template retention sprint/i });
    fireEvent.click(within(dialog).getByRole('button', { name: /choose an agent/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: /^agent group$/i }));

    expect(dialog.innerHTML).not.toContain('transition-all');

    fireEvent.click(within(dialog).getByRole('button', { name: /new template/i }));
    const templateDialog = await screen.findByRole('dialog', { name: /create template/i });
    expect(templateDialog.innerHTML).not.toContain('transition-all');
  });

  it('Create Workspace subdialogs are named and dismissible', async () => {
    const onClose = vi.fn();
    renderWithProviders(<CreateWorkspaceDialog open onClose={onClose} onCreate={vi.fn()} />);
    await waitFor(() => expect(mocks.adapter.getWorkspaceTemplates).toHaveBeenCalled());

    const dialog = screen.getByRole('dialog', { name: /create workspace/i });
    fireEvent.click(within(dialog).getByRole('button', { name: /local/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: /browse local folders/i }));

    const folderDialog = await screen.findByRole('dialog', { name: /browse folders/i });
    expect(within(folderDialog).getByRole('button', { name: /close folder picker/i })).toBeInTheDocument();
    fireEvent.keyDown(folderDialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /browse folders/i })).not.toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: /start from template/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: /new template/i }));

    const templateDialog = await screen.findByRole('dialog', { name: /create template/i });
    expect(within(templateDialog).getByRole('button', { name: /close template creator/i })).toBeInTheDocument();
    fireEvent.keyDown(templateDialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /create template/i })).not.toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Create Workspace template textareas are named and visibly focusable', async () => {
    renderWithProviders(<CreateWorkspaceDialog open onClose={vi.fn()} onCreate={vi.fn()} />);
    await waitFor(() => expect(mocks.adapter.getWorkspaceTemplates).toHaveBeenCalled());

    const dialog = screen.getByRole('dialog', { name: /create workspace/i });
    fireEvent.click(within(dialog).getByRole('button', { name: /start from template/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: /new template/i }));

    const templateDialog = await screen.findByRole('dialog', { name: /create template/i });
    const description = within(templateDialog).getByRole('textbox', { name: /^description$/i });
    const starterMemory = within(templateDialog).getByRole('textbox', { name: /^starter memory$/i });

    expect(description).toHaveAttribute('name', 'template-description');
    expect(description).toHaveAttribute('autocomplete', 'off');
    expect(description.className).toContain('focus-visible:ring-2');
    expect(description.className).toContain('focus-visible:ring-[var(--focus-ring)]');

    expect(starterMemory).toHaveAttribute('name', 'template-starter-memory');
    expect(starterMemory).toHaveAttribute('autocomplete', 'off');
    expect(starterMemory.className).toContain('focus-visible:ring-2');
    expect(starterMemory.className).toContain('focus-visible:ring-[var(--focus-ring)]');
  });

  it('Create Workspace template creator and folder picker fields expose stable form metadata', async () => {
    renderWithProviders(<CreateWorkspaceDialog open onClose={vi.fn()} onCreate={vi.fn()} />);
    await waitFor(() => expect(mocks.adapter.getWorkspaceTemplates).toHaveBeenCalled());

    const dialog = screen.getByRole('dialog', { name: /create workspace/i });
    fireEvent.click(within(dialog).getByRole('button', { name: /start from template/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: /new template/i }));

    const templateDialog = await screen.findByRole('dialog', { name: /create template/i });
    const aiPrompt = within(templateDialog).getByRole('textbox', { name: /describe workspace template/i });
    expect(aiPrompt).toHaveAttribute('name', 'templateAiPrompt');
    expect(aiPrompt).toHaveAttribute('autocomplete', 'off');
    expect(aiPrompt.className).toContain('focus-visible:ring-2');

    const templateName = within(templateDialog).getByRole('textbox', { name: /^template name$/i });
    expect(templateName).toHaveAttribute('name', 'templateName');
    expect(templateName).toHaveAttribute('autocomplete', 'off');
    expect(templateName.className).toContain('focus-visible:ring-2');

    fireEvent.keyDown(templateDialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /create template/i })).not.toBeInTheDocument());

    fireEvent.click(within(dialog).getByRole('button', { name: /local/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: /browse local folders/i }));

    const folderDialog = await screen.findByRole('dialog', { name: /browse folders/i });
    fireEvent.click(within(folderDialog).getByRole('button', { name: /new folder/i }));
    const newFolderName = within(folderDialog).getByRole('textbox', { name: /new folder name/i });
    expect(newFolderName).toHaveAttribute('name', 'newFolderName');
    expect(newFolderName).toHaveAttribute('autocomplete', 'off');
    expect(newFolderName.className).toContain('focus-visible:ring-2');
  });

  it('Workspace Switcher moves focus in, traps Tab, and restores focus on Escape', async () => {
    renderWithProviders(<WorkspaceSwitcherHarness />);

    const trigger = screen.getByRole('button', { name: /open workspace switcher/i });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: /switch workspace/i });
    await waitFor(() => expect(document.activeElement).toBe(dialog));
    expect(dialog.innerHTML).not.toContain('transition-all');

    const buttons = within(dialog).getAllByRole('button');
    const firstButton = buttons[0];
    const lastButton = buttons[buttons.length - 1];
    lastButton.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(firstButton);

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /switch workspace/i })).not.toBeInTheDocument());
    expect(document.activeElement).toBe(trigger);
  });

  it('Persona Switcher scoped cards avoid broad transition-all animations', async () => {
    mocks.adapter.getPersonas.mockResolvedValue([{
      id: 'general-purpose',
      name: 'General Purpose',
      description: 'General workspace agent',
    }]);
    mocks.adapter.getAgentGroups.mockResolvedValue([{
      id: 'group-1',
      name: 'Launch Squad',
      description: 'Go-to-market group',
      strategy: 'parallel',
      members: [{ agentId: 'agent-1' }],
    }]);

    renderWithProviders(
      <PersonaSwitcher
        open
        onClose={vi.fn()}
        currentPersona="general-purpose"
        currentGroupId="group-1"
        onSelect={vi.fn()}
        onSelectGroup={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole('dialog', { name: /switch agent/i });
    const personaCard = await within(dialog).findByRole('button', { name: /general purpose/i });
    expect(personaCard.className).not.toContain('transition-all');
    expect(personaCard.className).toContain('transition-colors');

    fireEvent.click(within(dialog).getByRole('button', { name: /groups/i }));
    const groupCard = await within(dialog).findByRole('button', { name: /launch squad/i });
    expect(groupCard.className).not.toContain('transition-all');
    expect(groupCard.className).toContain('transition-colors');
    expect(dialog.innerHTML).not.toContain('transition-all');
  });

  it('Context Rail is a labelled complementary panel with a named close action', async () => {
    const onClose = vi.fn();
    mocks.fetchContextRailItems.mockResolvedValue([{
      id: 'frame-1',
      kind: 'memory',
      title: 'Launch checklist',
      content: 'Ship the revised onboarding checklist.',
      importance: 'important',
    }]);

    renderWithProviders(
      <ContextRail
        target={{ type: 'message', id: 'm1', label: 'Launch plan' }}
        onClose={onClose}
      />,
    );

    const panel = await screen.findByRole('complementary', { name: /related context for launch plan/i });
    expect(panel).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('button', { name: /close related context/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Onboarding tooltips expose a named non-modal dialog and dismiss on Escape', () => {
    const onDismiss = vi.fn();

    renderWithProviders(<OnboardingTooltips onDismiss={onDismiss} />);

    const dialog = screen.getByRole('dialog', { name: /waggle tips/i });
    expect(dialog).toHaveAttribute('aria-modal', 'false');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('waggle:tooltips_done')).toBe('true');
  });

  it('Tier interruption modals have named close controls', async () => {
    renderWithProviders(<UpgradeModal />);

    act(() => {
      window.dispatchEvent(new CustomEvent('waggle:tier-insufficient', {
        detail: {
          required: 'TEAMS',
          actual: 'FREE',
          message: 'Team workspaces require a Team plan.',
        },
      }));
    });

    const upgradeDialog = await screen.findByRole('dialog', { name: /upgrade to unlock/i });
    expect(within(upgradeDialog).getByRole('button', { name: /close upgrade dialog/i })).toBeInTheDocument();

    cleanup();
    renderWithProviders(
      <TrialExpiredModal open onDismiss={vi.fn()} onUpgrade={vi.fn()} />,
    );

    const trialDialog = screen.getByRole('dialog', { name: /trial has ended/i });
    expect(within(trialDialog).getByRole('button', { name: /close trial expired dialog/i })).toBeInTheDocument();
  });
});
