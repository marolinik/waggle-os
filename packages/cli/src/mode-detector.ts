export type WaggleMode = {
  type: 'local' | 'team' | 'error';
  warning?: string;
  error?: string;
};

export interface ModeDetectorDeps {
  hasToken: boolean;
  serverUrl: string;
  forceLocal: boolean;
  forceTeam: boolean;
  healthCheck: (serverUrl: string) => Promise<boolean>;
}

export async function detectMode(deps: ModeDetectorDeps): Promise<WaggleMode> {
  // 1. --local flag → always local mode
  if (deps.forceLocal) {
    return { type: 'local' };
  }

  // 2. --team flag + no token → error
  if (deps.forceTeam && !deps.hasToken) {
    return { type: 'error', error: 'Team mode requires login. Run: waggle login' };
  }

  // 3. --team flag + token → team mode
  if (deps.forceTeam && deps.hasToken) {
    return { type: 'team' };
  }

  // 4. No token → local mode
  if (!deps.hasToken) {
    return { type: 'local' };
  }

  // 5. Token + server reachable → team mode
  const reachable = await deps.healthCheck(deps.serverUrl);
  if (reachable) {
    return { type: 'team' };
  }

  // 6. Token + server unreachable → local mode with warning
  return { type: 'local', warning: 'Server unreachable — running in local mode.' };
}

export async function checkServerHealth(serverUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${serverUrl}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}
