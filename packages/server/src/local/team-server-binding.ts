import type { TeamServerConfig } from '@waggle/core';
import { normalizeTeamServerBaseUrl } from './team-server-egress.js';

/** Bind a stored workspace destination to the currently configured Team credentials. */
export function getBoundTeamServer(
  workspaceUrl: string | undefined,
  configured: TeamServerConfig | null,
): TeamServerConfig | null {
  if (!workspaceUrl || !configured?.url) return null;
  const workspaceBaseUrl = normalizeTeamServerBaseUrl(workspaceUrl);
  const configuredBaseUrl = normalizeTeamServerBaseUrl(configured.url);
  if (!workspaceBaseUrl || !configuredBaseUrl || workspaceBaseUrl !== configuredBaseUrl) return null;
  return { ...configured, url: configuredBaseUrl };
}
