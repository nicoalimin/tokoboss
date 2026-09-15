/** Invite error taxonomy (UTA-70). Messages are client-safe by design. */

/** Base class so routes can map the whole family with one `instanceof`. */
export class InviteError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

/**
 * Unknown, already-consumed, or revoked token. The message never
 * distinguishes "unknown" from "already used" (no invite-enumeration
 * oracle for unauthenticated callers).
 */
export class InviteInvalidError extends InviteError {
  constructor() {
    super('INVITE_INVALID', 'Invite is invalid.');
  }
}

/** Pending ticket past `expires_at` (the row is stamped `expired`). */
export class InviteExpiredError extends InviteError {
  constructor() {
    super('INVITE_EXPIRED', 'Invite has expired.');
  }
}

/**
 * A pending non-expired invite already exists for this workspace+email, or
 * the email already holds an active membership. The message carries no
 * identifiers.
 */
export class InviteConflictError extends InviteError {
  constructor() {
    super('INVITE_CONFLICT', 'An invite or membership already exists.');
  }
}
