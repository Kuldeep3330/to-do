import { describe, expect, it } from 'vitest';
import { actionLabel, actionTone, entityHref, entityLabel } from './audit';

describe('audit helpers', () => {
  it('writes actions and entities in plain words', () => {
    expect(actionLabel('UPDATE_FEE_RULE')).toBe('Update fee rule');
    expect(actionLabel('CREATE_STAFF')).toBe('Create staff');
    expect(entityLabel('fee_rule')).toBe('Fee rule');
  });

  it('colours by what the action does', () => {
    expect(actionTone('CREATE_LISTING')).toBe('success');
    expect(actionTone('PUBLISH_LISTING')).toBe('success');
    expect(actionTone('ARCHIVE_PROPERTY')).toBe('danger');
    expect(actionTone('DELETE_MEDIA')).toBe('danger');
    expect(actionTone('PAUSE_LISTING')).toBe('warning');
    expect(actionTone('UPDATE_LEAD')).toBe('brand');
    expect(actionTone('SOMETHING_ELSE')).toBe('neutral');
  });

  it('links only to things that have an admin page', () => {
    expect(entityHref('lead', 'abc')).toBe('/admin/leads/abc');
    expect(entityHref('listing', 'abc')).toBe('/admin/listings/abc');
    expect(entityHref('property', 'abc')).toBe('/admin/properties/abc');
    expect(entityHref('visit', 'abc')).toBeNull();
    expect(entityHref('lead', null)).toBeNull();
  });
});
