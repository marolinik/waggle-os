/**
 * @waggle/hive-mind-hooks-codex-desktop — barrel export.
 *
 * Codex Desktop silent-capture shim for hive-mind. Codex Desktop shares the
 * SAME `~/.codex/` config root as the Codex CLI — there is no separate
 * codex-desktop config directory — so this package is a THIN RE-EXPORT of
 * `@waggle/hive-mind-hooks-codex`. Install / uninstall / verify behave
 * identically and write into the same `~/.codex/hooks.json` + pointer
 * (`~/.codex/hive-mind-install.json`).
 *
 * It exists as a distinct package so the dependency graph + OSS subtree-split
 * see the package boundary, and so the launcher's
 * `hookPackageFor('codex-desktop')` resolves to this package. Most users
 * invoke the `codex-desktop-hooks` bin (which delegates to the codex installer).
 */

export * from '@waggle/hive-mind-hooks-codex';
