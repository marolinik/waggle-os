import { useState } from "react";
import { Plus } from "lucide-react";

interface Note {
  id: number;
  title: string;
  content: string;
}

const NotesApp = () => {
  const [notes, setNotes] = useState<Note[]>([
    { id: 1, title: "Welcome to Waggle", content: "This is your AI-powered operating system. Explore the apps in the dock!" },
  ]);
  const [selected, setSelected] = useState<number>(1);

  const active = notes.find((n) => n.id === selected);

  const addNote = () => {
    const id = Date.now();
    setNotes((prev) => [...prev, { id, title: "New Note", content: "" }]);
    setSelected(id);
  };

  return (
    <div className="flex h-full">
      <div className="w-40 border-r border-border/50 p-2 space-y-1 shrink-0">
        <button onClick={addNote} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 mb-2">
          <Plus className="w-3 h-3" /> New
        </button>
        {notes.map((n) => (
          <button
            key={n.id}
            onClick={() => setSelected(n.id)}
            className={`w-full text-left text-xs px-2 py-1.5 rounded-lg truncate transition-colors ${
              selected === n.id ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {n.title}
          </button>
        ))}
      </div>
      {active && (
        <div className="flex-1 p-4 flex flex-col gap-2">
          <input
            value={active.title}
            onChange={(e) =>
              setNotes((prev) => prev.map((n) => (n.id === active.id ? { ...n, title: e.target.value } : n)))
            }
            className="bg-transparent font-display font-semibold text-foreground outline-none text-sm"
          />
          <textarea
            value={active.content}
            onChange={(e) =>
              setNotes((prev) => prev.map((n) => (n.id === active.id ? { ...n, content: e.target.value } : n)))
            }
            className="flex-1 bg-transparent text-sm text-secondary-foreground outline-none resize-none"
            placeholder="Start typing..."
          />
        </div>
      )}
    </div>
  );
};

export default NotesApp;
