/**
 * KeyboardShortcutsHelp — Modal overlay showing all keyboard shortcuts.
 *
 * Triggered by Ctrl+/ (Cmd+/ on Mac). Groups shortcuts by category
 * with keyboard key badges for visual clarity.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

// ── Types ────────────────────────────────────────────────────────────────

interface KeyboardShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

interface ShortcutEntry {
  description: string;
  keys: string[];
}

interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutEntry[];
}

// ── Shortcut catalog ─────────────────────────────────────────────────────

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
const mod = isMac ? '\u2318' : 'Ctrl';

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Global',
    shortcuts: [
      { description: 'Search', keys: [mod, 'K'] },
      { description: 'New Workspace', keys: [mod, 'N'] },
      { description: 'Settings', keys: [mod, ','] },
      { description: 'Keyboard Shortcuts', keys: [mod, '/'] },
      { description: 'Switch Workspace (1-9)', keys: ['Ctrl', '1-9'] },
      { description: 'Quick-Switch Workspace', keys: ['Ctrl', 'Tab'] },
    ],
  },
  {
    title: 'Views',
    shortcuts: [
      { description: 'Chat', keys: ['Ctrl', 'Shift', '1'] },
      { description: 'Memory', keys: ['Ctrl', 'Shift', '2'] },
      { description: 'Events', keys: ['Ctrl', 'Shift', '3'] },
      { description: 'Capabilities', keys: ['Ctrl', 'Shift', '4'] },
      { description: 'Cockpit', keys: ['Ctrl', 'Shift', '5'] },
      { description: 'Mission Control', keys: ['Ctrl', 'Shift', '6'] },
      { description: 'Settings', keys: ['Ctrl', 'Shift', '7'] },
    ],
  },
  {
    title: 'Chat',
    shortcuts: [
      { description: 'Send message', keys: ['Enter'] },
      { description: 'New line', keys: ['Shift', 'Enter'] },
      { description: 'Slash commands', keys: ['/'] },
      { description: 'Switch persona', keys: [mod, 'Shift', 'P'] },
    ],
  },
  {
    title: 'Tabs',
    shortcuts: [
      { description: 'New tab', keys: ['Ctrl', 'T'] },
      { description: 'Close tab', keys: ['Ctrl', 'W'] },
      { description: 'Toggle workspace', keys: ['Ctrl', 'Shift', 'W'] },
    ],
  },
];

// ── Component ────────────────────────────────────────────────────────────

function KeyBadge({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground min-w-[1.5rem]">
      {children}
    </kbd>
  );
}

function ShortcutRow({ description, keys }: ShortcutEntry) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-foreground">{description}</span>
      <div className="flex items-center gap-1 ml-4 shrink-0">
        {keys.map((key, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-xs text-muted-foreground">+</span>}
            <KeyBadge>{key}</KeyBadge>
          </span>
        ))}
      </div>
    </div>
  );
}

export function KeyboardShortcutsHelp({ open, onClose }: KeyboardShortcutsHelpProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}
    >
      <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Quick reference for all available keyboard shortcuts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {group.title}
              </h3>
              <div className="divide-y divide-border">
                {group.shortcuts.map((shortcut, i) => (
                  <ShortcutRow key={i} {...shortcut} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
