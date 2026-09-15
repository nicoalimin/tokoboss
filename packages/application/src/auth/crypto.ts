import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { PasswordHasher } from './auth-ports';

function scryptAsync(
  password: string,
  salt: Buffer,
  keyLen: number,
  options: { N: number; r: number; p: number }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLen, options, (err, derived) => {
      if (err) reject(err);
      else resolve(derived as Buffer);
    });
  });
}

/** sha256 hex of an opaque token — what the DB stores (never the token). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Mint an opaque session/reset token (32 random bytes, base64url). */
export function mintToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * scrypt password hasher: memory-hard, stdlib-only, no native build
 * (argon2/bcrypt would add native toolchains; scrypt satisfies the
 * memory-hard requirement with zero dependencies).
 * Format: `scrypt$v1$N$r$p$saltHex$keyHex`.
 */
export class ScryptPasswordHasher implements PasswordHasher {
  constructor(
    private readonly options: {
      N?: number;
      r?: number;
      p?: number;
      keyLen?: number;
    } = {}
  ) {}

  async hash(plaintext: string): Promise<string> {
    const N = this.options.N ?? 16384;
    const r = this.options.r ?? 8;
    const p = this.options.p ?? 1;
    const keyLen = this.options.keyLen ?? 32;
    const salt = randomBytes(16);
    const key = (await scryptAsync(plaintext, salt, keyLen, {
      N,
      r,
      p,
    })) as Buffer;
    return `scrypt$v1$${N}$${r}$${p}$${salt.toString('hex')}$${key.toString('hex')}`;
  }

  async verify(hash: string, plaintext: string): Promise<boolean> {
    const parts = hash.split('$');
    if (parts.length !== 7 || parts[0] !== 'scrypt' || parts[1] !== 'v1') {
      return false;
    }
    const N = Number(parts[2]);
    const r = Number(parts[3]);
    const p = Number(parts[4]);
    const saltHex = parts[5] ?? '';
    const keyHex = parts[6] ?? '';
    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
      return false;
    }
    let expected: Buffer;
    let salt: Buffer;
    try {
      expected = Buffer.from(keyHex, 'hex');
      salt = Buffer.from(saltHex, 'hex');
    } catch {
      return false;
    }
    if (expected.length === 0 || salt.length === 0) return false;
    let actual: Buffer;
    try {
      actual = (await scryptAsync(plaintext, salt, expected.length, {
        N,
        r,
        p,
      })) as Buffer;
    } catch {
      return false;
    }
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  }
}
