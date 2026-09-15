import { PasswordPolicyError } from './auth-errors';

/**
 * Password policy (UTA-17 freeze): min 8 chars + common-password denylist.
 * No complexity theatre (no required character classes, no absolute expiry).
 */

export const PASSWORD_MIN_LENGTH = 8;

/**
 * Common-password denylist (exact match, case-insensitive). MVP-sized;
 * extend freely — matching stays exact-match only so legitimate passwords
 * are never rejected by substring.
 */
export const COMMON_PASSWORD_DENYLIST: readonly string[] = [
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty123',
  'qwertyuiop',
  'letmein123',
  'welcome123',
  'admin123',
  'tokoboss123',
  'toko12345',
  'indonesia1',
  'jakarta123',
  'surabaya1',
  'bandung123',
  'changeme123',
  'default123',
  'test12345',
  'user12345',
  'abcdefg1',
  'abcd1234',
  'passw0rd',
  'p@ssw0rd',
  'iloveyou1',
  'football1',
  'monkey123',
  'dragon123',
  'master123',
];

const DENYLIST = new Set(COMMON_PASSWORD_DENYLIST.map((p) => p.toLowerCase()));

/** Normalize an email for lookup: trim + lowercase. Never logged. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Enforce the password policy. Throws `PasswordPolicyError` with a
 * client-safe message (never echoes the password).
 */
export function validatePassword(
  password: unknown
): asserts password is string {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    throw new PasswordPolicyError(
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
    );
  }
  if (password.length > 512) {
    throw new PasswordPolicyError('Password is too long.');
  }
  if (DENYLIST.has(password.toLowerCase())) {
    throw new PasswordPolicyError(
      'Password is too common. Choose a less predictable password.'
    );
  }
}

/** True when the password satisfies the policy (non-throwing check). */
export function isPasswordAllowed(password: unknown): boolean {
  try {
    validatePassword(password);
    return true;
  } catch {
    return false;
  }
}
