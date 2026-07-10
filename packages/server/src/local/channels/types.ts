/**
 * IM channel adapter contracts — Slack / Telegram / WhatsApp / Discord.
 *
 * A ChannelAdapter owns exactly one platform transport (long-poll, gateway
 * WebSocket, Socket Mode, Baileys). It normalizes inbound platform payloads
 * into ChannelMessage and hands them to the ChannelManager's inbound
 * pipeline; it knows nothing about pairing, workspaces, or the agent loop.
 * See docs/plans/CHANNELS-ARC-2026-07-09.md for the arc spec.
 */

export type ChannelPlatform = 'telegram' | 'discord' | 'slack' | 'whatsapp';

export const CHANNEL_PLATFORMS: readonly ChannelPlatform[] = [
  'telegram', 'discord', 'slack', 'whatsapp',
] as const;

export function isChannelPlatform(v: string): v is ChannelPlatform {
  return (CHANNEL_PLATFORMS as readonly string[]).includes(v);
}

/** One normalized inbound message from any platform. */
export interface ChannelMessage {
  platform: ChannelPlatform;
  /** Platform-native conversation id (Telegram chat_id, Discord channel id…). */
  chatId: string;
  /** Platform-native sender id — the pairing/allowlist key. */
  senderId: string;
  senderName?: string;
  text: string;
  messageId?: string;
}

export interface ChannelAdapterStatus {
  platform: ChannelPlatform;
  running: boolean;
  /** Transport-level health (polling loop alive / WS open). */
  connected: boolean;
  lastError?: string;
  /** Epoch ms of the last successful transport activity. */
  lastActivityAt?: number;
}

/** Inbound sink the manager injects into every adapter. */
export type InboundHandler = (msg: ChannelMessage) => Promise<void>;

export interface ChannelAdapter {
  readonly platform: ChannelPlatform;
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): ChannelAdapterStatus;
  /** Send plain text to a conversation. Implementations chunk to platform limits. */
  send(chatId: string, text: string): Promise<void>;
}

/** Non-secret per-platform config persisted in channels.json (secrets → vault). */
export interface ChannelConfig {
  enabled: boolean;
  /** Workspace id handling messages with no per-chat override. */
  defaultWorkspace: string;
}

/**
 * Minimal structural WebSocket contract shared by the Discord gateway and
 * Slack Socket Mode adapters. `ws`'s WebSocket satisfies it; tests inject
 * scripted fakes through the adapters' wsFactory seam.
 */
export interface WsLike {
  on(event: 'open' | 'message' | 'close' | 'error', cb: (...args: unknown[]) => void): void;
  send(data: string): void;
  close(): void;
}

export type WsFactory = (url: string) => WsLike;

/** Split a reply into ≤limit chunks, preferring paragraph then line breaks. */
export function chunkText(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    const slice = rest.slice(0, limit);
    // Prefer the last blank line, then last newline, then hard cut.
    let cut = slice.lastIndexOf('\n\n');
    if (cut < limit * 0.5) cut = slice.lastIndexOf('\n');
    if (cut < limit * 0.5) cut = limit;
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest.length > 0) chunks.push(rest);
  return chunks;
}
