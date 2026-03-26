/**
 * Onboarding component tests.
 *
 * Tests utility/logic functions and exports only — no jsdom/React Testing Library.
 * React component rendering is tested in the desktop app's E2E suite.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  validateName,
  getProviderSignupUrl,
  ONBOARDING_STEPS,
  isStepComplete,
  getNextStep,
  getPrevStep,
  buildConfigFromOnboarding,
  useOnboardingSetup,
} from '../../src/index.js';
import type { OnboardingData } from '../../src/index.js';

// ── Test helpers ────────────────────────────────────────────────────

function makeOnboardingData(overrides: Partial<OnboardingData> = {}): OnboardingData {
  return {
    name: '',
    providers: {},
    workspaceName: '',
    workspaceGroup: 'Work',
    ...overrides,
  };
}

// ── validateName ────────────────────────────────────────────────────

describe('validateName', () => {
  it('returns invalid for empty string', () => {
    const result = validateName('');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns invalid for whitespace-only string', () => {
    const result = validateName('   ');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns valid for a normal name', () => {
    const result = validateName('Marko');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns valid for single character', () => {
    const result = validateName('M');
    expect(result.valid).toBe(true);
  });

  it('returns invalid for name over 50 characters', () => {
    const result = validateName('A'.repeat(51));
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns valid for name at exactly 50 characters', () => {
    const result = validateName('A'.repeat(50));
    expect(result.valid).toBe(true);
  });

  it('trims leading/trailing whitespace before validating', () => {
    const result = validateName('  Marko  ');
    expect(result.valid).toBe(true);
  });
});

// ── getProviderSignupUrl ────────────────────────────────────────────

describe('getProviderSignupUrl', () => {
  it('returns Anthropic console URL', () => {
    const url = getProviderSignupUrl('anthropic');
    expect(url).toContain('anthropic');
    expect(url).toMatch(/^https:\/\//);
  });

  it('returns OpenAI platform URL', () => {
    const url = getProviderSignupUrl('openai');
    expect(url).toContain('openai');
    expect(url).toMatch(/^https:\/\//);
  });

  it('returns Google AI Studio URL', () => {
    const url = getProviderSignupUrl('google');
    expect(url).toContain('google');
    expect(url).toMatch(/^https:\/\//);
  });

  it('returns a fallback URL for unknown providers', () => {
    const url = getProviderSignupUrl('unknown-provider');
    expect(url).toMatch(/^https:\/\//);
  });

  it('is case-insensitive', () => {
    const url1 = getProviderSignupUrl('Anthropic');
    const url2 = getProviderSignupUrl('anthropic');
    expect(url1).toBe(url2);
  });
});

// ── ONBOARDING_STEPS ────────────────────────────────────────────────

describe('ONBOARDING_STEPS', () => {
  it('has exactly 4 steps', () => {
    expect(ONBOARDING_STEPS).toHaveLength(4);
  });

  it('steps have id, title, and description', () => {
    for (const step of ONBOARDING_STEPS) {
      expect(step.id).toBeDefined();
      expect(typeof step.id).toBe('string');
      expect(step.title).toBeDefined();
      expect(typeof step.title).toBe('string');
      expect(step.description).toBeDefined();
      expect(typeof step.description).toBe('string');
    }
  });

  it('has unique step ids', () => {
    const ids = ONBOARDING_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('contains expected step ids', () => {
    const ids = ONBOARDING_STEPS.map((s) => s.id);
    expect(ids).toContain('name');
    expect(ids).toContain('apiKey');
    expect(ids).toContain('workspace');
    expect(ids).toContain('ready');
  });
});

// ── isStepComplete ──────────────────────────────────────────────────

describe('isStepComplete', () => {
  it('name step is incomplete when name is empty', () => {
    expect(isStepComplete('name', makeOnboardingData())).toBe(false);
  });

  it('name step is complete when name is provided', () => {
    expect(isStepComplete('name', makeOnboardingData({ name: 'Marko' }))).toBe(true);
  });

  it('name step is incomplete when name is whitespace only', () => {
    expect(isStepComplete('name', makeOnboardingData({ name: '   ' }))).toBe(false);
  });

  it('apiKey step is incomplete when no providers', () => {
    expect(isStepComplete('apiKey', makeOnboardingData())).toBe(false);
  });

  it('apiKey step is incomplete when provider key is invalid', () => {
    const data = makeOnboardingData({
      providers: { anthropic: { apiKey: 'sk-test', valid: false } },
    });
    expect(isStepComplete('apiKey', data)).toBe(false);
  });

  it('apiKey step is complete when at least one provider is valid', () => {
    const data = makeOnboardingData({
      providers: { anthropic: { apiKey: 'sk-test', valid: true } },
    });
    expect(isStepComplete('apiKey', data)).toBe(true);
  });

  it('apiKey step is complete when one of multiple providers is valid', () => {
    const data = makeOnboardingData({
      providers: {
        anthropic: { apiKey: 'sk-test', valid: false },
        openai: { apiKey: 'sk-test2', valid: true },
      },
    });
    expect(isStepComplete('apiKey', data)).toBe(true);
  });

  it('workspace step is incomplete when workspace name is empty', () => {
    expect(isStepComplete('workspace', makeOnboardingData())).toBe(false);
  });

  it('workspace step is complete when workspace name is provided', () => {
    expect(isStepComplete('workspace', makeOnboardingData({ workspaceName: 'Marketing' }))).toBe(true);
  });

  it('ready step is always complete', () => {
    expect(isStepComplete('ready', makeOnboardingData())).toBe(true);
  });

  it('returns false for unknown step', () => {
    expect(isStepComplete('nonexistent', makeOnboardingData())).toBe(false);
  });
});

// ── getNextStep ─────────────────────────────────────────────────────

describe('getNextStep', () => {
  it('returns apiKey after name', () => {
    expect(getNextStep('name')).toBe('apiKey');
  });

  it('returns workspace after apiKey', () => {
    expect(getNextStep('apiKey')).toBe('workspace');
  });

  it('returns ready after workspace', () => {
    expect(getNextStep('workspace')).toBe('ready');
  });

  it('returns null after ready (last step)', () => {
    expect(getNextStep('ready')).toBeNull();
  });

  it('returns null for unknown step', () => {
    expect(getNextStep('nonexistent')).toBeNull();
  });
});

// ── getPrevStep ─────────────────────────────────────────────────────

describe('getPrevStep', () => {
  it('returns null before name (first step)', () => {
    expect(getPrevStep('name')).toBeNull();
  });

  it('returns name before apiKey', () => {
    expect(getPrevStep('apiKey')).toBe('name');
  });

  it('returns apiKey before workspace', () => {
    expect(getPrevStep('workspace')).toBe('apiKey');
  });

  it('returns workspace before ready', () => {
    expect(getPrevStep('ready')).toBe('workspace');
  });

  it('returns null for unknown step', () => {
    expect(getPrevStep('nonexistent')).toBeNull();
  });
});

// ── buildConfigFromOnboarding ──────────────────────────────────────

describe('buildConfigFromOnboarding', () => {
  it('includes only valid providers', () => {
    const data = makeOnboardingData({
      providers: {
        anthropic: { apiKey: 'sk-ant-123', valid: true },
        openai: { apiKey: 'sk-bad', valid: false },
      },
    });
    const config = buildConfigFromOnboarding(data);
    expect(Object.keys(config.providers)).toEqual(['anthropic']);
    expect(config.providers.anthropic).toEqual({ apiKey: 'sk-ant-123', models: [] });
  });

  it('returns empty providers when none are valid', () => {
    const data = makeOnboardingData({
      providers: {
        anthropic: { apiKey: 'sk-bad', valid: false },
      },
    });
    const config = buildConfigFromOnboarding(data);
    expect(Object.keys(config.providers)).toHaveLength(0);
  });

  it('returns empty providers when providers map is empty', () => {
    const data = makeOnboardingData();
    const config = buildConfigFromOnboarding(data);
    expect(Object.keys(config.providers)).toHaveLength(0);
  });

  it('includes multiple valid providers', () => {
    const data = makeOnboardingData({
      providers: {
        anthropic: { apiKey: 'sk-ant-123', valid: true },
        openai: { apiKey: 'sk-oai-456', valid: true },
      },
    });
    const config = buildConfigFromOnboarding(data);
    expect(Object.keys(config.providers)).toHaveLength(2);
    expect(config.providers.anthropic.apiKey).toBe('sk-ant-123');
    expect(config.providers.openai.apiKey).toBe('sk-oai-456');
  });
});

// ── useOnboardingSetup ─────────────────────────────────────────────

describe('useOnboardingSetup', () => {
  it('is exported as a function', () => {
    expect(typeof useOnboardingSetup).toBe('function');
  });

  function makeMockService() {
    return {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      isConnected: vi.fn().mockReturnValue(true),
      sendMessage: vi.fn(),
      getHistory: vi.fn().mockResolvedValue([]),
      listWorkspaces: vi.fn().mockResolvedValue([]),
      createWorkspace: vi.fn().mockResolvedValue({
        id: 'ws1',
        name: 'Test',
        group: 'Work',
        created: new Date().toISOString(),
      }),
      updateWorkspace: vi.fn().mockResolvedValue(undefined),
      deleteWorkspace: vi.fn().mockResolvedValue(undefined),
      searchMemory: vi.fn().mockResolvedValue([]),
      getKnowledgeGraph: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
      listSessions: vi.fn().mockResolvedValue([]),
      createSession: vi.fn().mockResolvedValue({ id: 's1', messageCount: 0, lastActive: '', created: '' }),
      deleteSession: vi.fn().mockResolvedValue(undefined),
      approveAction: vi.fn(),
      denyAction: vi.fn(),
      getAgentStatus: vi.fn().mockResolvedValue({ running: false, model: 'test', tokensUsed: 0, estimatedCost: 0 }),
      getConfig: vi.fn().mockResolvedValue({ providers: {}, defaultModel: '', theme: 'dark', autostart: false, globalHotkey: '' }),
      updateConfig: vi.fn().mockResolvedValue(undefined),
      testApiKey: vi.fn().mockResolvedValue({ valid: true }),
      on: vi.fn().mockReturnValue(() => {}),
    } as unknown as import('../../src/index.js').WaggleService;
  }

  it('success path calls updateConfig and createWorkspace', async () => {
    const mockService = makeMockService();
    const { performSetup } = useOnboardingSetup({ service: mockService });

    const data = makeOnboardingData({
      name: 'Marko',
      providers: {
        anthropic: { apiKey: 'sk-ant-123', valid: true },
        openai: { apiKey: 'sk-bad', valid: false },
      },
      workspaceName: 'Marketing',
      workspaceGroup: 'Work',
    });

    const result = await performSetup(data);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();

    // updateConfig called with only valid providers (via buildConfigFromOnboarding)
    expect(mockService.updateConfig).toHaveBeenCalledTimes(1);
    const configArg = (mockService.updateConfig as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(Object.keys(configArg.providers)).toEqual(['anthropic']);
    expect(configArg.providers.anthropic).toEqual({ apiKey: 'sk-ant-123', models: [] });

    // createWorkspace called with name and group
    expect(mockService.createWorkspace).toHaveBeenCalledTimes(1);
    expect(mockService.createWorkspace).toHaveBeenCalledWith({
      name: 'Marketing',
      group: 'Work',
    });
  });

  it('error path returns success false when updateConfig throws', async () => {
    const mockService = makeMockService();
    (mockService.updateConfig as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Config write failed'));

    const { performSetup } = useOnboardingSetup({ service: mockService });
    const data = makeOnboardingData({
      name: 'Marko',
      providers: { anthropic: { apiKey: 'sk-ant-123', valid: true } },
      workspaceName: 'Marketing',
      workspaceGroup: 'Work',
    });

    const result = await performSetup(data);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Config write failed');
    // createWorkspace should NOT have been called
    expect(mockService.createWorkspace).not.toHaveBeenCalled();
  });

  it('error path returns success false when createWorkspace throws', async () => {
    const mockService = makeMockService();
    (mockService.createWorkspace as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Workspace creation failed'));

    const { performSetup } = useOnboardingSetup({ service: mockService });
    const data = makeOnboardingData({
      name: 'Marko',
      providers: { anthropic: { apiKey: 'sk-ant-123', valid: true } },
      workspaceName: 'Marketing',
      workspaceGroup: 'Work',
    });

    const result = await performSetup(data);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Workspace creation failed');
  });

  it('handles non-Error throws gracefully', async () => {
    const mockService = makeMockService();
    (mockService.updateConfig as ReturnType<typeof vi.fn>).mockRejectedValue('string error');

    const { performSetup } = useOnboardingSetup({ service: mockService });
    const data = makeOnboardingData({
      name: 'Marko',
      providers: { anthropic: { apiKey: 'sk-ant-123', valid: true } },
      workspaceName: 'Marketing',
      workspaceGroup: 'Work',
    });

    const result = await performSetup(data);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Setup failed');
  });
});
