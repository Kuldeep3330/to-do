import { describe, expect, it } from 'vitest';
import { ADMIN_NAV_GROUPS, adminCrumbs, isNavActive } from './admin-nav';
import { initialsFor } from './avatar';

const items = ADMIN_NAV_GROUPS.flatMap((g) => g.items);
const find = (label: string) => items.find((i) => i.label === label)!;

describe('isNavActive', () => {
  it('matches the dashboard only on the exact path', () => {
    expect(isNavActive(find('Dashboard'), '/admin')).toBe(true);
    expect(isNavActive(find('Dashboard'), '/admin/leads')).toBe(false);
  });

  it('matches a section and its children but not a look-alike prefix', () => {
    expect(isNavActive(find('Leads'), '/admin/leads')).toBe(true);
    expect(isNavActive(find('Leads'), '/admin/leads/abc')).toBe(true);
    expect(isNavActive(find('Leads'), '/admin/leadsx')).toBe(false);
  });
});

describe('adminCrumbs', () => {
  it('falls back to the dashboard', () => {
    expect(adminCrumbs('/admin')).toEqual(['Admin', 'Dashboard']);
  });

  it('stops at the section on detail and new pages', () => {
    expect(adminCrumbs('/admin/listings')).toEqual(['Admin', 'Listings']);
    expect(adminCrumbs('/admin/listings/new')).toEqual(['Admin', 'Listings']);
    expect(adminCrumbs('/admin/leads/123')).toEqual(['Admin', 'Leads']);
  });

  it('prefers the most specific section', () => {
    expect(adminCrumbs('/admin/settings/fees')).toEqual(['Admin', 'Fees']);
  });
});

describe('initialsFor', () => {
  it('uses first and last initial', () => {
    expect(initialsFor('Asha Rao')).toBe('AR');
    expect(initialsFor('  priya   k  sharma ')).toBe('PS');
  });

  it('handles one name and empty input', () => {
    expect(initialsFor('Madhu')).toBe('M');
    expect(initialsFor('   ')).toBe('?');
  });
});
