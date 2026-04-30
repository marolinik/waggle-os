import { describe, it, expect } from 'vitest';
import { computeCascadePosition } from './window-cascade';

describe('computeCascadePosition', () => {
  const desktop = { width: 1920, height: 1080 };
  const small = { width: 1024, height: 720 };

  it('places the first window (offset 0) near the viewport center', () => {
    const pos = computeCascadePosition({ cascadeOffset: 0, viewport: desktop });
    // 1920/2 - 600/2 = 660, 1080/2 - 480/2 = 300
    expect(pos).toEqual({ x: 660, y: 300 });
  });

  it('cascades the next window 30px right and 30px down', () => {
    const a = computeCascadePosition({ cascadeOffset: 0, viewport: desktop });
    const b = computeCascadePosition({ cascadeOffset: 1, viewport: desktop });
    expect(b.x - a.x).toBe(30);
    expect(b.y - a.y).toBe(30);
  });

  it('wraps the cascade when the next slot would push the window off-screen', () => {
    // On the small viewport (1024x720), the slot count is small. The 100th
    // window must wrap back into a real on-screen position, not fly off the
    // bottom-right.
    const wrapped = computeCascadePosition({ cascadeOffset: 100, viewport: small });
    expect(wrapped.x).toBeGreaterThanOrEqual(60);
    expect(wrapped.y).toBeGreaterThanOrEqual(60);
    expect(wrapped.x + 600).toBeLessThanOrEqual(small.width);
    expect(wrapped.y + 480).toBeLessThanOrEqual(small.height);
  });

  it('floors the base to minMargin when the viewport is narrower than the typical window', () => {
    const tiny = { width: 400, height: 400 };
    const pos = computeCascadePosition({ cascadeOffset: 0, viewport: tiny });
    expect(pos).toEqual({ x: 60, y: 60 });
  });

  it('is idempotent — same input always returns the same position', () => {
    const a = computeCascadePosition({ cascadeOffset: 5, viewport: desktop });
    const b = computeCascadePosition({ cascadeOffset: 5, viewport: desktop });
    expect(a).toEqual(b);
  });

  it('handles negative cascadeOffset by wrapping into the positive slot range', () => {
    const pos = computeCascadePosition({ cascadeOffset: -1, viewport: desktop });
    expect(pos.x).toBeGreaterThanOrEqual(60);
    expect(pos.y).toBeGreaterThanOrEqual(60);
  });
});
