/**
 * Pairing + per-chat workspace overrides for IM channels.
 *
 * Security model (founder-ratified, see docs/plans/CHANNELS-ARC-2026-07-09.md):
 * deny-by-default. Unknown senders are ignored entirely; the only way in is a
 * short-lived single-use pairing code the owner generates in Settings and
 * sends to the bot from their own IM account. Codes live in memory only —
 * they are 10-minute artifacts of a local desktop process, not durable state.
 *
 * The allowlist and per-chat workspace overrides are NOT secrets, so they
 * persist to <dataDir>/channels/channels.json (atomic tmp+rename writes).
 * Bot tokens never touch this file — vault only.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ChannelConfig, ChannelPlatform } from './types.js';

export interface PairedSender {
  senderId: string;
  senderName?: string;
  pairedAt: number;
}

interface ChannelsFile {
  version: 1;
  allowlist: Partial<Record<ChannelPlatform, PairedSender[]>>;
  /** chatId → workspaceId override, per platform. */
  overrides: Partial<Record<ChannelPlatform, Record<string, string>>>;
  config: Partial<Record<ChannelPlatform, ChannelConfig>>;
}

const EMPTY_FILE: ChannelsFile = { version: 1, allowlist: {}, overrides: {}, config: {} };

export const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;
// Unambiguous alphabet (no 0/O/1/I) — the user retypes this on a phone.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

interface PendingCode {
  code: string;
  platform: ChannelPlatform;
  expiresAt: number;
}

function generateCodeString(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

export class PairingStore {
  private readonly filePath: string;
  private data: ChannelsFile;
  private pending: PendingCode[] = [];

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, 'channels', 'channels.json');
    this.data = this.load();
  }

  private load(): ChannelsFile {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as ChannelsFile;
      if (parsed?.version === 1) {
        return {
          version: 1,
          allowlist: parsed.allowlist ?? {},
          overrides: parsed.overrides ?? {},
          config: parsed.config ?? {},
        };
      }
    } catch {
      /* missing or corrupt file → start empty; first save recreates it */
    }
    return structuredClone(EMPTY_FILE);
  }

  private save(): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmp, this.filePath);
  }

  // ── Pairing codes ────────────────────────────────────────────────────

  /** Owner-side: mint a single-use code for one platform. */
  generateCode(platform: ChannelPlatform): { code: string; expiresAt: number } {
    this.prunePending();
    const entry: PendingCode = {
      code: generateCodeString(),
      platform,
      expiresAt: Date.now() + PAIRING_CODE_TTL_MS,
    };
    this.pending = [...this.pending, entry];
    return { code: entry.code, expiresAt: entry.expiresAt };
  }

  /**
   * Sender-side: redeem a code. Consumes it on success. Case-insensitive —
   * phone keyboards autocapitalize unpredictably.
   */
  consumeCode(
    platform: ChannelPlatform,
    rawCode: string,
    senderId: string,
    senderName?: string,
  ): boolean {
    this.prunePending();
    const code = rawCode.trim().toUpperCase();
    const match = this.pending.find(p => p.platform === platform && p.code === code);
    if (!match) return false;
    this.pending = this.pending.filter(p => p !== match);
    this.addPaired(platform, senderId, senderName);
    return true;
  }

  private prunePending(): void {
    const now = Date.now();
    this.pending = this.pending.filter(p => p.expiresAt > now);
  }

  // ── Allowlist ────────────────────────────────────────────────────────

  isPaired(platform: ChannelPlatform, senderId: string): boolean {
    return (this.data.allowlist[platform] ?? []).some(s => s.senderId === senderId);
  }

  private addPaired(platform: ChannelPlatform, senderId: string, senderName?: string): void {
    if (this.isPaired(platform, senderId)) return;
    const list = this.data.allowlist[platform] ?? [];
    this.data = {
      ...this.data,
      allowlist: {
        ...this.data.allowlist,
        [platform]: [...list, { senderId, senderName, pairedAt: Date.now() }],
      },
    };
    this.save();
  }

  unpair(platform: ChannelPlatform, senderId: string): boolean {
    const list = this.data.allowlist[platform] ?? [];
    const next = list.filter(s => s.senderId !== senderId);
    if (next.length === list.length) return false;
    this.data = {
      ...this.data,
      allowlist: { ...this.data.allowlist, [platform]: next },
    };
    this.save();
    return true;
  }

  listPaired(): Partial<Record<ChannelPlatform, PairedSender[]>> {
    return this.data.allowlist;
  }

  // ── Per-chat workspace overrides ─────────────────────────────────────

  getWorkspaceOverride(platform: ChannelPlatform, chatId: string): string | undefined {
    return this.data.overrides[platform]?.[chatId];
  }

  setWorkspaceOverride(platform: ChannelPlatform, chatId: string, workspaceId: string | null): void {
    const current = { ...(this.data.overrides[platform] ?? {}) };
    if (workspaceId === null) {
      delete current[chatId];
    } else {
      current[chatId] = workspaceId;
    }
    this.data = {
      ...this.data,
      overrides: { ...this.data.overrides, [platform]: current },
    };
    this.save();
  }

  // ── Per-platform config (non-secret) ─────────────────────────────────

  getConfig(platform: ChannelPlatform): ChannelConfig {
    return this.data.config[platform] ?? { enabled: false, defaultWorkspace: 'default' };
  }

  setConfig(platform: ChannelPlatform, config: ChannelConfig): void {
    this.data = {
      ...this.data,
      config: { ...this.data.config, [platform]: config },
    };
    this.save();
  }
}
