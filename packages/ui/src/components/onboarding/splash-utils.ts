/**
 * Splash screen utility functions.
 *
 * Pure functions for startup phase display — no React dependencies.
 */

export interface StartupPhaseConfig {
  id: string;
  message: string;
  progress: number;
}

/**
 * Ordered list of startup phases with default messages and progress values.
 */
export const STARTUP_PHASES: StartupPhaseConfig[] = [
  { id: 'init', message: 'Initializing Waggle service...', progress: 0.05 },
  { id: 'migration', message: 'Migrating to multi-mind layout...', progress: 0.15 },
  { id: 'creating-mind', message: 'Creating personal memory...', progress: 0.3 },
  { id: 'litellm', message: 'Starting LiteLLM proxy...', progress: 0.5 },
  { id: 'server', message: 'Starting local server...', progress: 0.75 },
  { id: 'ready', message: 'Waggle is ready!', progress: 1 },
];

const phaseMap = new Map(STARTUP_PHASES.map(p => [p.id, p]));

/**
 * Get a human-readable message for a startup phase.
 */
export function getPhaseMessage(phase: string): string {
  return phaseMap.get(phase)?.message ?? 'Loading...';
}

/**
 * Get the progress value (0-1) for a startup phase.
 */
export function getPhaseProgress(phase: string): number {
  return phaseMap.get(phase)?.progress ?? 0;
}

/**
 * Check if startup is complete.
 */
export function isStartupComplete(phase: string): boolean {
  return phase === 'ready';
}

/**
 * Format a progress value (0-1) as a percentage string.
 */
export function formatProgress(progress: number): string {
  return `${Math.round(progress * 100)}%`;
}
