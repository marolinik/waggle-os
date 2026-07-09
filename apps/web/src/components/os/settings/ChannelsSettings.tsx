/**
 * Settings → Channels — connect Waggle to Slack / Telegram / WhatsApp /
 * Discord (docs/plans/CHANNELS-ARC-2026-07-09.md P4).
 *
 * Talks to the sidecar's /api/channels surface. Security model mirrored in
 * copy: deny-by-default pairing (mint a code here, DM it to the bot), bot
 * tokens go straight to the vault (reads come back masked). WhatsApp shows
 * the founder-mandated ban-risk disclosure and renders Baileys' pairing QR.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, MessageCircle, Play, RefreshCw, Square, Trash2 } from 'lucide-react';
import QRCode from 'qrcode';
import { adapter } from '@/lib/adapter';

type Platform = 'telegram' | 'discord' | 'slack' | 'whatsapp';

interface ChannelStatus {
  platform: Platform;
  running: boolean;
  connected: boolean;
  lastError?: string;
  qr?: string;
  paired?: boolean;
  config: { enabled: boolean; defaultWorkspace: string };
  secrets: Record<string, string | null>;
}

interface PairedSender {
  senderId: string;
  senderName?: string;
  pairedAt: number;
}

const PLATFORM_META: Record<Platform, {
  label: string;
  secretFields: Array<{ key: string; label: string; placeholder: string }>;
  setupHint: string;
}> = {
  telegram: {
    label: 'Telegram',
    secretFields: [{ key: 'telegram_bot_token', label: 'Bot token', placeholder: '123456:ABC… (from @BotFather)' }],
    setupHint: 'Create a bot with @BotFather, paste its token, then DM your bot /pair <code>.',
  },
  discord: {
    label: 'Discord',
    secretFields: [{ key: 'discord_bot_token', label: 'Bot token', placeholder: 'Bot token from the developer portal' }],
    setupHint: 'Create an app at discord.com/developers, enable the MESSAGE CONTENT intent, invite the bot to your server, then send /pair <code>.',
  },
  slack: {
    label: 'Slack',
    secretFields: [
      { key: 'slack_app_token', label: 'App token', placeholder: 'xapp-… (Socket Mode, connections:write)' },
      { key: 'slack_bot_token', label: 'Bot token', placeholder: 'xoxb-… (chat:write)' },
    ],
    setupHint: 'Enable Socket Mode on your Slack app, subscribe to message.im / message.channels, then DM the bot /pair <code>.',
  },
  whatsapp: {
    label: 'WhatsApp',
    secretFields: [],
    setupHint: 'Enable and start, then scan the QR with WhatsApp → Linked Devices. Message yourself or the linked number /pair <code>.',
  },
};

const serverUrl = () => adapter.getServerUrl();

function StatusBadge({ s }: { s: ChannelStatus }) {
  const tone = s.connected
    ? 'bg-green-500/15 text-green-500'
    : s.running
      ? 'bg-primary/15 text-honey'
      : 'bg-muted text-muted-foreground';
  const label = s.connected ? 'Connected' : s.running ? 'Connecting…' : 'Off';
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-display ${tone}`}>{label}</span>;
}

/** Renders a Baileys pairing string as a QR image. */
function WhatsAppQr({ qr }: { qr: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(qr, { margin: 1, width: 220 })
      .then(url => { if (alive) setDataUrl(url); })
      .catch(() => { if (alive) setDataUrl(null); });
    return () => { alive = false; };
  }, [qr]);
  if (!dataUrl) return null;
  return (
    <div className="flex flex-col items-center gap-2 p-3 rounded-xl bg-white w-fit">
      <img src={dataUrl} alt="WhatsApp pairing QR code" width={220} height={220} />
    </div>
  );
}

