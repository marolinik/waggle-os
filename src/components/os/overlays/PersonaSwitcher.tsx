import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { PERSONAS } from '@/lib/personas';
import { motion, AnimatePresence } from 'framer-motion';

interface PersonaSwitcherProps {
  open: boolean;
  onClose: () => void;
  currentPersona?: string;
  onSelect: (personaId: string) => void;
}

const PersonaSwitcher = ({ open, onClose, currentPersona, onSelect }: PersonaSwitcherProps) => {
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
          className="relative w-full max-w-sm glass-strong rounded-2xl shadow-2xl p-5"
          onClick={e => e.stopPropagation()}
        >
          <h2 className="text-sm font-display font-semibold text-foreground mb-4">Switch Persona</h2>
          <div className="grid grid-cols-2 gap-2">
            {PERSONAS.map(p => (
              <button
                key={p.id}
                onClick={() => { onSelect(p.id); onClose(); }}
                className={`flex items-center gap-3 p-3 rounded-xl transition-all text-left ${
                  currentPersona === p.id
                    ? 'bg-primary/20 border border-primary/50'
                    : 'bg-secondary/30 border border-transparent hover:bg-secondary/50'
                }`}
              >
                <Avatar className="w-10 h-10 shrink-0">
                  <AvatarImage src={p.avatar} />
                  <AvatarFallback className="text-[10px] bg-primary/20">{p.name[0]}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-xs font-display font-medium text-foreground truncate">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{p.description}</p>
                </div>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-3 text-center">⌘⇧P to toggle</p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PersonaSwitcher;
