/**
 * Story 03 SKU mapping error codes (UTA-40 / US03, RFC 05 task 9a).
 *
 * Stable codes + HTTP status for the web boundary, the shared details
 * shape and the error builder used by `sku-mapping-errors.ts` (9b).
 * Staff writes reuse RFC 02 `TENANCY_FORBIDDEN`; stale remaps reuse
 * `CATALOG_VERSION_CONFLICT` (RFC 05 API contract). Messages are
 * client-safe: opaque ids only, never secrets, emails or other
 * workspaces.
 */

export type SkuMappingErrorCode =
  | 'SKU_MAPPING_VALIDATION'
  | 'TENANCY_FORBIDDEN'
  | 'SKU_MAPPING_NOT_FOUND'
  | 'SKU_MAPPING_ALREADY_ASSIGNED'
  | 'CATALOG_VERSION_CONFLICT'
  | 'SKU_MAPPING_AMBIGUOUS_REQUIRES_REVIEW'
  | 'SKU_MAPPING_VARIANT_ARCHIVED';

export const SKU_MAPPING_ERROR_HTTP_STATUS: Record<
  SkuMappingErrorCode,
  number
> = {
  SKU_MAPPING_VALIDATION: 400,
  TENANCY_FORBIDDEN: 403,
  SKU_MAPPING_NOT_FOUND: 404,
  SKU_MAPPING_ALREADY_ASSIGNED: 409,
  CATALOG_VERSION_CONFLICT: 409,
  SKU_MAPPING_AMBIGUOUS_REQUIRES_REVIEW: 422,
  SKU_MAPPING_VARIANT_ARCHIVED: 422,
};

export interface SkuMappingErrorDetails {
  /** Active mapping owner (409 ALREADY_ASSIGNED; UI confirms remap). */
  currentVariantId?: string;
  currentSkuCode?: string;
  /** Current catalog_channel_mappings.version (stale expectedVersion). */
  currentVersion?: number;
  /** Offending Store SKUs in a rejected bulk batch (422). */
  platformSkuIds?: string[];
  variantId?: string;
}

export type SkuMappingError = Error & {
  code: SkuMappingErrorCode;
  details?: SkuMappingErrorDetails;
};

/** Builds a coded SKU mapping error (details omitted when undefined). */
export function createSkuMappingError(
  name: string,
  code: SkuMappingErrorCode,
  message: string,
  details?: SkuMappingErrorDetails
): SkuMappingError {
  const err = new Error(message) as SkuMappingError;
  err.name = name;
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}
