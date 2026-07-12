import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  adapter: {
    detectTools: vi.fn(),
    getToolProcesses: vi.fn(),
    launchTool: vi.fn(),
    manageHooks: vi.fn(),
    killTool: vi.fn(),
  },
}));

vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

import LauncherApp, { resetLauncherRouteCache } from '@/components/os/apps/LauncherApp';

beforeEach(() => {
  vi.clearAllMocks();
  resetLauncherRouteCache();
  mocks.adapter.detectTools.mockResolvedValue({
    platform: 'win32',
    detectedAt: new Date().toISOString(),
    tools: [],
  });
  mocks.adapter.getToolProcesses.mockResolvedValue({ processes: [] });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('LauncherApp accessibility metadata', () => {
  it('names the refresh control and optional prompt textarea', async () => {
    render(<LauncherApp activeWorkspaceId="workspace-1" />);

    expect(await screen.findByRole('button', { name: /refresh installed tools/i })).toBeInTheDocument();
    const prompt = screen.getByRole('textbox', { name: /optional launch prompt/i });
    expect(prompt).toHaveAttribute('name', 'launcherPrompt');
    expect(prompt).toHaveAttribute('autocomplete', 'off');
    expect(prompt.className).toContain('focus-visible:ring-2');

    await waitFor(() => expect(mocks.adapter.detectTools).toHaveBeenCalled());
  });
});
