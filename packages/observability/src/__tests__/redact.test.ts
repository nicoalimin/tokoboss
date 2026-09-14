import { describe, expect, it } from 'vitest';
import {
  REDACTED,
  REDACTED_BLOB_PATH,
  assertNoSecrets,
  redact,
} from '../redact.js';

describe('redact', () => {
  it('redacts secret keys', () => {
    const out = redact({
      DATABASE_URL: 'postgres://user:pass@host/db',
      apiKey: 'shopee-secret-123',
      authorization: 'Bearer abcdefgh12345678',
      normal: 'hello',
    }) as Record<string, unknown>;
    expect(out.DATABASE_URL).toBe(REDACTED);
    expect(out.apiKey).toBe(REDACTED);
    expect(out.authorization).toBe(REDACTED);
    expect(out.normal).toBe('hello');
  });

  it('redacts PII keys and value patterns', () => {
    const out = redact({
      email: 'buyer@example.com',
      phone: '+628123456789',
      nik: '3174051209900001',
      customer_name: 'Budi Santoso',
      note: 'contact buyer@example.com or +628123456789',
    }) as Record<string, unknown>;
    expect(out.email).toBe(REDACTED);
    expect(out.phone).toBe(REDACTED);
    expect(out.nik).toBe(REDACTED);
    expect(out.customer_name).toBe(REDACTED);
    expect(out.note).not.toContain('buyer@example.com');
    expect(out.note).not.toContain('+628123456789');
  });

  it('redacts raw marketplace payloads wholesale', () => {
    const out = redact({
      raw_payload: { order_id: '123', buyer: 'secret' },
      marketplace_payload: 'shopee raw body',
      orderId: 'ORD-1',
    }) as Record<string, unknown>;
    expect(out.raw_payload).toBe(REDACTED);
    expect(out.marketplace_payload).toBe(REDACTED);
    expect(out.orderId).toBe('ORD-1');
  });

  it('redacts private blob paths but keeps host shape', () => {
    const out = redact({
      blobUrl:
        'https://blob.vercel-storage.com/private/invoices/123.pdf?token=abc',
      invoiceId: 'inv_123',
    }) as Record<string, unknown>;
    expect(out.invoiceId).toBe('inv_123');
    const blob = String(out.blobUrl);
    expect(blob).toContain(REDACTED_BLOB_PATH);
    expect(blob).not.toContain('invoices/123.pdf');
    expect(blob).not.toContain('token=abc');
  });

  it('reduces postgres URLs to host-only', () => {
    const out = redact({
      note: 'migrating postgres://user:s3cret@ep-cool-123.neon.tech/db?sslmode=require done',
    }) as Record<string, unknown>;
    const note = String(out.note);
    expect(note).toContain('ep-cool-123.neon.tech');
    expect(note).not.toContain('s3cret');
  });

  it('redacts bearer tokens in free text', () => {
    const out = redact({
      note: 'call with Bearer abcdefgh12345678 please',
    }) as Record<string, unknown>;
    expect(String(out.note)).not.toContain('abcdefgh12345678');
    expect(String(out.note)).toContain(REDACTED);
  });

  it('assertNoSecrets throws on leaks', () => {
    expect(() => assertNoSecrets({ email: 'a@b.co' }, [])).toThrow();
    expect(() => assertNoSecrets({ ok: 'fine' }, [])).not.toThrow();
    expect(() =>
      assertNoSecrets({ v: 'x' }, ['super-secret-value'])
    ).not.toThrow();
    expect(() =>
      assertNoSecrets({ v: 'has super-secret-value inside' }, [
        'super-secret-value',
      ])
    ).toThrow();
  });

  it('collapses circular references instead of recursing forever', () => {
    const cyclic: Record<string, unknown> = { orderId: 'ORD-1' };
    cyclic.self = cyclic;
    const out = redact(cyclic) as Record<string, unknown>;
    expect(out.orderId).toBe('ORD-1');
    expect(out.self).toBe(REDACTED);
  });
});
