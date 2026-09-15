/** Auth error taxonomy (UTA-67). Messages are client-safe by design. */

export class AuthError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

/**
 * Generic credential failure. The message never distinguishes "unknown
 * email" from "wrong password" (Story 21: no account-enumeration oracle).
 */
export class InvalidCredentialsError extends AuthError {
  constructor() {
    super('INVALID_CREDENTIALS', 'Invalid email or password.');
  }
}

/** Session missing, revoked, idle-expired, or auth-stale. */
export class InvalidSessionError extends AuthError {
  constructor(reason: 'revoked' | 'expired' | 'stale' = 'expired') {
    super('INVALID_SESSION', `Session is ${reason}. Sign in again.`);
  }
}

export class PasswordPolicyError extends AuthError {
  constructor(message = 'Password does not meet the policy.') {
    super('PASSWORD_POLICY', message);
  }
}

export class RateLimitedError extends AuthError {
  constructor() {
    super('RATE_LIMITED', 'Too many attempts. Try again later.');
  }
}

export class PasswordResetError extends AuthError {
  constructor(message = 'Password reset failed.') {
    super('PASSWORD_RESET', message);
  }
}
