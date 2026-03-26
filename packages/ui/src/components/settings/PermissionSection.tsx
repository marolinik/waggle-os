/**
 * PermissionSection — YOLO mode toggle and external mutation gates.
 *
 * YOLO mode is on by default (all tool executions auto-approved).
 * External gates can be added/removed for specific operations.
 */

import { useState } from 'react';

export interface PermissionSectionProps {
  yoloMode?: boolean;
  onYoloModeChange?: (enabled: boolean) => void;
  externalGates?: string[];
  onExternalGatesChange?: (gates: string[]) => void;
  workspaceId?: string;
  workspaceGates?: string[];
  onWorkspaceGatesChange?: (gates: string[]) => void;
}

export function PermissionSection({
  yoloMode = true,
  onYoloModeChange,
  externalGates = [],
  onExternalGatesChange,
  workspaceId,
  workspaceGates = [],
  onWorkspaceGatesChange,
}: PermissionSectionProps) {
  const [newGate, setNewGate] = useState('');
  const [newWorkspaceGate, setNewWorkspaceGate] = useState('');

  const handleAddGate = () => {
    const trimmed = newGate.trim();
    if (trimmed && !externalGates.includes(trimmed)) {
      onExternalGatesChange?.([...externalGates, trimmed]);
      setNewGate('');
    }
  };

  const handleRemoveGate = (gate: string) => {
    onExternalGatesChange?.(externalGates.filter((g) => g !== gate));
  };

  const handleAddWorkspaceGate = () => {
    const trimmed = newWorkspaceGate.trim();
    if (trimmed && !workspaceGates.includes(trimmed)) {
      onWorkspaceGatesChange?.([...workspaceGates, trimmed]);
      setNewWorkspaceGate('');
    }
  };

  const handleRemoveWorkspaceGate = (gate: string) => {
    onWorkspaceGatesChange?.(workspaceGates.filter((g) => g !== gate));
  };

  return (
    <div className="permission-section space-y-6">
      <h2 className="text-lg font-semibold">Permissions</h2>

      {/* Auto-Approve mode (C2: renamed from YOLO Mode for clarity) */}
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">Auto-Approve Mode</h3>
            <p className="text-xs text-muted-foreground mt-1">
              When enabled, most tool executions are auto-approved. Only destructive operations
              (file deletions, git push, external API calls) will prompt for confirmation.
            </p>
          </div>
          <button
            onClick={() => onYoloModeChange?.(!yoloMode)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              yoloMode ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-background shadow-sm transition-transform ${
                yoloMode ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* External gates */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">External Mutation Gates</h3>
        <p className="text-xs text-muted-foreground">
          Operations that always require manual approval, even in Auto-Approve mode.
        </p>

        {externalGates.length > 0 && (
          <div className="space-y-2">
            {externalGates.map((gate) => (
              <div
                key={gate}
                className="flex items-center justify-between rounded bg-card px-3 py-2"
              >
                <span className="text-sm text-muted-foreground">{gate}</span>
                <button
                  onClick={() => handleRemoveGate(gate)}
                  className="text-sm text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={newGate}
            onChange={(e) => setNewGate(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddGate()}
            placeholder="e.g., git push, rm -rf, curl POST"
            className="flex-1 rounded bg-card px-3 py-2 text-sm text-foreground border border-border focus:border-primary focus:outline-none"
          />
          <button
            onClick={handleAddGate}
            disabled={!newGate.trim()}
            className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      {/* Workspace overrides */}
      {workspaceId && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Workspace Overrides</h3>
          <p className="text-xs text-muted-foreground">
            Additional gates specific to this workspace. These extend the global gates above.
          </p>

          {workspaceGates.length > 0 && (
            <div className="space-y-2">
              {workspaceGates.map((gate) => (
                <div
                  key={gate}
                  className="flex items-center justify-between rounded bg-card px-3 py-2"
                >
                  <span className="text-sm text-muted-foreground">{gate}</span>
                  <button
                    onClick={() => handleRemoveWorkspaceGate(gate)}
                    className="text-sm text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={newWorkspaceGate}
              onChange={(e) => setNewWorkspaceGate(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddWorkspaceGate()}
              placeholder="e.g., deploy, database migrate"
              className="flex-1 rounded bg-card px-3 py-2 text-sm text-foreground border border-border focus:border-primary focus:outline-none"
            />
            <button
              onClick={handleAddWorkspaceGate}
              disabled={!newWorkspaceGate.trim()}
              className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
