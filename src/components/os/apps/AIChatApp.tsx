import { useState } from "react";
import { Send, Sparkles } from "lucide-react";

interface Message {
  role: "user" | "ai";
  content: string;
}

const AIChatApp = () => {
  const [messages, setMessages] = useState<Message[]>([
    { role: "ai", content: "Hello! I'm Waggle AI, your intelligent assistant. How can I help you today? 🐝" },
  ]);
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setInput("");
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { role: "ai", content: "I'm a demo AI assistant. In production, I'd connect to a real AI backend to help you with tasks, answer questions, and more! 🍯" },
      ]);
    }, 800);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              {msg.role === "ai" && <Sparkles className="w-3 h-3 text-primary inline mr-1.5 -mt-0.5" />}
              {msg.content}
            </div>
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-border/50">
        <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask Waggle anything..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          <button onClick={handleSend} className="text-primary hover:text-primary/80 transition-colors">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIChatApp;
