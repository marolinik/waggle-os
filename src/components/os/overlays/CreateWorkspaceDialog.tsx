import { useState } from 'react';
import { X, Plus, Users } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { PERSONAS } from '@/lib/personas';
import { motion, AnimatePresence } from 'framer-motion';

interface CreateWorkspaceDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: { name: string; group: string; persona?: string; shared?: boolean }) => void;
}

const GROUPS = ['Personal', 'Work', 'Research', 'Team'];

const CreateWorkspaceDialog = ({ open, onClose, onCreate }: CreateWorkspaceDialogProps) => {
  const [name, setName] = useState('');
  const [group, setGroup] = useState('Personal');
  const [selectedPersona, setSelectedPersona] = useState<string | undefined>();
  const [shared, setShared] = useState(false);

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreate({ name: name.trim(), group, persona: selectedPersona, shared });
    setName('');
    setGroup('Personal');
    setSelectedPersona(undefined);
    setShared(false);
    onClose();
  };

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
          className="relative w-full max-w-md glass-strong rounded-2xl shadow-2xl p-6"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-display font-semibold text-foreground">Create Workspace</h2>
            <button onClick={onClose} className="p-1 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Workspace Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="My Workspace"
                className="w-full bg-muted/50 border border-border/50 rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Group</label>
              <div className="flex gap-2">
                {GROUPS.map(g => (
                  <button
                    key={g}
                    onClick={() => setGroup(g)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-display transition-colors ${
                      group === g ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/70'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Persona (optional)</label>
              <div className="grid grid-cols-4 gap-2">
                {PERSONAS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPersona(selectedPersona === p.id ? undefined : p.id)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${
                      selectedPersona === p.id
                        ? 'bg-primary/20 border border-primary/50 scale-105'
                        : 'bg-secondary/30 border border-transparent hover:bg-secondary/50'
                    }`}
                  >
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={p.avatar} />
                      <AvatarFallback className="text-[8px] bg-primary/20">{p.name[0]}</AvatarFallback>
                    </Avatar>
                    <span className="text-[9px] text-muted-foreground truncate w-full text-center">{p.name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </div>
            </div>

            {/* Share with team toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border/30">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-400" />
                <div>
                  <p className="text-xs font-display text-foreground">Share with team</p>
                  <p className="text-[10px] text-muted-foreground">Make visible to all team members</p>
                </div>
              </div>
              <button
                onClick={() => setShared(!shared)}
                className={`w-10 h-5 rounded-full transition-colors ${shared ? 'bg-sky-500' : 'bg-muted'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-foreground transition-transform mx-0.5 ${shared ? 'translate-x-5' : ''}`} />
              </button>
            </div>

          <div className="flex justify-end gap-2 mt-6">
            <button onClick={onClose} className="px-4 py-2 text-xs font-display rounded-lg text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!name.trim()}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-display rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Create
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default CreateWorkspaceDialog;
