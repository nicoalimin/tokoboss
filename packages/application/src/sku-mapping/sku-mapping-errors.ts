import {
  createSkuMappingError as build,
  type SkuMappingError,
} from './sku-mapping-error-codes';

/**
 * Story 03 SKU mapping error factories (UTA-40 / US03, RFC 05 task 9b).
 * Codes, HTTP status and details live in `sku-mapping-error-codes.ts`.
 */

/** Field validation failure (bad ids, unknown listing, …) → 400. */
export function skuMappingValidation(message: string): SkuMappingError {
  return build(
    'SkuMappingValidationError',
    'SKU_MAPPING_VALIDATION',
    `SKU_MAPPING_VALIDATION: ${message}`
  );
}

/** Staff (or non-editor) write attempt → 403 (generic message). */
export function skuMappingForbidden(
  message = 'Only Admin or Manager can change SKU mappings'
): SkuMappingError {
  return build('SkuMappingForbiddenError', 'TENANCY_FORBIDDEN', message);
}

/** Missing mapping/listing/variant (or cross-workspace miss) → 404. */
export function skuMappingNotFound(what = 'SKU mapping'): SkuMappingError {
  return build(
    'SkuMappingNotFoundError',
    'SKU_MAPPING_NOT_FOUND',
    `${what} not found.`
  );
}

/** Store SKU already mapped to another SKU TokoBoss, no allowRemap → 409. */
export function skuMappingAlreadyAssigned(
  currentVariantId: string,
  currentSkuCode: string | null
): SkuMappingError {
  return build(
    'SkuMappingAlreadyAssignedError',
    'SKU_MAPPING_ALREADY_ASSIGNED',
    'This Store SKU is already mapped to another SKU TokoBoss.',
    { currentVariantId, currentSkuCode: currentSkuCode ?? undefined }
  );
}

/** Bulk batch has ambiguous/mapped/mismatched listings → 422, rolled back. */
export function skuMappingAmbiguousRequiresReview(
  platformSkuIds: string[]
): SkuMappingError {
  return build(
    'SkuMappingAmbiguousRequiresReviewError',
    'SKU_MAPPING_AMBIGUOUS_REQUIRES_REVIEW',
    'Some Store SKUs need review before they can be mapped.',
    { platformSkuIds }
  );
}

/** Target SKU TokoBoss is archived → 422. */
export function skuMappingVariantArchived(variantId: string): SkuMappingError {
  return build(
    'SkuMappingVariantArchivedError',
    'SKU_MAPPING_VARIANT_ARCHIVED',
    'This SKU TokoBoss is archived and cannot receive new mappings.',
    { variantId }
  );
}

/** Stale `expectedVersion` on remap → 409 with the current version. */
export function skuMappingVersionConflict(
  currentVersion: number
): SkuMappingError {
  return build(
    'SkuMappingVersionConflictError',
    'CATALOG_VERSION_CONFLICT',
    'This mapping changed. Reload and try again.',
    { currentVersion }
  );
}
