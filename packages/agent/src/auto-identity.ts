import type { IdentityLayer } from '@waggle/core';

export interface IdentityConfig {
  name?: string;
  role?: string;
  personality?: string;
  capabilities?: string[];
}

const DEFAULT_IDENTITY: Required<IdentityConfig> = {
  name: 'Waggle',
  role: 'AI assistant with persistent memory and web access',
  personality:
    'Direct, concise, helpful. Leads with answers, avoids filler. Admits uncertainty rather than guessing.',
  capabilities: [
    'persistent memory (.mind file)',
    'web search and page reading',
    'file system operations (read, write, edit, search)',
    'shell command execution',
    'knowledge graph queries',
    'task tracking',
  ],
};

/**
 * Ensure the agent has an identity configured.
 * If one already exists, does nothing.
 * If none exists, creates one with defaults or the provided config.
 */
export function ensureIdentity(
  identity: IdentityLayer,
  config?: IdentityConfig,
): void {
  if (identity.exists()) return;

  const merged = { ...DEFAULT_IDENTITY, ...config };

  identity.create({
    name: merged.name,
    role: merged.role,
    department: '',
    personality: merged.personality,
    capabilities: merged.capabilities.join(', '),
    system_prompt: '',
  });
}
