import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OnboardingWizard from './OnboardingWizard';

const mocks = vi.hoisted(() => ({
  createWorkspace: vi.fn(),
  getWorkspaces: vi.fn(),
  updateProfile: vi.fn(),
  setIdentity: vi.fn(),
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
  ImportStep: () => null,
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
