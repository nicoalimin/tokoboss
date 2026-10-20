import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM secret box for marketplace credentials (UTA-39 / US20,
 * RFC 04 task 47). Stdlib only (node:crypto). Each sealed value records
 * the key id that sealed it, so previous keys stay decryptable while
 * `MARKETPLACE_CREDENTIALS_KEY` rotates. Never logs or echoes secrets.
 */
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const NONCE_BYTES = 12;

export type SecretBoxErrorCode =
  'SECRET_BOX_KEY_INVALID' | 'SECRET_BOX_KEY_UNKNOWN' | 'SECRET_BOX_TAMPERED';

export class SecretBoxError extends Error {
  constructor(readonly code: SecretBoxErrorCode) {
    super(code);
    this.name = 'SecretBoxError';
  }
}

export interface SecretBoxKey {
  readonly id: string;
  readonly key: Buffer;
}

/** Column shape of `marketplace_credentials` (minus connection id/kind). */
export interface SealedSecret {
  readonly keyId: string;
  readonly nonce: Buffer;
  readonly ciphertext: Buffer;
  readonly authTag: Buffer;
}

/** Parses a base64 32-byte key (e.g. `MARKETPLACE_CREDENTIALS_KEY`). */
export function parseSecretBoxKey(id: string, base64: string): SecretBoxKey {
  const key = Buffer.from(base64.trim(), 'base64');
  if (id.trim().length === 0 || key.length !== KEY_BYTES) {
    throw new SecretBoxError('SECRET_BOX_KEY_INVALID');
  }
  return { id: id.trim(), key };
}

/** AAD binding a sealed credential to its row: `connection_id|kind`. */
export function credentialAad(connectionId: string, kind: string): string {
  return `${connectionId}|${kind}`;
}

export class SecretBox {
  private readonly keys = new Map<string, Buffer>();

  constructor(
    private readonly current: SecretBoxKey,
    previous: readonly SecretBoxKey[] = []
  ) {
    for (const k of [current, ...previous]) {
      if (k.key.length !== KEY_BYTES) {
        throw new SecretBoxError('SECRET_BOX_KEY_INVALID');
      }
      if (!this.keys.has(k.id)) this.keys.set(k.id, k.key);
    }
  }

  /** Seals with the current key and a fresh random 96-bit nonce. */
  seal(plaintext: string, aad: string): SealedSecret {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.current.key, nonce);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return { keyId: this.current.id, nonce, ciphertext, authTag };
  }

  /** Opens with the recorded key id; any tamper or AAD mismatch throws. */
  open(sealed: SealedSecret, aad: string): string {
    const key = this.keys.get(sealed.keyId);
    if (!key) throw new SecretBoxError('SECRET_BOX_KEY_UNKNOWN');
    try {
      const decipher = createDecipheriv(ALGORITHM, key, sealed.nonce);
      decipher.setAAD(Buffer.from(aad, 'utf8'));
      decipher.setAuthTag(sealed.authTag);
      return Buffer.concat([
        decipher.update(sealed.ciphertext),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new SecretBoxError('SECRET_BOX_TAMPERED');
    }
  }
}
