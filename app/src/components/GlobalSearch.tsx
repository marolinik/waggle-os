/**
 * GlobalSearch — Ctrl+K command palette for navigating workspaces, commands, and settings.
 *
 * F6: Uses shadcn CommandDialog (cmdk-based) to provide instant search across:
 *   - Workspaces (filtered by name)
 *   - Slash commands (13 built-in commands)
 *   - Settings tabs (General, Models, Vault, Permissions, Team, Advanced)
 */

import { useCallback, useState } from 'react';
import type { Workspace } from '@waggle/ui';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';

// ── Types ────────────────────────────────────────────────────────────────

export type GlobalSearchResultType = 'workspace' | 'command' | 'settings';

export interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
  onSelect: (type: GlobalSearchResultType, id: string) => void;
  workspaces: Workspace[];
}

// ── Command catalog ──────────────────────────────────────────────────────

const SLASH_COMMANDS = [
  { id: '/catchup', name: '/catchup', description: 'Get a summary of what happened since you left' },
  { id: '/now', name: '/now', description: 'Show current workspace status and context' },
  { id: '/research', name: '/research', description: 'Deep research on a topic' },
  { id: '/draft', name: '/draft', description: 'Draft a document from context' },
  { id: '/decide', name: '/decide', description: 'Decision compression and next-step thinking' },
  { id: '/review', name: '/review', description: 'Review code or content' },
  { id: '/spawn', name: '/spawn', description: 'Spawn a sub-agent for a task' },
  { id: '/skills', name: '/skills', description: 'List loaded skills' },
  { id: '/status', name: '/status', description: 'Show agent status and health' },
  { id: '/memory', name: '/memory', description: 'Search and browse memory' },
  { id: '/plan', name: '/plan', description: 'Create a structured plan' },
  { id: '/focus', name: '/focus', description: 'Set focus mode for deep work' },
  { id: '/help', name: '/help', description: 'Show available commands' },
  { id: '/search-all', name: '/search-all', description: 'Search across all workspaces' },
] as const;

const SETTINGS_TABS = [
  { id: 'general', name: 'General', description: 'Appearance and startup behavior' },
  { id: 'models', name: 'Models', description: 'Default AI model and API keys' },
  { id: 'vault', name: 'Vault', description: 'Encrypted credentials for connectors' },
  { id: 'permissions', name: 'Permissions', description: 'Agent permission controls' },
  { id: 'team', name: 'Team', description: 'Team server connection' },
  { id: 'advanced', name: 'Advanced', description: 'Data management and debugging' },
] as const;

// ── Component ────────────────────────────────────────────────────────────

export function GlobalSearch({
  open,
  onClose,
  onSelect,
  workspaces,
}: GlobalSearchProps) {
  // Q23: Cross-workspace search toggle
  const [searchAllWorkspaces, setSearchAllWorkspaces] = useState(false);

  const handleSelect = useCallback(
    (type: GlobalSearchResultType, id: string) => {
      onSelect(type, id);
      onClose();
    },
    [onSelect, onClose],
  );

  // BUG-R2-01: Guard against cmdk store subscription error.
  // Only mount CommandDialog when open — prevents useSyncExternalStore crash
  // when the cmdk internal store isn't ready during initial render.
  if (!open) return null;

  return (
    <CommandDialog
      open={open}
      onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}
      title="Search"
      description="Search workspaces, commands, and settings"
    >
      <CommandInput placeholder="⬡ Search everything..." />
      {/* Q23: Cross-workspace search toggle */}
      <div className="flex items-center gap-2 px-3 py-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
        <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={searchAllWorkspaces}
            onChange={(e) => setSearchAllWorkspaces(e.target.checked)}
            className="rounded"
          />
          Search all workspaces
        </label>
        {searchAllWorkspaces && (
          <span className="text-[10px] rounded px-1.5 py-0.5" style={{ backgroundColor: 'var(--honey-600)', color: '#fff' }}>
            Cross-workspace
          </span>
        )}
      </div>
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Workspaces */}
        {workspaces.length > 0 && (
          <CommandGroup heading="Workspaces">
            {workspaces.map((ws) => (
              <CommandItem
                key={ws.id}
                value={`workspace ${ws.name}`}
                onSelect={() => handleSelect('workspace', ws.id)}
              >
                <span className="text-[10px] shrink-0" style={{ color: 'var(--honey-500)' }}>⬡</span>
                <span>{ws.name}</span>
                {ws.group && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {ws.group}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />

        {/* Commands */}
        <CommandGroup heading="Commands">
          {SLASH_COMMANDS.map((cmd) => (
            <CommandItem
              key={cmd.id}
              value={`command ${cmd.name} ${cmd.description}`}
              onSelect={() => handleSelect('command', cmd.id)}
            >
              <span className="font-mono text-xs text-primary">
                {cmd.name}
              </span>
              <span className="text-xs text-muted-foreground">{cmd.description}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* Settings */}
        <CommandGroup heading="Settings">
          {SETTINGS_TABS.map((tab) => (
            <CommandItem
              key={tab.id}
              value={`settings ${tab.name} ${tab.description}`}
              onSelect={() => handleSelect('settings', tab.id)}
            >
              <span>{tab.name}</span>
              <span className="text-xs text-muted-foreground">{tab.description}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

/* Workspace hue removed — using hex bullets (⬡) instead of colored dots */
