import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Loader2, Search, Check, Plus, Save, Wrench } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { ToolDef } from './types';

interface CreateAgentFormProps {
  allTools: ToolDef[];
  onSave: (data: { name: string; description: string; icon: string; tools: string[]; systemPrompt: string }) => void;
  onCancel: () => void;
  generating: boolean;
  onGenerate: (prompt: string) => Promise<{ name: string; description: string; systemPrompt: string; tools: string[] } | null>;
  initialData?: { name: string; description: string; icon: string; tools: string[]; systemPrompt: string };
  editMode?: boolean;
}

const CreateAgentForm = ({ allTools, onSave, onCancel, onGenerate, initialData, editMode }: CreateAgentFormProps) => {
  const [name, setName] = useState(initialData?.name ?? '');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [icon, setIcon] = useState(initialData?.icon ?? '🤖');
  const [systemPrompt, setSystemPrompt] = useState(initialData?.systemPrompt ?? '');
  const [selectedTools, setSelectedTools] = useState<string[]>(initialData?.tools ?? []);
  const [toolSearch, setToolSearch] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const filteredTools = allTools.filter(t =>
    t.name.toLowerCase().includes(toolSearch.toLowerCase()) ||
    (t.description ?? '').toLowerCase().includes(toolSearch.toLowerCase())
  );

  const toggleTool = (toolName: string) => {
    setSelectedTools(prev => prev.includes(toolName) ? prev.filter(t => t !== toolName) : [...prev, toolName]);
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const result = await onGenerate(aiPrompt);
      if (result) {
        setName(result.name);
        setDescription(result.description);
        setSystemPrompt(result.systemPrompt);
        setSelectedTools(result.tools.filter(t => allTools.some(at => at.name === t)));
      }
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 flex flex-col gap-3 overflow-y-auto scrollbar-thin"
    >
      {/* AI Generation */}
      <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="text-[11px] font-display font-semibold text-primary uppercase tracking-wider">Generate with AI</span>
        </div>
        <div className="flex gap-2">
          <Input
            value={aiPrompt}
            onChange={e => setAiPrompt(e.target.value)}
            placeholder="e.g. A code reviewer that checks for security issues..."
            className="flex-1 text-xs bg-background/50"
            onKeyDown={e => e.key === 'Enter' && handleAiGenerate()}
          />
          <button
            onClick={handleAiGenerate}
            disabled={aiLoading || !aiPrompt.trim()}
            className="px-3 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
          >
            {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            Generate
          </button>
        </div>
      </div>

      {/* Form Fields */}
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 items-center">
        <label className="text-[11px] text-muted-foreground font-display uppercase tracking-wider">Icon</label>
        <Input value={icon} onChange={e => setIcon(e.target.value)} className="w-12 text-center text-lg bg-secondary/30" />

        <label className="text-[11px] text-muted-foreground font-display uppercase tracking-wider">Name</label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Agent name" className="text-xs bg-secondary/30" />

        <label className="text-[11px] text-muted-foreground font-display uppercase tracking-wider">Description</label>
        <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this agent do?" className="text-xs bg-secondary/30" />

        <label className="text-[11px] text-muted-foreground font-display uppercase tracking-wider self-start pt-2">System Prompt</label>
        <textarea
          value={systemPrompt}
          onChange={e => setSystemPrompt(e.target.value)}
          placeholder="Instructions for this agent..."
          rows={4}
          className="text-xs bg-secondary/30 border border-border/30 rounded-lg px-3 py-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background resize-none"
        />
      </div>

      {/* Tool Picker */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[11px] font-display uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Wrench className="w-3 h-3" /> Tools ({selectedTools.length} selected)
          </h4>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              value={toolSearch}
              onChange={e => setToolSearch(e.target.value)}
              placeholder="Filter tools..."
              className="text-[11px] bg-secondary/30 pl-6 pr-2 py-1 h-auto w-36"
            />
          </div>
        </div>
        <div className="max-h-32 overflow-y-auto scrollbar-thin space-y-1 rounded-lg border border-border/20 p-2 bg-secondary/10">
          {filteredTools.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic py-2 text-center">No tools found</p>
          ) : (
            filteredTools.map(tool => (
              <button
                key={tool.name}
                onClick={() => toggleTool(tool.name)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[11px] transition-colors ${
                  selectedTools.includes(tool.name)
                    ? 'bg-primary/15 text-foreground'
                    : 'hover:bg-secondary/40 text-muted-foreground'
                }`}
              >
                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                  selectedTools.includes(tool.name) ? 'bg-primary border-primary' : 'border-border/50'
                }`}>
                  {selectedTools.includes(tool.name) && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                </div>
                <span className="font-mono truncate">{tool.name}</span>
                {tool.description && <span className="text-muted-foreground truncate ml-auto">— {tool.description}</span>}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2 border-t border-border/20">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs rounded-lg bg-secondary/40 text-muted-foreground hover:bg-secondary/60">
          Cancel
        </button>
        <button
          onClick={() => onSave({ name, description, icon, tools: selectedTools, systemPrompt })}
          disabled={!name.trim() || !systemPrompt.trim()}
          className="px-4 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
        >
          {editMode ? <Save className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          {editMode ? 'Save Changes' : 'Create Agent'}
        </button>
      </div>
    </motion.div>
  );
};

export default CreateAgentForm;
