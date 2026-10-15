import { SlidingWindowLimiter } from './sliding-window';

describe('SlidingWindowLimiter', () => {
  it('allows up to max hits inside the window then denies', () => {
    const limiter = new SlidingWindowLimiter();
    const now = 1_000_000;
    expect(limiter.allow('ip:1', 5, 600_000, now)).toBe(true);
    expect(limiter.allow('ip:1', 5, 600_000, now + 1)).toBe(true);
    expect(limiter.allow('ip:1', 5, 600_000, now + 2)).toBe(true);
    expect(limiter.allow('ip:1', 5, 600_000, now + 3)).toBe(true);
    expect(limiter.allow('ip:1', 5, 600_000, now + 4)).toBe(true);
    expect(limiter.allow('ip:1', 5, 600_000, now + 5)).toBe(false);
  });

  it('allows again after the window slides', () => {
    const limiter = new SlidingWindowLimiter();
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect(limiter.allow('ip:1', 5, 600_000, now + i)).toBe(true);
    }
    expect(limiter.allow('ip:1', 5, 600_000, now + 600_001)).toBe(true);
  });

  it('isolates keys', () => {
    const limiter = new SlidingWindowLimiter();
    expect(limiter.allow('phone:a', 3, 3_600_000, 1)).toBe(true);
    expect(limiter.allow('phone:b', 3, 3_600_000, 1)).toBe(true);
  });
});
