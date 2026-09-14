import { describe, expect, it } from 'vitest';
import { REDACTED, redactObject, redactValue } from '../redact';

describe('redact secrets and tokens', () => {
  it.each([
    ['DATABASE_URL', 'postgres://user:pass@host/db'],
    ['apiKey', 'sk-live-123'],
    ['authorization', 'Bearer abc.def.ghi'],
    ['clientSecret', 'shhhhh'],
    ['BLOB_READ_WRITE_TOKEN', 'vercel_blob_xxx'],
    ['password', 'hunter2'],
  ])('redacts key %s', (key, value) => {
    expect(redactValue(value, key)).toBe(REDACTED);
    expect(redactObject({ [key]: value })[key]).toBe(REDACTED);
  });

  it('redacts bearer tokens embedded in strings', () => {
    expect(redactValue('call with Bearer abc.def.ghi please')).toBe(REDACTED);
  });
});

describe('redact raw marketplace payloads', () => {
  it.each([
    'shopee_payload',
    'tokopedia_raw',
    'marketplace_webhook',
    'vendor_response',
    'lazada_body',
  ])('redacts vendor blob key %s instead of logging it verbatim', (key) => {
    const payload = { order: 1, secret: 'x' };
    expect(redactObject({ [key]: payload })[key]).toBe(REDACTED);
  });
});

describe('redact customer PII', () => {
  it('redacts emails', () => {
    expect(redactValue('hubungi budi.santoso@example.id ya')).toBe(
      'hubungi [REDACTED] ya'
    );
    expect(String(redactValue('budi@example.id'))).toContain(REDACTED);
  });

  it('redacts phone numbers', () => {
    expect(redactValue('+62 812-3456-7890')).toBe(REDACTED);
    expect(redactValue('0812 3456 7890')).toBe(REDACTED);
  });

  it('redacts Indonesian NIK (16 digits)', () => {
    expect(redactValue('NIK 3174050101900001 harap dihapus')).toContain(
      REDACTED
    );
  });

  it('keeps safe business fields intact', () => {
    const out = redactObject({
      workspaceId: 'ws_123',
      totalValue: 4250000,
      currency: 'IDR',
      itemName: 'Kaos Polos Premium',
    });
    expect(out).toEqual({
      workspaceId: 'ws_123',
      totalValue: 4250000,
      currency: 'IDR',
      itemName: 'Kaos Polos Premium',
    });
  });
});

describe('redact private blob paths', () => {
  it('redacts private storage keys and signed urls', () => {
    expect(redactValue('private/invoices/inv-1.pdf')).toBe(REDACTED);
    expect(
      redactValue('https://blob.vercel-storage.com/private/x?sig=abc&token=def')
    ).toBe(REDACTED);
  });
});

describe('redact robustness', () => {
  it('is cycle-safe', () => {
    const a: Record<string, unknown> = { ok: true };
    a.self = a;
    expect(() => redactObject(a)).not.toThrow();
    expect(redactObject(a).self).toBe(REDACTED);
  });

  it('redacts nested secrets', () => {
    const out = redactObject({
      nested: { DATABASE_URL: 'postgres://x', safe: 'keep' },
      list: [{ token: 'abc' }, { v: 1 }],
    });
    expect(out).toEqual({
      nested: { DATABASE_URL: REDACTED, safe: 'keep' },
      list: [{ token: REDACTED }, { v: 1 }],
    });
  });
});
