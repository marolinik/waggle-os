/**
 * Vitest global setup — loads .env file into process.env for server tests
 * that need DATABASE_URL, REDIS_URL, CLERK_SECRET_KEY, etc.
 * No external dependencies (no dotenv required).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

try {
  const content = readFileSync(resolve(process.cwd(), '.env'), 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    // Don't override existing env vars (CLI > .env)
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
} catch {
  // .env not found — tests will use fallback config values
}
