import { Mic } from 'lucide-react';

const VoiceApp = () => (
  <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
    <Mic className="w-10 h-10 opacity-30" />
    <p className="text-sm font-display font-medium">Coming Soon</p>
    <p className="text-xs opacity-70">Talk to your agents, dictate notes, voice commands</p>
  </div>
);

export default VoiceApp;
