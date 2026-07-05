/**
 * Telegram digest configuration card — Settings → Advanced.
 *
 * FR-2 §UI from the 2026-05-28 addictiveness audit. Wraps the four
 * /api/telegram/* endpoints so a user can self-serve the connection
 * without curl. Persona uplift comes when ScheduledJobs grows an
 * "output channel" dropdown that routes job results to /api/telegram/send;
 * this card is the prerequisite trust + connection surface.
 */

import { useState, useEffect } from 'react';
import { Send, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { adapter } from '@/lib/adapter';

interface TelegramStatus {
  configured: boolean;
  hasToken: boolean;
  hasChatId: boolean;
}

async function fetchStatus(): Promise<TelegramStatus | null> {
  try {
    const r = await fetch(`${adapter.getServerUrl()}/api/telegram/status`);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

const TelegramDigestCard = () => {
  const { toast } = useToast();
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [token, setToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => { fetchStatus().then(setStatus); }, []);

  const save = async () => {
    if (!token && !chatId) {
      toast({ title: 'Nothing to save', description: 'Enter a bot token or chat ID first.' });
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (token) body.botToken = token;
      if (chatId) body.chatId = chatId;
      const r = await fetch(`${adapter.getServerUrl()}/api/telegram/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) {
        toast({ title: 'Save failed', description: data?.error || `HTTP ${r.status}`, variant: 'destructive' });
      } else {
        toast({ title: 'Saved', description: 'Telegram credentials stored in vault.' });
        setToken('');
        setChatId('');
        setStatus(await fetchStatus());
      }
    } catch (err) {
      toast({ title: 'Save failed', description: String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const r = await fetch(`${adapter.getServerUrl()}/api/telegram/test`, { method: 'POST' });
      const data = await r.json();
      if (!r.ok || data?.ok === false) {
        toast({
          title: 'Test failed',
          description: data?.error || `HTTP ${r.status}`,
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Sent ✓', description: 'Check your Telegram for the test message.' });
      }
    } catch (err) {
      toast({ title: 'Test failed', description: String(err), variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const configured = status?.configured ?? false;

  return (
    <div
      className="p-3 rounded-xl bg-secondary/30 border border-border/30 space-y-2.5"
      data-testid="telegram-digest-card"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-display font-medium text-foreground flex items-center gap-1.5">
          <Send className="w-3.5 h-3.5 text-honey" /> Telegram digest
        </p>
        <span
          data-testid="telegram-status-badge"
          className={`text-[10px] px-1.5 py-0.5 rounded-full font-display inline-flex items-center gap-1 ${
            configured
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
              : 'bg-muted text-muted-foreground border border-border/40'
          }`}
        >
          {configured ? <CheckCircle2 className="w-2.5 h-2.5" /> : <AlertCircle className="w-2.5 h-2.5" />}
          {configured ? 'Connected' : 'Not configured'}
        </span>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Push scheduled-job results and daily digests to your Telegram. Create a bot via{' '}
        <a
          href="https://t.me/BotFather"
          target="_blank" rel="noreferrer noopener"
          className="text-honey hover:underline"
        >
          @BotFather
        </a>{' '}
        to get a token, then DM your bot once and read the chat ID from{' '}
        <code className="text-[10px] bg-muted/40 px-1 rounded">api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code>.
      </p>

      <div className="space-y-2">
        <div>
          <label className="text-[10px] font-display text-muted-foreground block mb-1">
            Bot token {status?.hasToken && <span className="text-status-healthy">(saved)</span>}
          </label>
          <div className="relative">
            <Input
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder={status?.hasToken ? '••••••••••• (leave blank to keep)' : 'e.g. 123456789:AAH…'}
              className="text-[11px] pr-7"
              data-testid="telegram-bot-token-input"
            />
            <button
              type="button"
              onClick={() => setShowToken(v => !v)}
              aria-label={showToken ? 'Hide token' : 'Show token'}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            >
              {showToken ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </button>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-display text-muted-foreground block mb-1">
            Chat ID {status?.hasChatId && <span className="text-status-healthy">(saved)</span>}
          </label>
          <Input
            type="text"
            value={chatId}
            onChange={e => setChatId(e.target.value)}
            placeholder={status?.hasChatId ? '••••••' : 'e.g. 123456789 or -1001234567890'}
            className="text-[11px]"
            data-testid="telegram-chat-id-input"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={save}
          disabled={saving || (!token && !chatId)}
          data-testid="telegram-save-btn"
          className="text-[11px] px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/85 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {saving && <Loader2 className="w-3 h-3 animate-spin" />}
          Save
        </button>
        <button
          onClick={sendTest}
          disabled={testing || !configured}
          data-testid="telegram-test-btn"
          className="text-[11px] px-3 py-1.5 rounded-lg bg-secondary border border-border/40 text-foreground hover:bg-secondary/70 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {testing && <Loader2 className="w-3 h-3 animate-spin" />}
          Send test message
        </button>
      </div>
    </div>
  );
};

export default TelegramDigestCard;
