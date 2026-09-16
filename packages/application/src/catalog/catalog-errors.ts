/**
 * Catalog errors (UTA-75, Story 01).
 *
 * Every error carries a stable `code` (mapped to HTTP status at the web
 * boundary by `catalogErrorStatus`). Messages are client-safe by design:
 * opaque ids only, never secrets or PII. `details` may carry the path to
 * the conflicting row (e.g. duplicate SKU) so the UI can link to it.
 */

export interface CatalogErrorDetails {
  /** API path of the existing row (duplicate-SKU conflicts). */
  existingPath?: string;
  existingVariantId?: string;
  existingProductId?: string;
  /** Current row version (optimistic-concurrency conflicts). */
  currentVersion?: number;
}

function withCode(
  message: string,
  code: string,
  details?: CatalogErrorDetails
): Error & { code: string; details?: CatalogErrorDetails } {
  const err = new Error(message) as Error & {
    code: string;
    details?: CatalogErrorDetails;
  };
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}

/** Field validation failure → 400. */
export function catalogValidation(message: string): Error & { code: string } {
  const err = new Error(`CATALOG_VALIDATION: ${message}`);
  (err as Error & { code: string }).code = 'CATALOG_VALIDATION';
  err.name = 'CatalogValidationError';
  return err as Error & { code: string };
}

/** Cross-workspace or role denial → 403 (generic message, no leakage). */
export function catalogForbidden(
  message = 'Cross-workspace access denied'
): Error & { code: string } {
  const err = new Error(message);
  (err as Error & { code: string }).code = 'CATALOG_FORBIDDEN';
  err.name = 'CatalogForbiddenError';
  return err as Error & { code: string };
}

/** Missing row (or cross-workspace miss, indistinguishable) → 404. */
export function catalogNotFound(what: string): Error & { code: string } {
  const err = new Error(`${what} not found.`);
  (err as Error & { code: string }).code = 'CATALOG_NOT_FOUND';
  err.name = 'CatalogNotFoundError';
  return err as Error & { code: string };
}

/** Duplicate SKU / mapping / warehouse code → 409 with path to existing. */
export function catalogConflict(
  message: string,
  details?: CatalogErrorDetails
): Error & { code: string; details?: CatalogErrorDetails } {
  const err = withCode(message, 'CATALOG_CONFLICT', details);
  err.name = 'CatalogConflictError';
  return err;
}

/** Stale `expectedVersion` → 409 with the current version. */
export function catalogVersionConflict(
  currentVersion: number
): Error & { code: string; details?: CatalogErrorDetails } {
  const err = withCode(
    'This record changed. Reload and try again.',
    'CATALOG_VERSION_CONFLICT',
    {
      currentVersion,
    }
  );
  err.name = 'CatalogVersionConflictError';
  return err;
}

/** SKU code edit blocked by movements/mappings → 422. */
export function catalogSkuLocked(message: string): Error & { code: string } {
  const err = new Error(message);
  (err as Error & { code: string }).code = 'CATALOG_SKU_LOCKED';
  err.name = 'CatalogSkuLockedError';
  return err as Error & { code: string };
}

/** Adjustment into a deactivated warehouse → 422. */
export function catalogWarehouseInactive(): Error & { code: string } {
  const err = new Error('Warehouse is deactivated.');
  (err as Error & { code: string }).code = 'CATALOG_WAREHOUSE_INACTIVE';
  err.name = 'CatalogWarehouseInactiveError';
  return err as Error & { code: string };
}

/** Adjustment would drive the balance negative → 422. */
export function catalogInsufficientStock(): Error & { code: string } {
  const err = new Error('Insufficient stock for adjustment.');
  (err as Error & { code: string }).code = 'CATALOG_INSUFFICIENT_STOCK';
  err.name = 'CatalogInsufficientStockError';
  return err as Error & { code: string };
}

/**
 * Hard delete attempt on catalog master data / ledger → 405. Catalog
 * only archives (soft-delete). Channel mappings are links, not master
 * data, and are exempt (removing one un-locks SKU code edits).
 */
export function catalogNoHardDelete(): Error & { code: string } {
  const err = new Error(
    'Catalog rows are never hard-deleted. Archive instead.'
  );
  (err as Error & { code: string }).code = 'CATALOG_NO_HARD_DELETE';
  err.name = 'CatalogNoHardDeleteError';
  return err as Error & { code: string };
}
