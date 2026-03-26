/**
 * ThemeSection — light/dark mode toggle and general settings.
 *
 * Displayed in the "General" tab. Uses existing ThemeContext for theme management.
 */

import type { WaggleConfig } from '../../services/types.js';

export interface ThemeSectionProps {
  config: WaggleConfig;
  onConfigUpdate: (config: Partial<WaggleConfig>) => void;
}

export function ThemeSection({ config, onConfigUpdate }: ThemeSectionProps) {
  return (
    <div className="theme-section space-y-6">
      <h2 className="text-lg font-semibold">General</h2>

      {/* Agent resume card */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-medium text-foreground mb-2">Your Agent</h3>
        <div className="space-y-1 text-xs text-muted-foreground">
          <div>Model: {config?.defaultModel ?? 'Not set'}</div>
          <div>Personas: 9+ available (Ctrl+Shift+P to switch)</div>
          <div>Commands: 22 workflow commands (type / in chat)</div>
          <div>Tools: 64+ built-in agent tools</div>
          <div>Data: Encrypted locally with AES-256-GCM</div>
        </div>
      </div>

      {/* Theme toggle */}
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">Theme</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Switch between light and dark mode.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-sm ${config.theme === 'light' ? 'text-yellow-400' : 'text-muted-foreground'}`}>
              Light
            </span>
            <button
              onClick={() =>
                onConfigUpdate({ theme: config.theme === 'dark' ? 'light' : 'dark' })
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                config.theme === 'dark' ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-background shadow-sm transition-transform ${
                  config.theme === 'dark' ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className={`text-sm ${config.theme === 'dark' ? 'text-primary' : 'text-muted-foreground'}`}>
              Dark
            </span>
          </div>
        </div>
      </div>

      {/* Autostart */}
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">Launch on Startup</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Automatically start Waggle when you log in.
            </p>
          </div>
          <button
            onClick={() => onConfigUpdate({ autostart: !config.autostart })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              config.autostart ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-background shadow-sm transition-transform ${
                config.autostart ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Global hotkey */}
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">Global Hotkey</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Keyboard shortcut to show/hide Waggle.
            </p>
          </div>
          <input
            type="text"
            value={config.globalHotkey}
            onChange={(e) => onConfigUpdate({ globalHotkey: e.target.value })}
            className="w-40 rounded bg-card px-3 py-2 text-sm text-center text-foreground border border-border focus:border-primary focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}
