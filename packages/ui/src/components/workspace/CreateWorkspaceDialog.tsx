/**
 * CreateWorkspaceDialog — modal dialog for creating a new workspace.
 *
 * Fields: name (required), group (dropdown), model (optional), personality (optional).
 * When connected to a team server, shows a "Team Workspace" toggle + team selector.
 * Supports "Start blank" or "Use template" mode with 6+ pre-configured templates.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { validateWorkspaceForm } from './utils.js';
import { SUPPORTED_PROVIDERS } from '../settings/utils.js';

/** Fallback descriptions for built-in templates when server omits them. */
const TEMPLATE_FALLBACK_DESCRIPTIONS: Record<string, string> = {
  sales: 'Track leads, draft outreach, prep for calls',
  research: 'Deep research with multi-source synthesis',
  'code-review': 'Review PRs, debug, architecture decisions',
  marketing: 'Content calendar, copy, competitive analysis',
  'product-launch': 'PRDs, roadmaps, stakeholder updates',
  legal: 'Contract review, compliance, legal research',
  consulting: 'Client research, deliverables, presentations',
};

/** The model ID that should be marked as "Recommended". */
const RECOMMENDED_MODEL_ID = 'claude-sonnet-4-6';

export interface TeamInfo {
  id: string;
  name: string;
  slug: string;
  role: string;
}

/** Shape of a workspace template from the server. */
export interface WorkspaceTemplate {
  id: string;
  name: string;
  description: string;
  persona: string;
  connectors: string[];
  suggestedCommands: string[];
  starterMemory: string[];
  builtIn: boolean;
}

/** Persona catalog entry used by persona switcher and workspace creation. */
export interface PersonaOption {
  id: string;
  name: string;
  description: string;
  icon: string;
}

/** Persona display icons (mirrors MissionControlView) */
const PERSONA_ICONS: Record<string, string> = {
  researcher: '\u{1F52C}',
  writer: '\u{270D}\uFE0F',
  analyst: '\u{1F4CA}',
  coder: '\u{1F4BB}',
  'project-manager': '\u{1F4CB}',
  'executive-assistant': '\u{1F4E7}',
  'sales-rep': '\u{1F3AF}',
  marketer: '\u{1F4E2}',
};

export interface CreateWorkspaceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (config: {
    name: string;
    group: string;
    model?: string;
    personality?: string;
    directory?: string;
    teamId?: string;
    teamServerUrl?: string;
    teamRole?: 'owner' | 'admin' | 'member' | 'viewer';
    teamUserId?: string;
    /** Template ID if created from a template */
    templateId?: string;
    /** Connectors to set up from template */
    templateConnectors?: string[];
    /** Suggested commands from template */
    templateCommands?: string[];
    /** Starter memory entries from template */
    templateMemory?: string[];
  }) => void;
  /** Whether the user is connected to a team server */
  isTeamConnected?: boolean;
  /** Team server URL (used when creating team workspaces) */
  teamServerUrl?: string;
  /** Current user's ID on the team server */
  teamUserId?: string;
  /** Fetch available teams from the team server */
  onFetchTeams?: () => Promise<TeamInfo[]>;
  /** Base URL for the local server API (defaults to http://localhost:3333) */
  apiBaseUrl?: string;
}

const GROUP_OPTIONS = ['Work', 'Personal', 'Study', 'Custom'];

