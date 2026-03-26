export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolUse?: ToolUseEvent[];
}

export interface ToolUseEvent {
  name: string;
  status: 'running' | 'done' | 'error' | 'denied' | 'pending_approval';
  result?: string;
}

export interface Settings {
  model: string;
  apiKey: string;
}
