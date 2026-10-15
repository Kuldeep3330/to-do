import { describe, expect, it } from 'vitest';
import { homeFor, isAdmin, isStaff, safeNext } from './use-auth';

const user = (roles: string[]) => ({
  id: '1',
  email: 'a@b.c',
  name: 'A',
  phone: '+919876543210',
  roles,
});

describe('safeNext', () => {
  it('allows relative paths', () => {
    expect(safeNext('/admin/leads?x=1')).toBe('/admin/leads?x=1');
  });
  it.each(['//evil.com', 'https://evil.com', '/\\evil.com', '', null, undefined])('rejects %s', (v) => {
    expect(safeNext(v as string | null, '/')).toBe('/');
  });
});

describe('roles', () => {
  it('detects staff and admin', () => {
    expect(isStaff(user(['CUSTOMER']))).toBe(false);
    expect(isStaff(user(['SALES_AGENT']))).toBe(true);
    expect(isAdmin(user(['SALES_AGENT']))).toBe(false);
    expect(isAdmin(user(['ADMIN']))).toBe(true);
    expect(isStaff(null)).toBe(false);
  });
  it('picks the landing page', () => {
    expect(homeFor(user(['SUPER_ADMIN']))).toBe('/admin');
    expect(homeFor(user(['CUSTOMER']))).toBe('/account');
  });
});
