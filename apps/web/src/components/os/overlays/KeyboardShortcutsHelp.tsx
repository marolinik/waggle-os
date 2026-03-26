import { motion, AnimatePresence } from 'framer-motion';
import { Keyboard, X } from 'lucide-react';

interface KeyboardShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

const shortcuts = [
  { category: 'Navigation', items: [
    { keys: ['⌘', '⇧', '0'], action: 'Dashboard' },
    { keys: ['⌘', '⇧', '1'], action: 'Chat' },
    { keys: ['⌘', '⇧', '2'], action: 'Capabilities' },
    { keys: ['⌘', '⇧', '3'], action: 'Menu' },
    { keys: ['⌘', '⇧', '4'], action: 'Mission Control' },
    { keys: ['⌘', '⇧', '5'], action: 'Memory' },
    { keys: ['⌘', '⇧', '6'], action: 'Events' },
    { keys: ['⌘', '⇧', '7'], action: 'Settings' },
  ]},
  { category: 'Quick Actions', items: [
    { keys: ['⌘', 'K'], action: 'Global Search' },
    { keys: ['⌘', '⇧', 'P'], action: 'Persona Switcher' },
    { keys: ['Ctrl', 'Tab'], action: 'Workspace Switcher' },
    { keys: ['⌘', '?'], action: 'Keyboard Shortcuts' },
  ]},
  { category: 'Chat', items: [
    { keys: ['Enter'], action: 'Send message' },
    { keys: ['⇧', 'Enter'], action: 'New line' },
    { keys: ['/'], action: 'Slash commands' },
    { keys: ['Esc'], action: 'Close overlay' },
  ]},
];

const KeyboardShortcutsHelp = ({ open, onClose }: KeyboardShortcutsHelpProps) => {
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
        <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-lg glass-strong rounded-2xl shadow-2xl p-6"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Keyboard className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-display font-semibold text-foreground">Keyboard Shortcuts</h2>
            </div>
            <button onClick={onClose} className="p-1 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
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
                          <kbd key={i} className="px-1.5 py-0.5 text-[10px] rounded bg-muted text-muted-foreground font-display min-w-[20px] text-center">
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
