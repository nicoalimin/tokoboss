/**
 * Bundle / BOM errors (UTA-79, Story 13).
 *
 * Same conventions as `catalog-errors`: every error carries a stable
 * `code` (mapped to HTTP status at the web boundary by
 * `catalogErrorStatus`, which also handles the `BUNDLE_*` family).
 * Messages are client-safe by design: opaque ids only, never secrets.
 */

function withCode(
  message: string,
  code: string,
  details?: Record<string, unknown>
): Error & { code: string; details?: Record<string, unknown> } {
  const err = new Error(message) as Error & {
    code: string;
    details?: Record<string, unknown>;
  };
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}

/** Field validation failure → 400. */
export function bundleValidation(message: string): Error & { code: string } {
  const err = new Error(`BUNDLE_VALIDATION: ${message}`);
  (err as Error & { code: string }).code = 'BUNDLE_VALIDATION';
  err.name = 'BundleValidationError';
  return err as Error & { code: string };
}

/** Missing BOM (or cross-workspace miss, indistinguishable) → 404. */
export function bundleNotFound(): Error & { code: string } {
  const err = new Error('Bundle BOM not found.');
  (err as Error & { code: string }).code = 'BUNDLE_NOT_FOUND';
  err.name = 'BundleNotFoundError';
  return err as Error & { code: string };
}

/** Duplicate component within one BOM → 409. */
export function bundleConflict(
  message: string,
  details?: Record<string, unknown>
): Error & { code: string; details?: Record<string, unknown> } {
  const err = withCode(message, 'BUNDLE_CONFLICT', details);
  err.name = 'BundleConflictError';
  return err;
}

/** Self-reference or transitive cycle → 422 (blocked composition). */
export function bundleCycle(message: string): Error & { code: string } {
  const err = new Error(message);
  (err as Error & { code: string }).code = 'BUNDLE_CYCLE';
  err.name = 'BundleCycleError';
  return err as Error & { code: string };
}

/** Stale `expectedVersion` → 409 with the current version. */
export function bundleVersionConflict(
  currentVersion: number
): Error & { code: string; details?: Record<string, unknown> } {
  const err = withCode(
    'This bundle changed. Reload and try again.',
    'BUNDLE_VERSION_CONFLICT',
    { currentVersion }
  );
  err.name = 'BundleVersionConflictError';
  return err;
}

/** Direct stock adjustment on a bundle variant → 422. */
export function bundleNoDirectStock(): Error & { code: string } {
  const err = new Error(
    'Bundle variants hold no direct stock; adjust the components instead.'
  );
  (err as Error & { code: string }).code = 'BUNDLE_NO_DIRECT_STOCK';
  err.name = 'BundleNoDirectStockError';
  return err as Error & { code: string };
}
