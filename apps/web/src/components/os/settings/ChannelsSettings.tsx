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
import {
  adapter,
  type ChannelPairings,
  type ChannelPlatform,
  type ChannelStatus,
} from '@/lib/adapter';
import type { Workspace } from '@/lib/types';

const PLATFORM_META: Record<ChannelPlatform, {
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

function actionError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

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
    <div className="flex max-w-full w-fit flex-col items-center gap-2 rounded-lg bg-white p-3">
      <img className="h-auto max-w-full" src={dataUrl} alt="WhatsApp pairing QR code" width={220} height={220} />
    </div>
  );
}

const ChannelsSettings = () => {
  const [channels, setChannels] = useState<ChannelStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({});
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [pairingCode, setPairingCode] = useState<{ platform: ChannelPlatform; code: string; expiresAt: number } | null>(null);
  const [paired, setPaired] = useState<ChannelPairings>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async (clearError = true) => {
    try {
      const [channelRows, pairedRows] = await Promise.all([
        adapter.getChannels(),
        adapter.getChannelPairings(),
      ]);
      setChannels(channelRows);
      setPaired(pairedRows);
      if (clearError) setError(null);
    } catch (err) {
      setError(actionError(err, 'Could not reach the Waggle service.'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll while the tab is open — WhatsApp QR rotates and transports flap.
  useEffect(() => {
    void refresh(true);
    void adapter.getWorkspaces()
      .then(setWorkspaces)
      .catch(err => setError(actionError(err, 'Could not load workspaces.')));
    pollRef.current = setInterval(() => { void refresh(false); }, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refresh]);

  const saveConfig = async (
    platform: ChannelPlatform,
    body: { enabled?: boolean; defaultWorkspace?: string; secrets?: Record<string, string> },
  ): Promise<boolean> => {
    setBusy(platform);
    try {
      await adapter.saveChannelConfig(platform, body);
      setError(null);
      await refresh(false);
      return true;
    } catch (err) {
      setError(actionError(err, 'Saving channel settings failed.'));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const lifecycle = async (platform: ChannelPlatform, running: boolean) => {
    setBusy(platform);
    try {
      await adapter.setChannelRunning(platform, running);
      setError(null);
      await refresh(false);
    } catch (err) {
      setError(actionError(
        err,
        `Could not ${running ? 'start' : 'stop'} ${PLATFORM_META[platform].label}.`,
      ));
    } finally {
      setBusy(null);
    }
  };

  const mintPairingCode = async (platform: ChannelPlatform) => {
    setBusy(platform);
    try {
      const body = await adapter.createChannelPairingCode(platform);
      setPairingCode({ platform, ...body });
      setError(null);
    } catch (err) {
      setError(actionError(err, 'Could not generate a pairing code.'));
    } finally {
      setBusy(null);
    }
  };

  const revokeSender = async (platform: ChannelPlatform, senderId: string) => {
    setBusy(platform);
    try {
      await adapter.revokeChannelSender(platform, senderId);
      setError(null);
      await refresh(false);
    } catch (err) {
      setError(actionError(err, 'Could not revoke channel access.'));
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
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
        <div className="p-2.5 rounded-lg border border-destructive/40 bg-destructive/5 text-[11px] text-destructive" role="alert">
          {error}
        </div>
      )}

      {channels.map(ch => {
        const meta = PLATFORM_META[ch.platform];
        const isBusy = busy === ch.platform;
        const missingSecrets = meta.secretFields.filter(field => !ch.secrets[field.key]);
        const workspaceKnown = workspaces.some(workspace => workspace.id === ch.config.defaultWorkspace);
        return (
          <section key={ch.platform} className="p-3 rounded-lg bg-secondary/30 border border-border/30 space-y-3" aria-labelledby={`channel-${ch.platform}-title`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h4 id={`channel-${ch.platform}-title`} className="text-xs font-display font-medium text-foreground">{meta.label}</h4>
                <StatusBadge s={ch} />
              </div>
              <div className="flex items-center gap-1.5">
                {ch.running ? (
                  <button
                    type="button"
                    onClick={() => void lifecycle(ch.platform, false)}
                    disabled={isBusy}
                    className="flex min-h-8 items-center gap-1 px-2 py-1 rounded-lg text-[11px] bg-muted/60 text-foreground hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  >
                    <Square className="w-3 h-3" /> Stop
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void lifecycle(ch.platform, true)}
                    disabled={isBusy || missingSecrets.length > 0}
                    title={missingSecrets.length > 0 ? `Save ${missingSecrets.map(field => field.label).join(' and ')} first` : undefined}
                    className="flex min-h-8 items-center gap-1 px-2 py-1 rounded-lg text-[11px] bg-primary/20 text-honey hover:bg-primary/30 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
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

            {!ch.running && missingSecrets.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Save {missingSecrets.map(field => field.label.toLowerCase()).join(' and ')} to enable Start.
              </p>
            )}

            {/* WhatsApp pairing QR (Baileys) */}
            {ch.platform === 'whatsapp' && ch.running && !ch.connected && ch.qr && (
              <WhatsAppQr qr={ch.qr} />
            )}

            {/* Secrets → vault */}
            {meta.secretFields.map(field => (
              <div key={field.key} className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <label htmlFor={`${ch.platform}-${field.key}`} className="block text-[11px] text-muted-foreground mb-0.5">
                    {field.label}{ch.secrets[field.key] ? ` — saved (${ch.secrets[field.key]})` : ''}
                  </label>
                  <input
                    id={`${ch.platform}-${field.key}`}
                    name={field.key}
                    type="password"
                    aria-label={`${meta.label} ${field.label.toLowerCase()}`}
                    autoComplete="off"
                    value={secretDrafts[field.key] ?? ''}
                    onChange={e => setSecretDrafts(d => ({ ...d, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border/40 text-xs text-foreground placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const value = secretDrafts[field.key]?.trim();
                    if (!value) return;
                    void saveConfig(ch.platform, { secrets: { [field.key]: value } })
                      .then(saved => {
                        if (saved) setSecretDrafts(d => ({ ...d, [field.key]: '' }));
                      });
                  }}
                  disabled={isBusy || !secretDrafts[field.key]?.trim()}
                  className="min-h-8 w-full rounded-lg bg-primary/20 px-2.5 py-1.5 text-[11px] text-honey hover:bg-primary/30 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] sm:w-auto"
                >
                  Save
                </button>
              </div>
            ))}

            {/* Non-secret config */}
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
              <label className="flex items-center gap-1.5 text-[11px] text-foreground sm:shrink-0">
                <input
                  aria-label={`${meta.label} start automatically`}
                  type="checkbox"
                  checked={ch.config.enabled}
                  onChange={e => void saveConfig(ch.platform, { enabled: e.target.checked })}
                  disabled={isBusy}
                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                />
                Start automatically
              </label>
              <div className="flex min-w-0 flex-1 flex-col items-stretch gap-1 sm:flex-row sm:items-center sm:gap-1.5">
                <label htmlFor={`${ch.platform}-workspace`} className="text-[11px] text-muted-foreground whitespace-nowrap">Default workspace</label>
                <select
                  id={`${ch.platform}-workspace`}
                  name={`${ch.platform}DefaultWorkspace`}
                  aria-label={`${meta.label} default workspace`}
                  value={ch.config.defaultWorkspace}
                  onChange={e => void saveConfig(ch.platform, { defaultWorkspace: e.target.value })}
                  disabled={isBusy || workspaces.length === 0}
                  className="min-w-0 flex-1 px-2 py-1 rounded-lg bg-background border border-border/40 text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                >
                  {!workspaceKnown && (
                    <option value={ch.config.defaultWorkspace}>{ch.config.defaultWorkspace} (current)</option>
                  )}
                  {workspaces.map(workspace => (
                    <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Pairing */}
            <div className="pt-1 border-t border-border/30 space-y-2">
              <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => void mintPairingCode(ch.platform)}
                  disabled={isBusy || !ch.running}
                  className="flex min-h-8 w-full items-center justify-center gap-1 rounded-lg bg-muted/60 px-2 py-1 text-[11px] text-foreground hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] sm:w-auto"
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
              {!ch.running && (
                <p className="text-[11px] text-muted-foreground">Start the channel before generating a pairing code.</p>
              )}
              {(paired[ch.platform] ?? []).length > 0 && (
                <div className="space-y-1">
                  {(paired[ch.platform] ?? []).map(s => (
                    <div key={s.senderId} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="min-w-0 break-all text-muted-foreground">
                        {s.senderName ? `${s.senderName} · ` : ''}{s.senderId}
                      </span>
                      <button
                        type="button"
                        onClick={() => void revokeSender(ch.platform, s.senderId)}
                        disabled={isBusy}
                        className="flex min-h-8 items-center gap-1 px-1.5 py-0.5 rounded text-destructive hover:bg-destructive/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                        title="Revoke access"
                      >
                        <Trash2 className="w-3 h-3" /> Revoke
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default ChannelsSettings;
