/**
 * Import errors (UTA-77, Story 02).
 *
 * Every error carries a stable `code` (mapped to HTTP status at the web
 * boundary by `importErrorStatus`). Messages are client-safe by design:
 * opaque ids only, never secrets or PII.
 */

export function importValidation(message: string): Error & { code: string } {
  const err = new Error(`IMPORT_VALIDATION: ${message}`);
  (err as Error & { code: string }).code = 'IMPORT_VALIDATION';
  err.name = 'ImportValidationError';
  return err as Error & { code: string };
}

/** Cross-workspace or role denial → 403 (generic message, no leakage). */
export function importForbidden(
  message = 'Cross-workspace access denied'
): Error & { code: string } {
  const err = new Error(message);
  (err as Error & { code: string }).code = 'IMPORT_FORBIDDEN';
  err.name = 'ImportForbiddenError';
  return err as Error & { code: string };
}

/** Missing batch/row (or cross-workspace miss, indistinguishable) → 404. */
export function importNotFound(what: string): Error & { code: string } {
  const err = new Error(`${what} not found.`);
  (err as Error & { code: string }).code = 'IMPORT_NOT_FOUND';
  err.name = 'ImportNotFoundError';
  return err as Error & { code: string };
}

/** Duplicate idempotent upload that resolved differently → 409. */
export function importConflict(message: string): Error & { code: string } {
  const err = new Error(message);
  (err as Error & { code: string }).code = 'IMPORT_CONFLICT';
  err.name = 'ImportConflictError';
  return err as Error & { code: string };
}
