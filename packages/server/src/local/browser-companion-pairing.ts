import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

export const BROWSER_COMPANION_CREDENTIAL_VAULT_KEY = 'browser-companion-credential-hash';
export const BROWSER_COMPANION_PAIRING_TTL_MS = 10 * 60 * 1000;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const MAX_REDEEM_ATTEMPTS = 5;

interface PendingPairingCode {
  digest: Buffer;
  expiresAt: number;
  attemptsRemaining: number;
}

export interface RedeemedBrowserCompanionCredential {
  credential: string;
  credentialHash: string;
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function equalDigest(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

function normalizeCode(rawCode: string): string {
  return rawCode.trim().toUpperCase();
}

function generateCode(): string {
  let code = '';
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

export function hashBrowserCompanionCredential(credential: string): string {
  return digest(credential).toString('hex');
}

export function isBrowserCompanionCredentialHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

export function browserCompanionCredentialMatches(
  credential: string,
  expectedHash: string | null,
): boolean {
  if (credential.length < 32 || credential.length > 200 || !isBrowserCompanionCredentialHash(expectedHash)) {
    return false;
  }
  return equalDigest(digest(credential), Buffer.from(expectedHash, 'hex'));
}

export class BrowserCompanionPairing {
  private pending: PendingPairingCode | null = null;

  generateCode(): { code: string; expiresAt: number } {
    const code = generateCode();
    const expiresAt = Date.now() + BROWSER_COMPANION_PAIRING_TTL_MS;
    this.pending = {
      digest: digest(code),
      expiresAt,
      attemptsRemaining: MAX_REDEEM_ATTEMPTS,
    };
    return { code, expiresAt };
  }

  redeem(rawCode: string): RedeemedBrowserCompanionCredential | null {
    const pending = this.pending;
    if (!pending || pending.expiresAt <= Date.now()) {
      this.pending = null;
      return null;
    }

    const matches = equalDigest(digest(normalizeCode(rawCode)), pending.digest);
    if (!matches) {
      pending.attemptsRemaining -= 1;
      if (pending.attemptsRemaining <= 0) this.pending = null;
      return null;
    }

    this.pending = null;
    const credential = randomBytes(32).toString('base64url');
    return {
      credential,
      credentialHash: hashBrowserCompanionCredential(credential),
    };
  }

  clear(): void {
    this.pending = null;
  }
}
