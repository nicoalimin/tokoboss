import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { TenancyValidationError, assertTenancyPayloadSafe } from '../index';

/**
 * RFC 01 addendum (UTA-958) row F4: the ID phone pattern is bounded, so
 * digit runs inside opaque ids are not mistaken for phone numbers while
 * real Indonesian mobile numbers are still rejected.
 */
describe('assertTenancyPayloadSafe phone pattern boundaries', () => {
  it('accepts UUID and hex ids that contain phone-like digit runs', () => {
    expect(() =>
      assertTenancyPayloadSafe({ id: '3f2a9c1e-0812-3456-7890-abcdef123456' })
    ).not.toThrow();
    expect(() =>
      assertTenancyPayloadSafe({ id: 'a1b2c3d408123456789e' })
    ).not.toThrow();
  });

  it('still rejects real Indonesian mobile numbers', () => {
    for (const note of [
      '+6281234567890',
      '0812-3456-789',
      'hubungi 0812 3456 7890.',
    ]) {
      expect(() => assertTenancyPayloadSafe({ note })).toThrow(
        TenancyValidationError
      );
      expect(() => assertTenancyPayloadSafe({ note })).toThrow('phone number');
    }
  });

  it('never rejects 2,000 random UUID ids', () => {
    for (let i = 0; i < 2000; i += 1) {
      const id = randomUUID();
      expect(() =>
        assertTenancyPayloadSafe({ id, inviteId: id })
      ).not.toThrow();
    }
  });
});
