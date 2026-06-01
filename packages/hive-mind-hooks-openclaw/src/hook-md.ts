/**
 * Builds the `HOOK.md` frontmatter the OpenClaw gateway reads to discover our
 * managed hook directory.
 *
 * OpenClaw discovers a hook from `~/.openclaw/hooks/<name>/HOOK.md`: the
 * frontmatter declares `metadata.openclaw.events[]` (the events the sibling
 * `handler.js` default-export subscribes to), and the body is human docs.
 *
 * IMPORTANT (spec §5.5): the events[] array uses the HOOK.md-style names
 * INCLUDING the `session:` prefix (`session:compact:before`), but the RUNTIME
 * `event.action` drops it (`compact:before`). The handler matches on the
 * action suffix, so declaring the prefixed form here is correct and the
 * handler still fires.
 */

/** The OpenClaw internal events our handler subscribes to (HOOK.md form). */
export const HOOK_MD_EVENTS = [
  'agent:bootstrap',
  'message:received',
  'message:sent',
  'session:compact:before',
] as const;

/**
 * Render the `HOOK.md` contents. `handlerFile` is the basename of the compiled
 * handler the gateway will `import()` (`handler.js`).
 */
export function renderHookMd(handlerFile = 'handler.js'): string {
  const eventsYaml = HOOK_MD_EVENTS.map((e) => `      - ${e}`).join('\n');
  return [
    '---',
    'name: hive-mind',
    'description: >-',
    '  hive-mind silent capture — routes OpenClaw gateway conversation episodes',
    '  into hive-mind frames via hive-mind-cli. Capture-only; fails open.',
    'metadata:',
    '  openclaw:',
    `    handler: ${handlerFile}`,
    '    events:',
    eventsYaml,
    '---',
    '',
    '# hive-mind silent capture (OpenClaw)',
    '',
    'This managed hook is installed by `@waggle/hive-mind-hooks-openclaw`. It is',
    'an **in-process** internal hook: the gateway loads the default export from',
    `\`${handlerFile}\` and dispatches the events above to it.`,
    '',
    'Lifecycle mapping:',
    '',
    '- `agent:bootstrap` → recall + inject (mutates `context.bootstrapFiles`)',
    '- `message:received` → save the inbound prompt as a temporary frame',
    '- `message:sent` → summarize + save the outbound turn (debounced; 0..N/turn)',
    '- `session:compact:before` → compaction maintenance (runtime action `compact:before`)',
    '',
    'Capture-only and fail-open: the handler never throws and never blocks the',
    'gateway. Remove with `openclaw-hooks uninstall`.',
    '',
  ].join('\n');
}
