/** Profile error taxonomy (UTA-72). Messages are client-safe by design. */

export class ProfileValidationError extends Error {
  readonly code = 'PROFILE_VALIDATION';
  constructor(message: string) {
    super(message);
    this.name = 'ProfileValidationError';
  }
}

/**
 * Cross-user or cross-workspace profile/avatar access — denied at the
 * application boundary. Message stays generic so callers learn nothing
 * about other users' profiles or other workspaces' files.
 */
export class ProfileForbiddenError extends Error {
  readonly code = 'PROFILE_FORBIDDEN';
  constructor(message = 'Profile access denied.') {
    super(message);
    this.name = 'ProfileForbiddenError';
  }
}