const ChannelsSettings = () => {
  const [channels, setChannels] = useState<ChannelStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({});
  const [workspaceDrafts, setWorkspaceDrafts] = useState<Partial<Record<Platform, string>>>({});
  const [pairingCode, setPairingCode] = useState<{ platform: Platform; code: string; expiresAt: number } | null>(null);
  const [paired, setPaired] = useState<Partial<Record<Platform, PairedSender[]>>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [chRes, pairRes] = await Promise.all([
        fetch(`${serverUrl()}/api/channels`),
        fetch(`${serverUrl()}/api/channels/pairing`),
      ]);
      if (chRes.ok) setChannels(await chRes.json() as ChannelStatus[]);
      if (pairRes.ok) setPaired(await pairRes.json() as Partial<Record<Platform, PairedSender[]>>);
      setError(null);
    } catch {
      setError('Could not reach the Waggle service.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll while the tab is open — WhatsApp QR rotates and transports flap.
  useEffect(() => {
    void refresh();
    pollRef.current = setInterval(() => { void refresh(); }, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refresh]);

  const saveConfig = async (platform: Platform, body: Record<string, unknown>) => {
    setBusy(platform);
    try {
      const res = await fetch(`${serverUrl()}/api/channels/${platform}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null) as { error?: string } | null;
        setError(detail?.error ?? 'Saving channel settings failed.');
        return;
      }
      setError(null);
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const lifecycle = async (platform: Platform, action: 'start' | 'stop') => {
    setBusy(platform);
    try {
      const res = await fetch(`${serverUrl()}/api/channels/${platform}/${action}`, { method: 'POST' });
      if (!res.ok) {
        const detail = await res.json().catch(() => null) as { error?: string } | null;
        setError(detail?.error ?? `Could not ${action} ${PLATFORM_META[platform].label}.`);
      } else {
        setError(null);
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const mintPairingCode = async (platform: Platform) => {
    const res = await fetch(`${serverUrl()}/api/channels/pairing-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform }),
    });
    if (res.ok) {
      const body = await res.json() as { code: string; expiresAt: number };
      setPairingCode({ platform, ...body });
    }
  };

  const revokeSender = async (platform: Platform, senderId: string) => {
    await fetch(`${serverUrl()}/api/channels/pairing`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, senderId }),
    });
    await refresh();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading channels…
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="settings-channels">
      <div>
        <h3 className="text-sm font-display font-semibold text-foreground flex items-center gap-2">
          <MessageCircle className="w-4 h-4" /> Channels
        </h3>
        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
          Talk to your Waggle agent from Slack, Telegram, WhatsApp, or Discord. Nobody can reach it
          until they pair: generate a code below and send <code className="text-foreground">/pair &lt;code&gt;</code> to
          the bot from your own account. In any chat, <code className="text-foreground">/workspace</code> switches
          which workspace answers.
        </p>
      </div>

      {error && (
        <div className="p-2.5 rounded-xl border border-destructive/40 bg-destructive/5 text-[11px] text-destructive">
          {error}
        </div>
      )}

      {channels.map(ch => {
        const meta = PLATFORM_META[ch.platform];
        const isBusy = busy === ch.platform;
        return (
          <div key={ch.platform} className="p-3 rounded-xl bg-secondary/30 border border-border/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-xs font-display font-medium text-foreground">{meta.label}</p>
                <StatusBadge s={ch} />
              </div>
              <div className="flex items-center gap-1.5">
                {ch.running ? (
                  <button
                    onClick={() => void lifecycle(ch.platform, 'stop')}
                    disabled={isBusy}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] bg-muted/60 text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    <Square className="w-3 h-3" /> Stop
                  </button>
                ) : (
                  <button
                    onClick={() => void lifecycle(ch.platform, 'start')}
                    disabled={isBusy}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] bg-primary/20 text-honey hover:bg-primary/30 disabled:opacity-50"
                  >
                    <Play className="w-3 h-3" /> Start
                  </button>
                )}
              </div>
            </div>

            {ch.platform === 'whatsapp' && (
              <div className="p-2.5 rounded-lg border border-destructive/40 bg-destructive/5 text-[11px] text-destructive leading-relaxed">
                <strong>Heads-up:</strong> WhatsApp support uses an unofficial client (Baileys) that
                violates WhatsApp&rsquo;s Terms of Service. Accounts can be <strong>banned</strong>.
                Strongly consider linking a <strong>secondary number</strong>, not your personal one.
              </div>
            )}

            <p className="text-[11px] text-muted-foreground leading-relaxed">{meta.setupHint}</p>

            {ch.lastError && !ch.connected && (
              <p className="text-[11px] text-destructive">Last error: {ch.lastError}</p>
            )}

            {/* WhatsApp pairing QR (Baileys) */}
            {ch.platform === 'whatsapp' && ch.running && !ch.connected && ch.qr && (
              <WhatsAppQr qr={ch.qr} />
            )}

            {/* Secrets → vault */}
            {meta.secretFields.map(field => (
              <div key={field.key} className="flex items-center gap-2">
                <div className="flex-1">
                  <p className="text-[11px] text-muted-foreground mb-0.5">
                    {field.label}{ch.secrets[field.key] ? ` — saved (${ch.secrets[field.key]})` : ''}
                  </p>
                  <input
                    type="password"
                    value={secretDrafts[field.key] ?? ''}
                    onChange={e => setSecretDrafts(d => ({ ...d, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border/40 text-xs text-foreground placeholder:text-muted-foreground/50"
                  />
                </div>
                <button
                  onClick={() => {
                    const value = secretDrafts[field.key]?.trim();
                    if (!value) return;
                    void saveConfig(ch.platform, { secrets: { [field.key]: value } })
                      .then(() => setSecretDrafts(d => ({ ...d, [field.key]: '' })));
                  }}
                  disabled={isBusy || !secretDrafts[field.key]?.trim()}
                  className="mt-4 px-2.5 py-1.5 rounded-lg text-[11px] bg-primary/20 text-honey hover:bg-primary/30 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            ))}

            {/* Non-secret config */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-[11px] text-foreground">
                <input
                  type="checkbox"
                  checked={ch.config.enabled}
                  onChange={e => void saveConfig(ch.platform, { enabled: e.target.checked })}
                  disabled={isBusy}
                />
                Start automatically
              </label>
              <div className="flex items-center gap-1.5 flex-1">
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">Default workspace</span>
                <input
                  value={workspaceDrafts[ch.platform] ?? ch.config.defaultWorkspace}
                  onChange={e => setWorkspaceDrafts(d => ({ ...d, [ch.platform]: e.target.value }))}
                  onBlur={() => {
                    const draft = workspaceDrafts[ch.platform]?.trim();
                    if (draft && draft !== ch.config.defaultWorkspace) {
                      void saveConfig(ch.platform, { defaultWorkspace: draft });
                    }
                  }}
                  className="flex-1 px-2 py-1 rounded-lg bg-background border border-border/40 text-[11px] text-foreground"
                />
              </div>
            </div>

            {/* Pairing */}
            <div className="pt-1 border-t border-border/30 space-y-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void mintPairingCode(ch.platform)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] bg-muted/60 text-foreground hover:bg-muted"
                >
                  <RefreshCw className="w-3 h-3" /> Generate pairing code
                </button>
                {pairingCode?.platform === ch.platform && pairingCode.expiresAt > Date.now() && (
                  <span className="text-[11px] text-foreground">
                    Send <code className="px-1.5 py-0.5 rounded bg-primary/15 text-honey font-mono">/pair {pairingCode.code}</code>
                    {' '}to the bot (valid ~10 min)
                  </span>
                )}
              </div>
              {(paired[ch.platform] ?? []).length > 0 && (
                <div className="space-y-1">
                  {(paired[ch.platform] ?? []).map(s => (
                    <div key={s.senderId} className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">
                        {s.senderName ? `${s.senderName} · ` : ''}{s.senderId}
                      </span>
                      <button
                        onClick={() => void revokeSender(ch.platform, s.senderId)}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-destructive hover:bg-destructive/10"
                        title="Revoke access"
                      >
                        <Trash2 className="w-3 h-3" /> Revoke
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ChannelsSettings;
