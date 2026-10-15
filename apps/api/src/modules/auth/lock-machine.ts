import { LOCK_DURATION_MS, LOCK_FAIL_THRESHOLD } from '../../config/env';

export type UserStatus = 'ACTIVE' | 'LOCKED' | 'DISABLED';

export type LockState = {
  status: UserStatus;
  failedLoginCount: number;
  lockedUntil: Date | null;
};

export type LockEvent =
  | { type: 'PRE_CHECK'; now: Date }
  | { type: 'FAIL'; now: Date }
  | { type: 'SUCCESS' }
  | { type: 'RESET' };

export function applyLockEvent(state: LockState, event: LockEvent): LockState {
  if (state.status === 'DISABLED') {
    if (event.type === 'RESET') {
      return { ...state, failedLoginCount: 0, lockedUntil: null };
    }
    return { ...state };
  }

  if (event.type === 'PRE_CHECK') {
    if (state.status === 'LOCKED') {
      const until = state.lockedUntil;
      if (!until || until.getTime() <= event.now.getTime()) {
        return { status: 'ACTIVE', failedLoginCount: 0, lockedUntil: null };
      }
    }
    return { ...state };
  }

  if (event.type === 'FAIL') {
    const count = state.failedLoginCount + 1;
    if (count >= LOCK_FAIL_THRESHOLD) {
      return {
        status: 'LOCKED',
        failedLoginCount: count,
        lockedUntil: new Date(event.now.getTime() + LOCK_DURATION_MS),
      };
    }
    return { ...state, failedLoginCount: count };
  }

  if (event.type === 'SUCCESS' || event.type === 'RESET') {
    return { status: 'ACTIVE', failedLoginCount: 0, lockedUntil: null };
  }

  return { ...state };
}

export function isCurrentlyLocked(state: LockState, now: Date): boolean {
  if (state.status !== 'LOCKED') {
    return false;
  }
  return !!state.lockedUntil && state.lockedUntil.getTime() > now.getTime();
}
