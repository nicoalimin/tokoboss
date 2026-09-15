/** Thrown when a role/scope/status/workspace value fails validation. */
export class TenancyValidationError extends Error {
  readonly code = 'TENANCY_VALIDATION';
  constructor(message: string) {
    super(`TENANCY_VALIDATION: ${message}`);
    this.name = 'TenancyValidationError';
  }
}

/**
 * Cross-workspace read/write attempt — denied at the application boundary.
 * Message stays generic so callers learn nothing about other workspaces.
 */
export class TenancyForbiddenError extends Error {
  readonly code = 'TENANCY_FORBIDDEN';
  constructor(message = 'Cross-workspace access denied') {
    super(message);
    this.name = 'TenancyForbiddenError';
  }
}

/** Removing/deactivating the last active Admin is rejected. */
export class LastAdminError extends Error {
  readonly code = 'TENANCY_LAST_ADMIN';
  constructor(message = 'Cannot remove or deactivate the last active Admin') {
    super(message);
    this.name = 'LastAdminError';
  }
}
