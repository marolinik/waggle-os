import fs from 'node:fs';
import type { HookRegistry, HookContext } from './hooks.js';

interface DenyRule {
  type: 'deny';
  tools: string[];
  pattern: string;
}

interface HooksConfig {
  hooks?: {
    'pre:tool'?: DenyRule[];
  };
}

/**
 * Load user-configurable hooks from a JSON config file (e.g. ~/.waggle/hooks.json).
 * If the file doesn't exist, returns silently — no error.
 *
 * Config format:
 * ```json
 * { "hooks": { "pre:tool": [{ "type": "deny", "tools": ["bash"], "pattern": "rm -rf" }] } }
 * ```
 */
export async function loadHooksFromConfig(configPath: string, registry: HookRegistry): Promise<void> {
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, 'utf-8');
  } catch {
    // File doesn't exist or can't be read — silently return
    return;
  }

  const config: HooksConfig = JSON.parse(raw);
  const preToolRules = config.hooks?.['pre:tool'];
  if (!preToolRules || !Array.isArray(preToolRules)) return;

  for (const rule of preToolRules) {
    if (rule.type === 'deny') {
      registry.on('pre:tool', (ctx: HookContext) => {
        const toolName = ctx.toolName ?? '';
        if (!rule.tools.includes(toolName)) return;

        const argsStr = JSON.stringify(ctx.args ?? {});
        if (argsStr.includes(rule.pattern)) {
          return { cancel: true, reason: `Denied by config: ${rule.pattern}` };
        }
      });
    }
  }
}
