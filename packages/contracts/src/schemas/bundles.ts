import { z } from 'zod';

/**
 * Bundle / BOM wire contracts (UTA-79, Story 13).
 *
 * Server-side only validation — these schemas gate Route Handler bodies;
 * tenancy, RBAC, component activity, cycle detection, and
 * optimistic-concurrency checks are enforced in `@tokoboss/application`,
 * never just here. No secrets or PII cross this boundary (ids are opaque
 * workspace/variant references).
 *
 * Conventions (mirror catalog):
 * - Quantities are positive integers (units of the component per bundle).
 * - Mutations on a BOM require `expectedVersion` matching the bundle
 *   variant's current version; mismatches surface as 409
 *   `BUNDLE_VERSION_CONFLICT`.
 * - BOM removal goes through the archive endpoint (lines are cleared,
 *   the variant keeps its status); `DELETE` answers 405.
 */

const BundleComponentSchema = z.object({
  componentVariantId: z.string().trim().min(1).max(200),
  qty: z.number().int().positive(),
});
export type BundleComponentWire = z.infer<typeof BundleComponentSchema>;

/** POST /api/workspaces/:workspaceId/catalog/bundles (Manager/Admin) */
export const CreateBundleBodySchema = z.object({
  bundleVariantId: z.string().trim().min(1).max(200),
  components: z.array(BundleComponentSchema).min(1).max(100),
  expectedVersion: z.number().int().positive(),
});
export type CreateBundleBody = z.infer<typeof CreateBundleBodySchema>;

/** PATCH /api/workspaces/:workspaceId/catalog/bundles/:bundleVariantId */
export const UpdateBundleBodySchema = z.object({
  components: z.array(BundleComponentSchema).min(1).max(100),
  expectedVersion: z.number().int().positive(),
});
export type UpdateBundleBody = z.infer<typeof UpdateBundleBodySchema>;

/** POST /api/workspaces/:workspaceId/catalog/bundles/:bundleVariantId/archive */
export const ArchiveBundleBodySchema = z.object({
  expectedVersion: z.number().int().positive(),
});
export type ArchiveBundleBody = z.infer<typeof ArchiveBundleBodySchema>;

// Views

export const BundleLineViewSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  bundleVariantId: z.string().min(1),
  componentVariantId: z.string().min(1),
  qty: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type BundleLineView = z.infer<typeof BundleLineViewSchema>;

export const BundleAvailabilityViewSchema = z.object({
  warehouseId: z.string().min(1),
  available: z.number().int().nonnegative(),
});
export type BundleAvailabilityView = z.infer<
  typeof BundleAvailabilityViewSchema
>;

export const BundleComponentViewSchema = z.object({
  line: BundleLineViewSchema,
  componentSkuCode: z.string().min(1),
  componentName: z.string().nullable(),
  componentStatus: z.enum(['active', 'archived']),
});
export type BundleComponentView = z.infer<typeof BundleComponentViewSchema>;

export const BundleViewSchema = z.object({
  bundleVariantId: z.string().min(1),
  workspaceId: z.string().min(1),
  skuCode: z.string().min(1),
  status: z.enum(['active', 'archived']),
  version: z.number().int(),
  components: z.array(BundleComponentViewSchema),
  availability: z.array(BundleAvailabilityViewSchema),
});
export type BundleView = z.infer<typeof BundleViewSchema>;
