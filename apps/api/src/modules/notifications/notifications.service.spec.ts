import { maskEmail, maskPhone } from './notifications.service';

describe('notification masking', () => {
  it('masks email and phone', () => {
    expect(maskEmail('asha@example.com')).toBe('a***@example.com');
    expect(maskPhone('+919876543210')).toBe('+91******3210');
  });
});
