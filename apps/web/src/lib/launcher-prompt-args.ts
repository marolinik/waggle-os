/**
 * E-2 — Cross-tool prompt-arg shapes for the AI-OS launcher.
 *
 * Given a tool id and a free-form prompt, returns the CLI args array
 * to pass to /api/tools/launch so the spawned tool boots with the
 * prompt pre-filled. Returns null for tools that have no CLI
 * inline-prompt surface — those launch bare and the user types the
 * prompt manually inside the tool.
 *
 * Conventions (sources documented per-case):
 *
 *   claude-code        → ['--print', prompt]
 *   openclaw           → ['--print', prompt]   (Claude Code fork)
 *   codex              → [prompt]               (positional arg)
 *   hermes             → null                   (captured-task API only)
 *   hermes-desktop     → null                   (GUI only)
 *   cursor             → null                   (folder-based; no CLI prompt)
 *   claude-desktop     → null                   (GUI only)
 *   codex-desktop      → null                   (GUI only)
 *
 * Adding a tool:
 *   1. Verify the CLI convention against a real binary (`<tool> --help`).
 *   2. Add the case below with a one-line source comment.
 *   3. Add an it() to launcher-prompt-args.test.ts that locks the shape.
 *   4. Update CROSS_TOOL_NOTES in the JSDoc above.
 *
 * Out of scope:
 *   - Stdin-piped prompts. Some CLIs (codex) accept stdin as a
 *     fallback; we don't pipe today because the Phase 2A backend
 *     doesn't expose a stdin field on POST /api/tools/launch. If
 *     stdin becomes the right shape for any tool, extend the route
 *     schema first.
 *   - Multi-arg shapes (e.g. claude-code's --continue + --print). The
 *     LauncherApp only sends a prompt; continuation/session args belong
 *     in a separate launch-options surface.
 */

/**
 * Build the CLI args for launching `toolId` with `prompt`. Returns
 * `null` when the tool has no inline-prompt CLI — the launcher then
 * passes no args and the user types the prompt inside the tool.
 *
 * Trims the prompt first; an empty/whitespace prompt always returns
 * null regardless of tool support.
 */
export function promptArgsForTool(toolId: string, prompt: string): string[] | null {
  const p = prompt.trim();
  if (!p) return null;
  switch (toolId) {
    // Anthropic Claude Code: `claude --print "<prompt>"` runs in
    // non-interactive mode and prints the response. Documented in
    // claude-code --help; verified against shipped CLI.
    case 'claude-code':
      return ['--print', p];

    // OpenClaw: Claude Code fork (hive-mind-hooks-openclaw exists).
    // Same --print flag inherited from the upstream CLI convention.
    case 'openclaw':
      return ['--print', p];

    // OpenAI Codex CLI: `codex "<prompt>"` — prompt is positional.
    // See https://github.com/openai/codex (Codex CLI uses the first
    // non-flag argument as the task prompt).
    case 'codex':
      return [p];

    // GUI-only tools and Hermes interactive launch: no verified inline-prompt
    // surface. Hermes captured tasks use the shared headless task contract,
    // not this dock-launch helper.
    //   cursor: opens a folder (`cursor /path`), no --prompt flag.
    //   claude-desktop / codex-desktop: GUI binaries with no
    //     prompt-from-CLI handoff documented.
    case 'cursor':
    case 'claude-desktop':
    case 'codex-desktop':
    case 'hermes':
    case 'hermes-desktop':
      return null;

    default:
      return null;
  }
}

/**
 * UI hint — does this tool accept an inline prompt at all? Used by
 * the launch dialog to grey-out the prompt textarea when the active
 * tool can't consume it (and surface a tooltip explaining why).
 *
 * Returns true iff `promptArgsForTool(toolId, 'x')` is non-null.
 */
export function toolAcceptsInlinePrompt(toolId: string): boolean {
  return promptArgsForTool(toolId, 'x') !== null;
}
