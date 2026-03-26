import { useState } from "react";

const TerminalApp = () => {
  const [lines, setLines] = useState<string[]>([
    "Waggle OS v1.0.0 — Terminal",
    "Type 'help' for available commands.",
    "",
  ]);
  const [input, setInput] = useState("");

  const handleCommand = (cmd: string) => {
    const trimmed = cmd.trim().toLowerCase();
    let output: string[] = [];
    switch (trimmed) {
      case "help":
        output = ["Available commands: help, date, whoami, clear, waggle"];
        break;
      case "date":
        output = [new Date().toString()];
        break;
      case "whoami":
        output = ["waggle-user@waggle-os"];
        break;
      case "clear":
        setLines([]);
        setInput("");
        return;
      case "waggle":
        output = ["🐝 Buzz buzz! Waggle AI is here to help!"];
        break;
      default:
        output = [`command not found: ${trimmed}`];
    }
    setLines((prev) => [...prev, `$ ${cmd}`, ...output, ""]);
    setInput("");
  };

  return (
    <div className="h-full bg-background/80 p-4 font-mono text-xs overflow-auto">
      {lines.map((line, i) => (
        <div key={i} className={line.startsWith("$") ? "text-primary" : "text-secondary-foreground"}>
          {line || "\u00A0"}
        </div>
      ))}
      <div className="flex items-center text-primary">
        <span className="mr-2">$</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCommand(input)}
          className="flex-1 bg-transparent outline-none text-foreground"
          autoFocus
        />
      </div>
    </div>
  );
};

export default TerminalApp;
