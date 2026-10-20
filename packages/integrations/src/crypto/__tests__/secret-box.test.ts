import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  SecretBox,
  SecretBoxError,
  credentialAad,
  parseSecretBoxKey,
  type SealedSecret,
} from '../secret-box';

/**
 * Secret box tests (UTA-39 / US20, RFC 04 task 48): round-trip with key
 * rotation, tamper / AAD mismatch, and unknown or invalid keys.
 */
const keyA = parseSecretBoxKey('k1', randomBytes(32).toString('base64'));
const keyB = parseSecretBoxKey('k2', randomBytes(32).toString('base64'));
const aad = credentialAad('conn_1', 'access_token');

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    if (err instanceof SecretBoxError) return err.code;
    throw err;
  }
  return undefined;
}

describe('secret box', () => {
  it('round-trips and opens values sealed with a previous key', () => {
    const old = new SecretBox(keyA);
    const sealed = old.seal('shpk-secret-123', aad);
    expect(sealed.keyId).toBe('k1');
    expect(sealed.nonce).toHaveLength(12);
    expect(sealed.authTag).toHaveLength(16);
    expect(sealed.ciphertext.toString('utf8')).not.toContain('shpk');
    expect(old.open(sealed, aad)).toBe('shpk-secret-123');

    const rotated = new SecretBox(keyB, [keyA]);
    expect(rotated.open(sealed, aad)).toBe('shpk-secret-123');
    const fresh = rotated.seal('shpk-secret-123', aad);
    expect(fresh.keyId).toBe('k2');
    expect(fresh.nonce.equals(sealed.nonce)).toBe(false);
  });

  it('rejects tampered ciphertext, tags and a different AAD', () => {
    const box = new SecretBox(keyA);
    const sealed = box.seal('refresh-token-xyz', aad);
    const flipped = Buffer.from(sealed.ciphertext);
    flipped[0] = (flipped[0] ?? 0) ^ 0xff;
    const badTag = Buffer.from(sealed.authTag);
    badTag[0] = (badTag[0] ?? 0) ^ 0xff;
    const cases: SealedSecret[] = [
      { ...sealed, ciphertext: flipped },
      { ...sealed, authTag: badTag },
    ];
    for (const c of cases) {
      expect(codeOf(() => box.open(c, aad))).toBe('SECRET_BOX_TAMPERED');
    }
    const otherAad = credentialAad('conn_2', 'access_token');
    expect(codeOf(() => box.open(sealed, otherAad))).toBe(
      'SECRET_BOX_TAMPERED'
    );
  });

  it('rejects unknown key ids and invalid keys without leaking secrets', () => {
    const sealed = new SecretBox(keyB).seal('top-secret', aad);
    const err = (() => {
      try {
        new SecretBox(keyA).open(sealed, aad);
      } catch (e) {
        return e as SecretBoxError;
      }
      return undefined;
    })();
    expect(err?.code).toBe('SECRET_BOX_KEY_UNKNOWN');
    expect(err?.message).toBe('SECRET_BOX_KEY_UNKNOWN');
    expect(err?.message).not.toContain('top-secret');

    const short = randomBytes(16).toString('base64');
    expect(codeOf(() => parseSecretBoxKey('k3', short))).toBe(
      'SECRET_BOX_KEY_INVALID'
    );
    expect(
      codeOf(() => parseSecretBoxKey('  ', keyA.key.toString('base64')))
    ).toBe('SECRET_BOX_KEY_INVALID');
    const bad = { id: 'k4', key: Buffer.alloc(31) };
    expect(codeOf(() => new SecretBox(keyA, [bad]))).toBe(
      'SECRET_BOX_KEY_INVALID'
    );
  });
});
