import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OnboardingWizard from './OnboardingWizard';

const mocks = vi.hoisted(() => ({
  createWorkspace: vi.fn(),
  getWorkspaces: vi.fn(),
  updateProfile: vi.fn(),
  setIdentity: vi.fn(),
  harvestPreview: vi.fn(),
  harvestCommit: vi.fn(),
  trackTelemetry: vi.fn(),
  captureOnboardingComplete: vi.fn(),
}));

vi.mock('@/lib/adapter', () => ({
  adapter: {
    connect: vi.fn().mockResolvedValue(undefined),
    getProfile: vi.fn().mockResolvedValue({}),
    scanClaudeCode: vi.fn().mockResolvedValue({ found: false, itemCount: 0, path: '' }),
    createWorkspace: mocks.createWorkspace,
    getWorkspaces: mocks.getWorkspaces,
    updateProfile: mocks.updateProfile,
    setIdentity: mocks.setIdentity,
    harvestPreview: mocks.harvestPreview,
    harvestCommit: mocks.harvestCommit,
    trackTelemetry: mocks.trackTelemetry,
  },
}));

vi.mock('@/lib/posthog', () => ({
  captureOnboardingComplete: mocks.captureOnboardingComplete,
}));

vi.mock('@/hooks/useOfflineStatus', () => ({
  useOfflineStatus: () => false,
}));

vi.mock('./onboarding', () => ({
  WelcomeStep: () => null,
  WhoAreYouStep: ({
    onChange,
    onContinue,
    onContinueWithoutPersonalization,
    saving,
    saveError,
  }: {
    onChange: (patch: { name: string }) => void;
    onContinue: () => void;
    onContinueWithoutPersonalization: () => void;
    saving: boolean;
    saveError: string | null;
  }) => (
    <section aria-label="Who are you step">
      <button type="button" disabled={saving} onClick={onContinue}>
        {saveError ? 'Retry saving profile' : 'Save profile'}
      </button>
      <button type="button" disabled={saving} onClick={() => { onContinue(); onContinue(); }}>
        Submit profile twice
      </button>
      <button type="button" disabled={saving} onClick={() => onChange({ name: 'Profile B' })}>
        Change profile
      </button>
      {saveError && <p role="alert">{saveError}</p>}
      {saveError && (
        <button type="button" disabled={saving} onClick={onContinueWithoutPersonalization}>
          Continue without personalization
        </button>
      )}
    </section>
  ),
  ModelGateStep: () => <section aria-label="Model gate step" />,
  ImportStep: ({
    importSource,
    importDone,
    importing,
    importError,
    importSuccessMessage,
    onFileImport,
    onImportCommit,
    onClaudeCodeHarvest,
    onContinue,
  }: {
    importSource: string | null;
    importDone: boolean;
    importing: boolean;
    importError?: string | null;
    importSuccessMessage?: string | null;
    onFileImport: (file: File, source: string) => void;
    onImportCommit: () => void;
    onClaudeCodeHarvest: () => void;
    onContinue: () => void;
  }) => {
    const file = { text: vi.fn().mockResolvedValue('{"messages":[]}') } as unknown as File;
    return (
      <section aria-label="Import step">
        {!importSource && !importDone && (
          <>
            <button type="button" disabled={importing} onClick={() => onFileImport(file, 'chatgpt')}>
              Choose import file
            </button>
            <button type="button" disabled={importing} onClick={() => {
              onFileImport(file, 'chatgpt');
              onFileImport(file, 'chatgpt');
            }}>
              Preview twice
            </button>
          </>
        )}
        {importSource && !importDone && (
          <>
            <button type="button" disabled={importing} onClick={onImportCommit}>Import preview</button>
            <button type="button" disabled={importing} onClick={() => {
              onImportCommit();
              onImportCommit();
            }}>
              Import preview twice
            </button>
          </>
        )}
        <button type="button" disabled={importing} onClick={onClaudeCodeHarvest}>Import Claude history</button>
        <button type="button" disabled={importing} onClick={() => {
          onClaudeCodeHarvest();
          onClaudeCodeHarvest();
        }}>
          Import Claude twice
        </button>
        <button type="button" disabled={importing} onClick={onContinue}>Skip import</button>
        {importError && <p role="alert">{importError}</p>}
        {importDone && <p>{importSuccessMessage ?? 'Import complete'}</p>}
      </section>
    );
  },
  TemplateStep: ({
    onSelect,
    creating,
    createError,
  }: {
    onSelect: (templateId: string) => void;
    creating: boolean;
    createError: string | null;
  }) => (
    <section aria-label="Template step">
      <button type="button" disabled={creating} onClick={() => onSelect('blank')}>
        Blank Workspace
      </button>
      {createError && <p role="alert">{createError}</p>}
    </section>
  ),
  FirstTaskStep: ({ onLetsGo }: { onLetsGo: () => void }) => (
    <section aria-label="First task step">
      <button type="button" onClick={onLetsGo}>Let&apos;s go</button>
    </section>
  ),
}));

