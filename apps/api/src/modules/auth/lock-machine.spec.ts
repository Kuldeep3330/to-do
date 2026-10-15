import { applyLockEvent, isCurrentlyLocked, LockState } from './lock-machine';

function active(): LockState {
  return { status: 'ACTIVE', failedLoginCount: 0, lockedUntil: null };
}

describe('lock machine', () => {
  const now = new Date('2026-09-30T12:00:00.000Z');

  it('increments failures until threshold then LOCKED for 15m', () => {
    let s = active();
    for (let i = 0; i < 9; i++) {
      s = applyLockEvent(s, { type: 'FAIL', now });
      expect(s.status).toBe('ACTIVE');
    }
    s = applyLockEvent(s, { type: 'FAIL', now });
    expect(s.status).toBe('LOCKED');
    expect(s.failedLoginCount).toBe(10);
    expect(s.lockedUntil?.getTime()).toBe(now.getTime() + 15 * 60 * 1000);
  });

  it('does not increment while currently locked', () => {
    const until = new Date(now.getTime() + 60_000);
    const s: LockState = { status: 'LOCKED', failedLoginCount: 10, lockedUntil: until };
    expect(isCurrentlyLocked(s, now)).toBe(true);
    const next = applyLockEvent(s, { type: 'PRE_CHECK', now });
    expect(next.status).toBe('LOCKED');
    expect(next.failedLoginCount).toBe(10);
  });

  it('expired LOCKED clears to ACTIVE before password check', () => {
    const expired = new Date(now.getTime() - 1);
    const s: LockState = { status: 'LOCKED', failedLoginCount: 10, lockedUntil: expired };
    const next = applyLockEvent(s, { type: 'PRE_CHECK', now });
    expect(next).toEqual({ status: 'ACTIVE', failedLoginCount: 0, lockedUntil: null });
  });

  it('LOCKED with null lockedUntil is treated as expired', () => {
    const s: LockState = { status: 'LOCKED', failedLoginCount: 10, lockedUntil: null };
    const next = applyLockEvent(s, { type: 'PRE_CHECK', now });
    expect(next.status).toBe('ACTIVE');
  });

  it('success resets count and ACTIVE', () => {
    const s = applyLockEvent(
      { status: 'LOCKED', failedLoginCount: 10, lockedUntil: now },
      { type: 'SUCCESS' },
    );
    expect(s).toEqual({ status: 'ACTIVE', failedLoginCount: 0, lockedUntil: null });
  });

  it('DISABLED never auto-unlocks on PRE_CHECK, FAIL, or SUCCESS', () => {
    const d: LockState = { status: 'DISABLED', failedLoginCount: 3, lockedUntil: null };
    expect(applyLockEvent(d, { type: 'PRE_CHECK', now }).status).toBe('DISABLED');
    expect(applyLockEvent(d, { type: 'FAIL', now }).status).toBe('DISABLED');
    expect(applyLockEvent(d, { type: 'SUCCESS' }).status).toBe('DISABLED');
  });

  it('RESET on DISABLED clears counters but stays DISABLED', () => {
    const d: LockState = { status: 'DISABLED', failedLoginCount: 10, lockedUntil: now };
    const next = applyLockEvent(d, { type: 'RESET' });
    expect(next.status).toBe('DISABLED');
    expect(next.failedLoginCount).toBe(0);
    expect(next.lockedUntil).toBeNull();
  });

  it('RESET on LOCKED becomes ACTIVE', () => {
    const s: LockState = { status: 'LOCKED', failedLoginCount: 10, lockedUntil: now };
    expect(applyLockEvent(s, { type: 'RESET' }).status).toBe('ACTIVE');
  });
});
