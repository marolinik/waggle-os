/**
 * F18 — confirm-gate for the "Never ask" (yolo) approval level.
 *
 * Pins that the confirmation fires ONLY on the transition into `yolo`, and
 * never for the safe levels or a re-select of the already-active level.
 */
import { describe, it, expect } from 'vitest';
import { requiresYoloConfirm, type ApprovalLevel } from './autonomy-confirm';

const LEVELS: ApprovalLevel[] = ['normal', 'trusted', 'yolo'];

describe('requiresYoloConfirm', () => {
  it('gates the transition into yolo from a safer level', () => {
    expect(requiresYoloConfirm('normal', 'yolo')).toBe(true);
    expect(requiresYoloConfirm('trusted', 'yolo')).toBe(true);
  });

  it('does not re-prompt when yolo is already active', () => {
    expect(requiresYoloConfirm('yolo', 'yolo')).toBe(false);
  });

  it('never gates a switch to a safe level', () => {
    for (const current of LEVELS) {
      expect(requiresYoloConfirm(current, 'normal')).toBe(false);
      expect(requiresYoloConfirm(current, 'trusted')).toBe(false);
    }
  });

  it('only ever returns true when the target is yolo', () => {
    for (const current of LEVELS) {
      for (const next of LEVELS) {
        if (requiresYoloConfirm(current, next)) {
          expect(next).toBe('yolo');
          expect(current).not.toBe('yolo');
        }
      }
    }
  });
});