vi.mock('./onboarding/constants', () => ({
  CURATED_ONBOARDING_TEMPLATES: [{
    id: 'blank',
    name: 'Blank Workspace',
    hint: 'Start a task',
  }],
  TEMPLATE_PERSONA: { blank: 'general-purpose' },
  TEMPLATE_SUGGESTIONS: { blank: ['Start a task'] },
}));

vi.mock('./onboarding/recommend-template', () => ({
  recommendTemplateId: () => null,
}));

afterEach(() => cleanup());

describe('OnboardingWizard workspace creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkspaces.mockResolvedValue([]);
    mocks.updateProfile.mockResolvedValue(undefined);
    mocks.setIdentity.mockResolvedValue(undefined);
    mocks.harvestPreview.mockResolvedValue({ items: [{ id: 'memory-1', title: 'Decision', kind: 'fact', confidence: 0.9 }] });
    mocks.harvestCommit.mockResolvedValue({ saved: 1, itemCount: 1, couldNotVerify: 0 });
  });

  it('stays on profile after a failed save, then advances only after an explicit successful retry', async () => {
    mocks.updateProfile
      .mockRejectedValueOnce(new Error('profile unavailable'))
      .mockResolvedValueOnce(undefined);
    const onUpdate = vi.fn();

    render(
      <OnboardingWizard
        serverBaseUrl="http://127.0.0.1:3333"
        state={{ completed: false, step: 1 }}
        onUpdate={onUpdate}
        onComplete={vi.fn()}
        onDismiss={vi.fn()}
        onFinish={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't confirm your profile was saved/i);
    expect(screen.getByRole('region', { name: 'Who are you step' })).toBeInTheDocument();
    expect(mocks.setIdentity).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalledWith({ profileSeeded: true });
    expect(mocks.trackTelemetry.mock.calls.filter(([event]) => event === 'onboarding_profile_seeded')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Retry saving profile' }));
    expect(await screen.findByRole('region', { name: 'Model gate step' })).toBeInTheDocument();
    expect(mocks.updateProfile).toHaveBeenCalledTimes(2);
    expect(mocks.setIdentity).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalledWith({ profileSeeded: true });
    expect(mocks.trackTelemetry).toHaveBeenCalledWith(
      'onboarding_profile_seeded',
      { hasName: false, hasRole: false, goalCount: 0 },
    );
    expect(mocks.trackTelemetry.mock.calls.filter(([event]) => event === 'onboarding_profile_seeded')).toHaveLength(1);
    expect(mocks.trackTelemetry.mock.calls.filter(([event]) => event === 'onboarding_profile_skipped')).toHaveLength(0);
  });

  it('offers an explicit escape after profile failure without claiming personalization succeeded', async () => {
    mocks.updateProfile.mockRejectedValueOnce(new Error('profile unavailable'));
    const onUpdate = vi.fn();

    render(
      <OnboardingWizard
        serverBaseUrl="http://127.0.0.1:3333"
        state={{ completed: false, step: 1 }}
        onUpdate={onUpdate}
        onComplete={vi.fn()}
        onDismiss={vi.fn()}
        onFinish={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Continue without personalization' }));

    expect(await screen.findByRole('region', { name: 'Model gate step' })).toBeInTheDocument();
    expect(mocks.updateProfile).toHaveBeenCalledOnce();
    expect(mocks.setIdentity).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalledWith({ profileSeeded: true });
    expect(mocks.trackTelemetry.mock.calls.filter(([event]) => event === 'onboarding_profile_seeded')).toHaveLength(0);
    expect(mocks.trackTelemetry).toHaveBeenCalledWith(
      'onboarding_profile_skipped',
      { reason: 'save-failed' },
    );
    expect(mocks.trackTelemetry.mock.calls.filter(([event]) => event === 'onboarding_profile_skipped')).toHaveLength(1);
  });

  it('distinguishes a saved profile from failed identity personalization', async () => {
    mocks.setIdentity.mockRejectedValueOnce(new Error('identity unavailable'));
    const onUpdate = vi.fn();

    render(
      <OnboardingWizard
        serverBaseUrl="http://127.0.0.1:3333"
        state={{ completed: false, step: 1 }}
        onUpdate={onUpdate}
        onComplete={vi.fn()}
        onDismiss={vi.fn()}
        onFinish={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/profile was saved.*couldn't finish personalization/i);
    expect(screen.getByRole('region', { name: 'Who are you step' })).toBeInTheDocument();
    expect(mocks.updateProfile).toHaveBeenCalledOnce();
    expect(mocks.setIdentity).toHaveBeenCalledOnce();
    expect(onUpdate).not.toHaveBeenCalledWith({ profileSeeded: true });
    expect(mocks.trackTelemetry.mock.calls.filter(([event]) => event === 'onboarding_profile_seeded')).toHaveLength(0);
  });

  it('keeps acknowledging a confirmed profile save when a later retry cannot update it', async () => {
    mocks.setIdentity.mockRejectedValueOnce(new Error('identity unavailable'));

    render(
      <OnboardingWizard
        serverBaseUrl="http://127.0.0.1:3333"
        state={{ completed: false, step: 1 }}
        onUpdate={vi.fn()}
        onComplete={vi.fn()}
        onDismiss={vi.fn()}
        onFinish={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/profile was saved/i);

    mocks.updateProfile.mockRejectedValueOnce(new Error('profile temporarily unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Retry saving profile' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/profile was saved.*couldn't finish personalization/i);
    expect(mocks.updateProfile).toHaveBeenCalledTimes(2);
    expect(mocks.setIdentity).toHaveBeenCalledOnce();
  });

  it('does not claim edited profile values were saved when their retry fails', async () => {
    mocks.setIdentity.mockRejectedValueOnce(new Error('identity unavailable'));

    render(
      <OnboardingWizard
        serverBaseUrl="http://127.0.0.1:3333"
        state={{ completed: false, step: 1 }}
        onUpdate={vi.fn()}
        onComplete={vi.fn()}
        onDismiss={vi.fn()}
        onFinish={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/profile was saved/i);

    fireEvent.click(screen.getByRole('button', { name: 'Change profile' }));
    mocks.updateProfile.mockRejectedValueOnce(new Error('profile temporarily unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Retry saving profile' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/earlier profile is still saved.*couldn't confirm your latest changes/i);
    expect(screen.getByRole('alert')).not.toHaveTextContent(/^Your profile was saved/i);
    expect(mocks.updateProfile).toHaveBeenCalledTimes(2);
    expect(mocks.setIdentity).toHaveBeenCalledOnce();
  });

  it('locks wizard navigation while profile persistence is pending', async () => {
    let resolveProfile!: () => void;
    mocks.updateProfile.mockReturnValueOnce(new Promise<void>((resolve) => { resolveProfile = resolve; }));
    const onDismiss = vi.fn();

    render(
      <OnboardingWizard
        serverBaseUrl="http://127.0.0.1:3333"
        state={{ completed: false, step: 1 }}
        onUpdate={vi.fn()}
        onComplete={vi.fn()}
        onDismiss={onDismiss}
        onFinish={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Submit profile twice' }));
    expect(mocks.updateProfile).toHaveBeenCalledOnce();

    expect(screen.getByRole('button', { name: 'Go to previous step' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Skip setup' })).toBeDisabled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onDismiss).not.toHaveBeenCalled();
    await act(async () => { resolveProfile(); });
    expect(await screen.findByRole('region', { name: 'Model gate step' })).toBeInTheDocument();
  });

  it('keeps file preview failures visible and supports an explicit retry', async () => {
    mocks.harvestPreview.mockRejectedValueOnce(new Error('preview unavailable'));

    render(
      <OnboardingWizard
        serverBaseUrl="http://127.0.0.1:3333"
        state={{ completed: false, step: 3 }}
        onUpdate={vi.fn()}
        onComplete={vi.fn()}
        onDismiss={vi.fn()}
        onFinish={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Choose import file' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't read this export.*choose.*again.*skip/i);
    expect(screen.getByRole('region', { name: 'Import step' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Choose import file' }));
    await waitFor(() => expect(mocks.harvestPreview).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('makes an empty preview recoverable instead of hiding the file picker', async () => {
    mocks.harvestPreview.mockResolvedValueOnce({ items: [] });

    render(
      <OnboardingWizard
        serverBaseUrl="http://127.0.0.1:3333"
        state={{ completed: false, step: 3 }}
        onUpdate={vi.fn()}
        onComplete={vi.fn()}
        onDismiss={vi.fn()}
        onFinish={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Choose import file' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no importable memories.*choose another file.*skip/i);
    expect(screen.getByRole('button', { name: 'Choose import file' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Import preview' })).not.toBeInTheDocument();
  });

  it('single-owns a file commit, preserves its payload, and permits retry after failure', async () => {
    let rejectCommit!: (reason?: unknown) => void;
    mocks.harvestCommit.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectCommit = reject; }));

    render(
      <OnboardingWizard
        serverBaseUrl="http://127.0.0.1:3333"
        state={{ completed: false, step: 3 }}
        onUpdate={vi.fn()}
        onComplete={vi.fn()}
        onDismiss={vi.fn()}
        onFinish={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Choose import file' }));
    await waitFor(() => expect(mocks.harvestPreview).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Import preview twice' }));

    expect(mocks.harvestCommit).toHaveBeenCalledOnce();
    expect(mocks.harvestCommit).toHaveBeenNthCalledWith(1, { messages: [] }, 'chatgpt');
    await act(async () => rejectCommit(new Error('commit response lost')));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't confirm the import.*safe to try again.*skip/i);
    expect(screen.queryByText('Import complete')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Import preview' }));
    expect(await screen.findByText(/imported 1 memory item/i)).toBeInTheDocument();
    expect(mocks.harvestCommit).toHaveBeenCalledTimes(2);
    expect(mocks.harvestCommit).toHaveBeenNthCalledWith(2, { messages: [] }, 'chatgpt');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('single-owns Claude Code import and retries the exact local-scan request', async () => {
    let rejectCommit!: (reason?: unknown) => void;
    mocks.harvestCommit.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectCommit = reject; }));

    render(
      <OnboardingWizard
        serverBaseUrl="http://127.0.0.1:3333"
        state={{ completed: false, step: 3 }}
        onUpdate={vi.fn()}
        onComplete={vi.fn()}
        onDismiss={vi.fn()}
        onFinish={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Import Claude twice' }));
    expect(mocks.harvestCommit).toHaveBeenCalledOnce();
    expect(mocks.harvestCommit).toHaveBeenNthCalledWith(1, { scanLocal: true }, 'claude-code');
    await act(async () => rejectCommit(new Error('Claude import unavailable')));
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't confirm the Claude Code import.*safe to try again.*skip/i);

    fireEvent.click(screen.getByRole('button', { name: 'Import Claude history' }));
    expect(await screen.findByText(/imported 1 memory item/i)).toBeInTheDocument();
    expect(mocks.harvestCommit).toHaveBeenCalledTimes(2);
    expect(mocks.harvestCommit).toHaveBeenNthCalledWith(2, { scanLocal: true }, 'claude-code');
  });

  it('does not call a degraded partial commit complete', async () => {
    mocks.harvestCommit.mockResolvedValueOnce({ saved: 1, itemCount: 2, couldNotVerify: 1 });

    render(
      <OnboardingWizard
        serverBaseUrl="http://127.0.0.1:3333"
        state={{ completed: false, step: 3 }}
        onUpdate={vi.fn()}
        onComplete={vi.fn()}
        onDismiss={vi.fn()}
        onFinish={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Choose import file' }));
    await waitFor(() => expect(mocks.harvestPreview).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Import preview' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/imported 1.*1 item.*could not be verified.*skipped/i);
    expect(screen.queryByText(/^Imported 1 memory item\.$/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import preview' })).toBeEnabled();
  });

  it('does not claim an empty Claude scan imported memories', async () => {
    mocks.harvestCommit.mockResolvedValueOnce({ saved: 0, itemCount: 0 });

    render(
      <OnboardingWizard
        serverBaseUrl="http://127.0.0.1:3333"
        state={{ completed: false, step: 3 }}
        onUpdate={vi.fn()}
        onComplete={vi.fn()}
        onDismiss={vi.fn()}
        onFinish={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Import Claude history' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no importable memories.*try again later.*skip/i);
    expect(screen.queryByText(/memories imported|imported \d+ memory/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import Claude history' })).toBeEnabled();
  });

  it('treats a confirmed unchanged import as already up to date', async () => {
    mocks.harvestCommit.mockResolvedValueOnce({ saved: 0, itemCount: 1, skipped: true });

    render(
      <OnboardingWizard
        serverBaseUrl="http://127.0.0.1:3333"
        state={{ completed: false, step: 3 }}
        onUpdate={vi.fn()}
        onComplete={vi.fn()}
        onDismiss={vi.fn()}
        onFinish={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Choose import file' }));
    await waitFor(() => expect(mocks.harvestPreview).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Import preview' }));

    expect(await screen.findByText(/memory is already up to date/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('single-owns preview work and locks every escape route while it is pending', async () => {
    let resolvePreview!: (value: { items: unknown[] }) => void;
    mocks.harvestPreview.mockReturnValueOnce(new Promise((resolve) => { resolvePreview = resolve; }));
    const onDismiss = vi.fn();

    render(
      <OnboardingWizard
        serverBaseUrl="http://127.0.0.1:3333"
        state={{ completed: false, step: 3 }}
        onUpdate={vi.fn()}
        onComplete={vi.fn()}
        onDismiss={onDismiss}
        onFinish={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Preview twice' }));
    await waitFor(() => expect(mocks.harvestPreview).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: 'Go to previous step' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Skip setup' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Skip import' })).toBeDisabled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onDismiss).not.toHaveBeenCalled();

    await act(async () => resolvePreview({ items: [] }));
    expect(screen.getByRole('button', { name: 'Skip import' })).toBeEnabled();
  });

  it('stays on the template step and creates no phantom workspace when persistence fails', async () => {
    let resolveRetry!: (workspace: { id: string }) => void;
    const retry = new Promise<{ id: string }>((resolve) => { resolveRetry = resolve; });
    mocks.createWorkspace
      .mockRejectedValueOnce(new Error('service unavailable'))
      .mockReturnValueOnce(retry);
    const onUpdate = vi.fn();
    const onComplete = vi.fn();
    const onDismiss = vi.fn();
    const onFinish = vi.fn();

    render(
      <OnboardingWizard
        serverBaseUrl="http://127.0.0.1:3333"
        state={{ completed: false, step: 4 }}
        onUpdate={onUpdate}
        onComplete={onComplete}
        onDismiss={onDismiss}
        onFinish={onFinish}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Blank Workspace' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not create workspace/i);
    expect(screen.getByRole('button', { name: 'Blank Workspace' })).toBeEnabled();
    expect(screen.queryByRole('region', { name: 'First task step' })).not.toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ workspaceId: expect.anything() }));
    expect(onUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ step: 5 }));
    expect(onComplete).not.toHaveBeenCalled();
    expect(onFinish).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.createWorkspace).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Blank Workspace' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to previous step' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Skip setup' })).toBeDisabled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onDismiss).not.toHaveBeenCalled();
    await act(async () => { resolveRetry({ id: 'workspace-real' }); });
    expect(await screen.findByRole('region', { name: 'First task step' })).toBeInTheDocument();
    expect(mocks.createWorkspace).toHaveBeenCalledTimes(2);
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'workspace-real' }));
  });

  it.each(['local-legacy', 'deleted-workspace'])(
    'replaces a stale persisted workspace id (%s) with a server workspace',
    async (workspaceId) => {
      mocks.createWorkspace.mockResolvedValueOnce({ id: 'workspace-recreated' });
      const onUpdate = vi.fn();

      render(
        <OnboardingWizard
          serverBaseUrl="http://127.0.0.1:3333"
          state={{ completed: false, step: 4, workspaceId, templateId: 'blank' }}
          onUpdate={onUpdate}
          onComplete={vi.fn()}
          onDismiss={vi.fn()}
          onFinish={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Blank Workspace' }));

      expect(await screen.findByRole('region', { name: 'First task step' })).toBeInTheDocument();
      expect(mocks.createWorkspace).toHaveBeenCalledTimes(1);
      expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'workspace-recreated' }));
      if (!workspaceId.startsWith('local-')) {
        expect(mocks.getWorkspaces).toHaveBeenCalledTimes(1);
      }
    },
  );

  it.each([undefined, 'local-legacy', 'deleted-workspace'])(
    'cannot finish onboarding without a verified server workspace (%s)',
    async (workspaceId) => {
    const onUpdate = vi.fn();
    const onComplete = vi.fn();
    const onFinish = vi.fn();

    render(
        <OnboardingWizard
          serverBaseUrl="http://127.0.0.1:3333"
          state={{ completed: false, step: 5, workspaceId }}
        onUpdate={onUpdate}
        onComplete={onComplete}
        onDismiss={vi.fn()}
        onFinish={onFinish}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: "Let's go" }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/workspace/i);
    expect(screen.getByRole('button', { name: 'Blank Workspace' })).toBeEnabled();
    expect(onUpdate).toHaveBeenCalledWith({ workspaceId: undefined });
    expect(onComplete).not.toHaveBeenCalled();
    expect(onFinish).not.toHaveBeenCalled();
      if (workspaceId === 'deleted-workspace') {
        expect(mocks.getWorkspaces).toHaveBeenCalledTimes(1);
      }
    },
  );

  it('finishes with the exact workspace id only after server verification', async () => {
    let resolveVerification!: (workspaces: Array<{ id: string }>) => void;
    const verification = new Promise<Array<{ id: string }>>((resolve) => { resolveVerification = resolve; });
    mocks.getWorkspaces.mockReturnValueOnce(verification);
    const onComplete = vi.fn();
    const onDismiss = vi.fn();
    const onFinish = vi.fn();

    render(
      <OnboardingWizard
        serverBaseUrl="http://127.0.0.1:3333"
        state={{ completed: false, step: 5, workspaceId: 'workspace-real', personaId: 'coder' }}
        onUpdate={vi.fn()}
        onComplete={onComplete}
        onDismiss={onDismiss}
        onFinish={onFinish}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: "Let's go" }));
    fireEvent.click(screen.getByRole('button', { name: "Let's go" }));

    expect(screen.getByRole('button', { name: "Let's go" })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Go to previous step' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Skip setup' })).toBeDisabled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onDismiss).not.toHaveBeenCalled();
    expect(mocks.getWorkspaces).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();

    await act(async () => { resolveVerification([{ id: 'workspace-real' }]); });

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith('http://127.0.0.1:3333'));
    expect(onFinish).toHaveBeenCalledWith(
      'workspace-real',
      'My Workspace',
      expect.any(String),
      'coder',
    );
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
