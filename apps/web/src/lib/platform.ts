/**
 * Tiny platform helpers. Waggle ships on Windows + macOS, so any modifier-key
 * hint must adapt: a ⌘ glyph on Windows is a key the user's keyboard lacks.
 * Centralised here so the ⌘K affordance reads correctly everywhere it appears
 * (Sidebar, AskBar, CommandCenter footer, NotFound, ChatApp composer).
 */

/** True when running on macOS (where the ⌘ glyph is the right modifier hint). */
export function isMac(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.platform?.toLowerCase().includes('mac');
}

/**
 * The platform-correct label for the global-search shortcut: the ⌘K glyph on
 * macOS, "Ctrl K" elsewhere.
 */
export const cmdKLabel: string = isMac() ? '⌘K' : 'Ctrl K';
