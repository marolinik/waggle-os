import { motion, AnimatePresence } from 'framer-motion';
import { Keyboard, X } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface KeyboardShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

const shortcuts = [
  { category: 'Navigation', items: [
    { keys: ['Ctrl', 'Shift', '0'], action: 'Home' },
    { keys: ['Ctrl', 'Shift', '1'], action: 'Chat' },
    { keys: ['Ctrl', 'Shift', '2'], action: 'Agents' },
    { keys: ['Ctrl', 'Shift', '3'], action: 'Files' },
    { keys: ['Ctrl', 'Shift', '4'], action: 'Mission Control' },
    { keys: ['Ctrl', 'Shift', '5'], action: 'Memory' },
    { keys: ['Ctrl', 'Shift', '6'], action: 'Events' },
    { keys: ['Ctrl', 'Shift', '7'], action: 'Settings' },
    { keys: ['Ctrl', 'Shift', '8'], action: 'Skills' },
    { keys: ['Ctrl', 'Shift', '9'], action: 'Agent Swarm' },
  ]},
  { category: 'Quick Actions', items: [
    { keys: ['Ctrl', 'K'], action: 'Global Search' },
    { keys: ['Ctrl', 'Shift', 'N'], action: 'Open Chat' },
    { keys: ['Ctrl', 'Shift', 'R'], action: 'Room' },
    { keys: ['Ctrl', 'Shift', 'P'], action: 'Persona Switcher' },
    { keys: ['Ctrl', 'Tab'], action: 'Workspace Switcher' },
    { keys: ['Ctrl', '/'], action: 'Keyboard Shortcuts' },
  ]},
  { category: 'Chat', items: [
    { keys: ['Enter'], action: 'Send message' },
    { keys: ['Shift', 'Enter'], action: 'New line' },
    { keys: ['/'], action: 'Slash commands' },
    { keys: ['Esc'], action: 'Close overlay' },
  ]},
];

const KeyboardShortcutsHelp = ({ open, onClose }: KeyboardShortcutsHelpProps) => {
  // A11y (WCAG 2.1.1/2.4.3): Escape closes, Tab is trapped within the dialog,
  // focus moves in on open and restores on close — the same shared hook the
  // other modal overlays use. Replaces the prior Escape-only handler.
  const dialogRef = useFocusTrap<HTMLDivElement>(open, onClose);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center"
        onClick={onClose}
      >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
        <motion.div
          ref={dialogRef}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="keyboard-shortcuts-title"
          tabIndex={-1}
          className="relative w-full max-w-lg glass-strong rounded-2xl shadow-2xl p-6 focus:outline-none"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Keyboard className="w-5 h-5 text-honey" />
              <h2 id="keyboard-shortcuts-title" className="text-lg font-display font-semibold text-foreground">Keyboard Shortcuts</h2>
            </div>
            <button onClick={onClose} aria-label="Close keyboard shortcuts" className="p-1 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-5">
            {shortcuts.map(cat => (
              <div key={cat.category}>
                <h3 className="text-xs font-display text-muted-foreground uppercase mb-2">{cat.category}</h3>
                <div className="space-y-1.5">
                  {cat.items.map(item => (
                    <div key={item.action} className="flex items-center justify-between py-1">
                      <span className="text-xs text-foreground">{item.action}</span>
                      <div className="flex items-center gap-1">
                        {item.keys.map((key, i) => (
                          <kbd key={i} className="px-1.5 py-0.5 text-[11px] rounded bg-muted text-muted-foreground font-display min-w-[20px] text-center">
                            {key}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default KeyboardShortcutsHelp;
