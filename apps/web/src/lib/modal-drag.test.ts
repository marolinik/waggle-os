/**
 * P15 regression — drag-constraint computation for centered modals.
 */

import { describe, it, expect } from 'vitest';
import { computeDragConstraints } from './modal-drag';

describe('computeDragConstraints', () => {
  it('gives symmetric bounds for a centered modal smaller than the viewport', () => {
    const c = computeDragConstraints(1200, 800, 600, 400);
    expect(c.left).toBe(-300);
    expect(c.right).toBe(300);
    expect(c.top).toBe(-200);
    expect(c.bottom).toBe(200);
  });

  it('zeros out when modal equals container exactly', () => {
    const c = computeDragConstraints(800, 600, 800, 600);
    expect(c).toEqual({ top: 0, left: 0, right: 0, bottom: 0 });
  });

  it('zeros out when modal is larger than container (no dragging)', () => {
    const c = computeDragConstraints(400, 300, 600, 500);
    expect(c).toEqual({ top: 0, left: 0, right: 0, bottom: 0 });
  });

  it('handles a tall portrait viewport', () => {
    const c = computeDragConstraints(400, 1200, 300, 400);
    expect(c.left).toBe(-50);
    expect(c.right).toBe(50);
    expect(c.top).toBe(-400);
    expect(c.bottom).toBe(400);
  });

  it('handles a landscape viewport with a narrow modal', () => {
    const c = computeDragConstraints(1920, 1080, 400, 300);
    expect(c.left).toBe(-760);
    expect(c.right).toBe(760);
    expect(c.top).toBe(-390);
    expect(c.bottom).toBe(390);
  });

  it('never returns negative "right" or "bottom" (violates motion contract)', () => {
    const c = computeDragConstraints(100, 100, 200, 200);
    expect(c.right).toBeGreaterThanOrEqual(0);
    expect(c.bottom).toBeGreaterThanOrEqual(0);
    expect(c.left).toBeLessThanOrEqual(0);
    expect(c.top).toBeLessThanOrEqual(0);
  });

  it('is symmetric in every axis when modal fits', () => {
    const c = computeDragConstraints(1000, 800, 500, 400);
    expect(c.left).toBe(-c.right);
    expect(c.top).toBe(-c.bottom);
  });
});
