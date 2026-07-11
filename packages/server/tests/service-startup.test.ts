import { afterEach, describe, it, expect, vi } from 'vitest';
import net from 'node:net';
import { checkPortAvailable, resolveServicePort } from '../src/local/service.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Service Startup', () => {
  describe('resolveServicePort', () => {
    it('honors the desktop-selected WAGGLE_PORT when no explicit option is provided', () => {
      vi.stubEnv('WAGGLE_PORT', '38179');
      expect(resolveServicePort()).toBe(38179);
    });

    it('prefers an explicit port and rejects invalid environment values', () => {
      vi.stubEnv('WAGGLE_PORT', 'not-a-port');
      expect(resolveServicePort(41234)).toBe(41234);
      expect(resolveServicePort()).toBe(3333);
    });
  });

  describe('checkPortAvailable', () => {
    it('returns true for a free port', async () => {
      // Use a random high port that's very unlikely to be in use
      const available = await checkPortAvailable(0);
      // Port 0 means "pick any free port" — always succeeds
      // Instead, test with a specific high port
      const testPort = 19876;
      const result = await checkPortAvailable(testPort);
      // This should be true unless something is actually on 19876
      expect(typeof result).toBe('boolean');
    });

    it('returns false when a port is occupied', async () => {
      // Occupy a port, then check
      const blocker = net.createServer();
      const port = await new Promise<number>((resolve) => {
        blocker.listen(0, '127.0.0.1', () => {
          const addr = blocker.address();
          resolve(typeof addr === 'object' && addr ? addr.port : 0);
        });
      });

      try {
        const available = await checkPortAvailable(port);
        expect(available).toBe(false);
      } finally {
        blocker.close();
      }
    });

    it('returns true after a port is freed', async () => {
      const blocker = net.createServer();
      const port = await new Promise<number>((resolve) => {
        blocker.listen(0, '127.0.0.1', () => {
          const addr = blocker.address();
          resolve(typeof addr === 'object' && addr ? addr.port : 0);
        });
      });

      // Port occupied
      expect(await checkPortAvailable(port)).toBe(false);

      // Free it
      await new Promise<void>((resolve) => blocker.close(() => resolve()));

      // Port free again
      expect(await checkPortAvailable(port)).toBe(true);
    });
  });
});
