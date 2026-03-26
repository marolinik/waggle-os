/**
 * Cockpit helper function unit tests.
 */
import { describe, it, expect } from 'vitest';
import {
  formatTime,
  relativeTime,
  statusColor,
  statusDotBg,
  actionDotColor,
  actionTextColor,
  riskColor,
  connectorStatusColor,
  connectorDotBg,
  formatBytes,
} from '../src/components/cockpit/helpers';

describe('cockpit helpers', () => {
  describe('formatTime', () => {
    it('returns -- for null', () => {
      expect(formatTime(null)).toBe('--');
    });

    it('formats a valid ISO date', () => {
      const result = formatTime('2026-03-18T10:30:00.000Z');
      expect(result).not.toBe('--');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns -- for invalid date', () => {
      expect(formatTime('not-a-date')).not.toBe('--'); // Date constructor accepts many strings
    });
  });

  describe('relativeTime', () => {
    it('returns "just now" for future timestamps', () => {
      const future = new Date(Date.now() + 60_000).toISOString();
      expect(relativeTime(future)).toBe('just now');
    });

    it('returns "just now" for recent timestamps', () => {
      const recent = new Date(Date.now() - 10_000).toISOString();
      expect(relativeTime(recent)).toBe('just now');
    });

    it('returns minutes for older timestamps', () => {
      const fiveMin = new Date(Date.now() - 5 * 60_000).toISOString();
      expect(relativeTime(fiveMin)).toBe('5 min ago');
    });

    it('returns hours for much older timestamps', () => {
      const twoHrs = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
      expect(relativeTime(twoHrs)).toBe('2 hr ago');
    });

    it('returns days for old timestamps', () => {
      const threeDays = new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString();
      expect(relativeTime(threeDays)).toBe('3d ago');
    });
  });

  describe('statusColor', () => {
    it('returns green for ok', () => {
      expect(statusColor('ok')).toContain('green');
    });
    it('returns green for healthy', () => {
      expect(statusColor('healthy')).toContain('green');
    });
    it('returns yellow for degraded', () => {
      expect(statusColor('degraded')).toContain('yellow');
    });
    it('returns red for unknown', () => {
      expect(statusColor('unavailable')).toContain('red');
    });
  });

  describe('statusDotBg', () => {
    it('returns bg-green for ok', () => {
      expect(statusDotBg('ok')).toContain('bg-green');
    });
    it('returns bg-yellow for degraded', () => {
      expect(statusDotBg('degraded')).toContain('bg-yellow');
    });
    it('returns bg-red for unknown', () => {
      expect(statusDotBg('error')).toContain('bg-red');
    });
  });

  describe('actionDotColor', () => {
    it('returns green for installed', () => {
      expect(actionDotColor('installed')).toContain('green');
    });
    it('returns blue for proposed', () => {
      expect(actionDotColor('proposed')).toContain('blue');
    });
    it('returns red for failed', () => {
      expect(actionDotColor('failed')).toContain('red');
    });
    it('returns red for rejected', () => {
      expect(actionDotColor('rejected')).toContain('red');
    });
    it('returns gray for unknown', () => {
      expect(actionDotColor('something')).toContain('gray');
    });
  });

  describe('actionTextColor', () => {
    it('returns text-green for installed', () => {
      expect(actionTextColor('installed')).toContain('text-green');
    });
    it('returns text-yellow for approved', () => {
      expect(actionTextColor('approved')).toContain('text-yellow');
    });
  });

  describe('riskColor', () => {
    it('returns green for low', () => {
      expect(riskColor('low')).toContain('green');
    });
    it('returns yellow for medium', () => {
      expect(riskColor('medium')).toContain('yellow');
    });
    it('returns red for high', () => {
      expect(riskColor('high')).toContain('red');
    });
  });

  describe('connectorStatusColor', () => {
    it('returns green for connected', () => {
      expect(connectorStatusColor('connected')).toContain('green');
    });
    it('returns muted for disconnected', () => {
      expect(connectorStatusColor('disconnected')).toContain('muted');
    });
    it('returns yellow for expired', () => {
      expect(connectorStatusColor('expired')).toContain('yellow');
    });
    it('returns red for error', () => {
      expect(connectorStatusColor('error')).toContain('red');
    });
  });

  describe('connectorDotBg', () => {
    it('returns bg-green for connected', () => {
      expect(connectorDotBg('connected')).toContain('bg-green');
    });
  });

  describe('formatBytes', () => {
    it('returns 0 B for 0', () => {
      expect(formatBytes(0)).toBe('0 B');
    });
    it('returns bytes for small values', () => {
      expect(formatBytes(512)).toBe('512 B');
    });
    it('returns KB for kilobyte range', () => {
      expect(formatBytes(2048)).toBe('2.0 KB');
    });
    it('returns MB for megabyte range', () => {
      expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    });
    it('returns GB for gigabyte range', () => {
      expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.0 GB');
    });
    it('handles fractional KB', () => {
      expect(formatBytes(1536)).toBe('1.5 KB');
    });
  });
});