export function CreateWorkspaceDialog({
  isOpen,
  onClose,
  onSubmit,
  isTeamConnected = false,
  teamServerUrl,
  teamUserId,
  onFetchTeams,
  apiBaseUrl = 'http://localhost:3333',
}: CreateWorkspaceDialogProps) {
  const [name, setName] = useState('');
  const [group, setGroup] = useState('Personal');
  const [model, setModel] = useState('');
  const [personality, setPersonality] = useState('');
  const [directory, setDirectory] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Team workspace state
  const [isTeamWorkspace, setIsTeamWorkspace] = useState(false);
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [teamsLoading, setTeamsLoading] = useState(false);

  // Model dropdown state: when true, show a free-text input instead of the select
  const [useCustomModel, setUseCustomModel] = useState(false);

  // Template state
  const [mode, setMode] = useState<'blank' | 'template'>('blank');
  const [templates, setTemplates] = useState<WorkspaceTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<WorkspaceTemplate | null>(null);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  /** Providers that have at least one model (excludes the "custom" bucket). */
  const providersWithModels = useMemo(
    () => SUPPORTED_PROVIDERS.filter((p) => p.models.length > 0),
    [],
  );

  // Fetch templates when dialog opens and template mode is selected
  const fetchTemplates = useCallback(async () => {
    if (templates.length > 0) return; // already loaded
    setTemplatesLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/workspace-templates`);
      if (res.ok) {
        const data = await res.json() as { templates: WorkspaceTemplate[] };
        setTemplates(data.templates);
      }
    } catch {
      // Template fetch failure is non-fatal — user can still create blank
    } finally {
      setTemplatesLoading(false);
    }
  }, [apiBaseUrl, templates.length]);

  useEffect(() => {
    if (isOpen && mode === 'template') {
      fetchTemplates();
    }
  }, [isOpen, mode, fetchTemplates]);

  // Fetch teams when team toggle is enabled
  useEffect(() => {
    if (isTeamWorkspace && isTeamConnected && onFetchTeams && teams.length === 0) {
      setTeamsLoading(true);
      onFetchTeams()
        .then((result) => {
          setTeams(result);
          if (result.length > 0 && !selectedTeamId) {
            setSelectedTeamId(result[0].id);
          }
        })
        .catch(() => {
          setError('Unable to load teams. Please try again.');
        })
        .finally(() => setTeamsLoading(false));
    }
  }, [isTeamWorkspace, isTeamConnected, onFetchTeams]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply template selection — pre-fill name and personality
  const handleSelectTemplate = (template: WorkspaceTemplate) => {
    setSelectedTemplate(template);
    if (!name) {
      setName(template.name);
    }
    setGroup('Work');
    setError(null);
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateWorkspaceForm(name);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (isTeamWorkspace && !selectedTeamId) {
      setError('Please select a team');
      return;
    }

    const selectedTeam = teams.find(t => t.id === selectedTeamId);

    onSubmit({
      name: name.trim(),
      group: isTeamWorkspace ? 'Team' : group,
      model: model.trim() || undefined,
      personality: personality.trim() || undefined,
      directory: directory.trim() || undefined,
      ...(isTeamWorkspace && selectedTeam && {
        teamId: selectedTeam.id,
        teamServerUrl,
        teamRole: selectedTeam.role as 'owner' | 'admin' | 'member' | 'viewer',
        teamUserId,
      }),
      ...(selectedTemplate && {
        templateId: selectedTemplate.id,
        templateConnectors: selectedTemplate.connectors,
        templateCommands: selectedTemplate.suggestedCommands,
        templateMemory: selectedTemplate.starterMemory,
      }),
    });
    // Reset form
    setName('');
    setGroup('Personal');
    setModel('');
    setPersonality('');
    setDirectory('');
    setError(null);
    setUseCustomModel(false);
    setIsTeamWorkspace(false);
    setSelectedTeamId('');
    setMode('blank');
    setSelectedTemplate(null);
  };

  return (
    <div className="create-workspace-dialog fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg bg-background p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Create Workspace</h2>

        {/* Mode toggle: Start blank | Use template */}
        <div className="mb-4 flex rounded bg-card p-1" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'blank'}
            onClick={() => { setMode('blank'); setSelectedTemplate(null); }}
            className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === 'blank'
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Start blank
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'template'}
            onClick={() => { setMode('template'); }}
            className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === 'template'
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Use template
          </button>
        </div>

        {/* Template grid (when template mode is selected) */}
        {mode === 'template' && (
          <div className="mb-4">
            {templatesLoading ? (
              <div className="py-4 text-center text-sm text-muted-foreground">Loading templates...</div>
            ) : templates.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">No templates available</div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => handleSelectTemplate(tpl)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      selectedTemplate?.id === tpl.id
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-card/50 hover:border-border'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg" role="img" aria-label={tpl.persona}>
                        {PERSONA_ICONS[tpl.persona] || '\u{1F916}'}
                      </span>
                      <span className="text-sm font-medium text-foreground">{tpl.name}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {tpl.description || TEMPLATE_FALLBACK_DESCRIPTIONS[tpl.id] || ''}
                    </p>
                  </button>
                ))}
              </div>
            )}

            {/* Selected template details */}
            {selectedTemplate && (
              <div className="mt-3 rounded border border-border bg-card/30 p-3">
                <div className="mb-1 text-xs font-medium text-muted-foreground">Template details</div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>Persona: <span className="text-foreground">{selectedTemplate.persona}</span></span>
                  {selectedTemplate.connectors.length > 0 && (
                    <span>Connectors: <span className="text-foreground">{selectedTemplate.connectors.join(', ')}</span></span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {selectedTemplate.suggestedCommands.map((cmd) => (
                    <span key={cmd} className="rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">{cmd}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Team workspace toggle (only when connected) */}
          {isTeamConnected && (
            <div className="flex items-center gap-3 rounded bg-card/50 px-3 py-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={isTeamWorkspace}
                  onChange={(e) => {
                    setIsTeamWorkspace(e.target.checked);
                    setError(null);
                  }}
                  className="rounded border-border"
                />
                Team Workspace
              </label>
              {isTeamWorkspace && (
                <span className="text-xs text-primary">Shared with team members</span>
              )}
            </div>
          )}

          {/* Team selector (when team workspace toggled) */}
          {isTeamWorkspace && (
            <div>
              <label className="mb-1 block text-sm text-muted-foreground" htmlFor="ws-team">
                Team <span className="text-red-400">*</span>
              </label>
              {teamsLoading ? (
                <div className="rounded bg-card px-3 py-2 text-sm text-muted-foreground">
                  Loading teams...
                </div>
              ) : teams.length === 0 ? (
                <div className="rounded bg-card px-3 py-2 text-sm text-yellow-400">
                  No teams found. Create a team on the team server first.
                </div>
              ) : (
                <select
                  id="ws-team"
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="w-full rounded bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
                >
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.role})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="mb-1 block text-sm text-muted-foreground" htmlFor="ws-name">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              id="ws-name"
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              className="w-full rounded bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
              placeholder={selectedTemplate ? selectedTemplate.name : 'e.g., Marketing Q2, Client: Acme Corp, Personal Research'}
              autoFocus
            />
            {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
            <p className="mt-1 text-xs text-muted-foreground">A workspace is like a project — Waggle remembers everything inside it</p>
          </div>

          {/* Group (hidden when team workspace — auto-set to "Team") */}
          {!isTeamWorkspace && (
            <div>
              <label className="mb-1 block text-sm text-muted-foreground" htmlFor="ws-group">
                Group
              </label>
              <select
                id="ws-group"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                className="w-full rounded bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
              >
                {GROUP_OPTIONS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          )}

          {/* Directory */}
          <div>
            <label className="mb-1 block text-sm text-muted-foreground" htmlFor="ws-directory">
              Working Directory <span className="text-muted-foreground/60">(where files are generated)</span>
            </label>
            <input
              id="ws-directory"
              type="text"
              value={directory}
              onChange={(e) => setDirectory(e.target.value)}
              className="w-full rounded bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
              placeholder="C:\Users\You\Documents\my-project"
            />
            <p className="mt-1 text-xs text-muted-foreground">Agent reads/writes files here. Leave empty to use home directory.</p>
          </div>

          {/* Model */}
          <div>
            <label className="mb-1 block text-sm text-muted-foreground" htmlFor="ws-model">
              Model <span className="text-muted-foreground/60">(optional)</span>
            </label>
            {useCustomModel ? (
              <div className="flex gap-2">
                <input
                  id="ws-model"
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="flex-1 rounded bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
                  placeholder="custom-model-id"
                />
                <button
                  type="button"
                  onClick={() => { setUseCustomModel(false); setModel(''); }}
                  className="rounded px-2 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  title="Back to model list"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <select
                id="ws-model"
                value={model}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setUseCustomModel(true);
                    setModel('');
                  } else {
                    setModel(e.target.value);
                  }
                }}
                className="w-full rounded bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Default (auto)</option>
                {providersWithModels.map((provider) => (
                  <optgroup key={provider.id} label={provider.name}>
                    {provider.models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.displayName}{m.id === RECOMMENDED_MODEL_ID ? ' — Recommended' : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
                <optgroup label="Other">
                  <option value="__custom__">Enter custom model ID...</option>
                </optgroup>
              </select>
            )}
          </div>

          {/* Personality */}
          <div>
            <label className="mb-1 block text-sm text-muted-foreground" htmlFor="ws-personality">
              Personality <span className="text-muted-foreground/60">(optional)</span>
            </label>
            <textarea
              id="ws-personality"
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              className="w-full rounded bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
              placeholder="You are a helpful assistant..."
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary transition-colors"
            >
              {isTeamWorkspace ? 'Create Team Workspace' : selectedTemplate ? `Create from ${selectedTemplate.name}` : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
