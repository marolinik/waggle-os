import type { TeamServerConfig } from '@waggle/core';

function normalizeTeamServerBaseUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      return null;
    }
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

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
