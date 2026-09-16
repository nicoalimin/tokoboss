import { z } from 'zod';

/**
 * Catalog wire contracts (UTA-75, Story 01).
 *
 * Server-side only validation — these schemas gate Route Handler bodies;
 * tenancy, RBAC, SKU-code edit rules, and optimistic-concurrency checks are
 * enforced in `@tokoboss/application`, never just here. No secrets or PII
 * cross this boundary (ids are opaque workspace/variant references).
 *
 * Conventions:
 * - Money is integer cents (`sellingPriceCents`, `hppCents`) to avoid
 *   float precision issues (mirrors the `Money` domain value object).
 * - Mutations on versioned rows require `expectedVersion` (optimistic
 *   concurrency); mismatches surface as 409 `CATALOG_VERSION_CONFLICT`.
 * - Status changes go through the dedicated archive endpoints, never PATCH.
 * - There is no hard delete for catalog master data (products, variants,
 *   warehouses, levels) or the ledger (405 `CATALOG_NO_HARD_DELETE`).
 *   Channel mappings are links, not master data: they can be removed
 *   (which intentionally un-locks SKU code edits) while ledger history
 *   is untouched.
 */

export const CatalogStatusSchema = z.enum(['active', 'archived']);
export type CatalogStatusWire = z.infer<typeof CatalogStatusSchema>;

export const WarehouseStatusSchema = z.enum(['active', 'deactivated']);
export type WarehouseStatusWire = z.infer<typeof WarehouseStatusSchema>;

/** SKU TokoBoss code: trimmed 1–64 chars, URL/path-safe alphabet. */
export const SkuCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9\-_./]*$/,
    'SKU code has an unsupported format.'
  );
export type SkuCodeWire = z.infer<typeof SkuCodeSchema>;

export const BarcodeSchema = z.string().trim().min(1).max(64);
export const CatalogNameSchema = z.string().trim().min(1).max(200);
export const ListingNameSchema = z.string().trim().min(1).max(200);
export const CostSourceSchema = z.string().trim().min(1).max(120);
export const UnitSchema = z.string().trim().min(1).max(24);
export const WarehouseCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9\-_]*$/,
    'Warehouse code has an unsupported format.'
  );

/** Picture metadata (product-level). Files live in the uploads store. */
export const ProductPictureSchema = z.object({
  fileId: z.string().min(1).max(200),
  sortOrder: z.number().int().nonnegative().default(0),
});
export type ProductPictureWire = z.infer<typeof ProductPictureSchema>;

// Warehouses

/** POST /api/workspaces/:workspaceId/catalog/warehouses (Admin/Manager) */
export const CreateWarehouseBodySchema = z.object({
  code: WarehouseCodeSchema,
  name: CatalogNameSchema,
});
export type CreateWarehouseBody = z.infer<typeof CreateWarehouseBodySchema>;

/** PATCH /api/workspaces/:workspaceId/catalog/warehouses/:warehouseId */
export const UpdateWarehouseBodySchema = z
  .object({
    name: CatalogNameSchema.optional(),
    status: WarehouseStatusSchema.optional(),
    expectedVersion: z.number().int().positive(),
  })
  .refine((v) => v.name !== undefined || v.status !== undefined, {
    message: 'Nothing to update.',
  });
export type UpdateWarehouseBody = z.infer<typeof UpdateWarehouseBodySchema>;

// Products + variants

const VariantInputSchema = z.object({
  skuCode: SkuCodeSchema,
  name: CatalogNameSchema.optional(),
  barcode: BarcodeSchema.nullable().optional(),
  sellingPriceCents: z.number().int().nonnegative(),
  currency: z.string().trim().length(3).default('IDR'),
  hppCents: z.number().int().nonnegative().nullable().optional(),
  costSource: CostSourceSchema.nullable().optional(),
  listingName: ListingNameSchema.nullable().optional(),
});

/** POST /api/workspaces/:workspaceId/catalog/products (Admin/Manager) */
export const CreateProductBodySchema = z.object({
  name: CatalogNameSchema,
  description: z.string().trim().max(2000).nullable().optional(),
  unit: UnitSchema.default('pcs'),
  pictures: z.array(ProductPictureSchema).max(10).default([]),
  variants: z.array(VariantInputSchema).min(1).max(100),
});
export type CreateProductBody = z.infer<typeof CreateProductBodySchema>;

/** PATCH /api/workspaces/:workspaceId/catalog/products/:productId */
export const UpdateProductBodySchema = z
  .object({
    name: CatalogNameSchema.optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    unit: UnitSchema.optional(),
    pictures: z.array(ProductPictureSchema).max(10).optional(),
    expectedVersion: z.number().int().positive(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.description !== undefined ||
      v.unit !== undefined ||
      v.pictures !== undefined,
    { message: 'Nothing to update.' }
  );
export type UpdateProductBody = z.infer<typeof UpdateProductBodySchema>;

/** POST /api/.../products/:productId/variants (Admin/Manager) */
export const CreateVariantBodySchema = VariantInputSchema;
export type CreateVariantBody = z.infer<typeof CreateVariantBodySchema>;

/**
 * PATCH /api/.../variants/:variantId (Admin/Manager).
 * `skuCode` is additionally Admin-only AND blocked once the variant has
 * stock movements or marketplace mappings (enforced server-side).
 */
export const UpdateVariantBodySchema = z
  .object({
    skuCode: SkuCodeSchema.optional(),
    name: CatalogNameSchema.nullable().optional(),
    barcode: BarcodeSchema.nullable().optional(),
    sellingPriceCents: z.number().int().nonnegative().optional(),
    hppCents: z.number().int().nonnegative().nullable().optional(),
    costSource: CostSourceSchema.nullable().optional(),
    listingName: ListingNameSchema.nullable().optional(),
    expectedVersion: z.number().int().positive(),
  })
  .refine(
    (v) =>
      v.skuCode !== undefined ||
      v.name !== undefined ||
      v.barcode !== undefined ||
      v.sellingPriceCents !== undefined ||
      v.hppCents !== undefined ||
      v.costSource !== undefined ||
      v.listingName !== undefined,
    { message: 'Nothing to update.' }
  );
export type UpdateVariantBody = z.infer<typeof UpdateVariantBodySchema>;

// Adjustments + ledger

/**
 * POST /api/.../variants/:variantId/adjustments (Manager/Admin).
 * A quantity change is only valid with warehouse + reason + save:
 * the server persists one ledger entry and advances the read model —
 * there is no draft/pending state server-side.
 *
 * `idempotencyKey` (optional, client-generated): retried requests with
 * the same key resolve to the original entry instead of double-applying.
 * Reusing a key with a different payload is a 409.
 */
export const AdjustStockBodySchema = z.object({
  warehouseId: z.string().min(1).max(200),
  delta: z
    .number()
    .int()
    .refine((n) => n !== 0, {
      message: 'Delta must not be zero.',
    }),
  reason: z.string().trim().min(1).max(500),
  expectedVersion: z.number().int().nonnegative().optional(),
  idempotencyKey: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(
      /^[A-Za-z0-9\-_:.]+$/,
      'Idempotency key has an unsupported format.'
    )
    .optional(),
});
export type AdjustStockBody = z.infer<typeof AdjustStockBodySchema>;

/**
 * PUT /api/workspaces/:workspaceId/catalog/stock-settings (Admin only).
 * Toggles the workspace negative-stock policy (default OFF).
 */
export const UpdateStockSettingsBodySchema = z.object({
  allowNegative: z.boolean(),
  expectedVersion: z.number().int().positive(),
});
export type UpdateStockSettingsBody = z.infer<
  typeof UpdateStockSettingsBodySchema
>;

// Channel mappings (stub-ready, no live marketplace calls)

/** POST /api/.../variants/:variantId/mappings (Admin/Manager) */
export const CreateMappingBodySchema = z.object({
  channel: z.string().trim().min(1).max(40),
  shopExtId: z.string().trim().min(1).max(200),
  platformSkuId: z.string().trim().min(1).max(200),
  sellerSkuHint: z.string().trim().min(1).max(200).nullable().optional(),
  barcodeHint: BarcodeSchema.nullable().optional(),
  listingName: ListingNameSchema.nullable().optional(),
});
export type CreateMappingBody = z.infer<typeof CreateMappingBodySchema>;

// Views

export const WarehouseViewSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  status: WarehouseStatusSchema,
  version: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type WarehouseView = z.infer<typeof WarehouseViewSchema>;

export const InventoryLevelViewSchema = z.object({
  variantId: z.string().min(1),
  warehouseId: z.string().min(1),
  qty: z.number().int(),
  version: z.number().int(),
  updatedAt: z.string().datetime(),
});
export type InventoryLevelView = z.infer<typeof InventoryLevelViewSchema>;

export const VariantViewSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  productId: z.string().min(1),
  skuCode: z.string().min(1),
  name: z.string().nullable(),
  barcode: z.string().nullable(),
  sellingPriceCents: z.number().int().nonnegative(),
  currency: z.string(),
  hppCents: z.number().int().nonnegative().nullable(),
  costSource: z.string().nullable(),
  listingName: z.string().nullable(),
  status: CatalogStatusSchema,
  version: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  levels: z.array(InventoryLevelViewSchema).optional(),
});
export type VariantView = z.infer<typeof VariantViewSchema>;

export const ProductViewSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  unit: z.string().min(1),
  pictures: z.array(ProductPictureSchema),
  status: CatalogStatusSchema,
  version: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  variants: z.array(VariantViewSchema).optional(),
});
export type ProductView = z.infer<typeof ProductViewSchema>;

export const LedgerEntryViewSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  variantId: z.string().min(1),
  warehouseId: z.string().min(1),
  delta: z.number().int(),
  balanceAfter: z.number().int(),
  reason: z.string().min(1),
  actorId: z.string().nullable(),
  correlationId: z.string().nullable(),
  idempotencyKey: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type LedgerEntryView = z.infer<typeof LedgerEntryViewSchema>;

export const ChannelMappingViewSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  variantId: z.string().min(1),
  channel: z.string().min(1),
  shopExtId: z.string().min(1),
  platformSkuId: z.string().min(1),
  sellerSkuHint: z.string().nullable(),
  barcodeHint: z.string().nullable(),
  listingName: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type ChannelMappingView = z.infer<typeof ChannelMappingViewSchema>;

/** GET /api/workspaces/:workspaceId/catalog/stock-settings (any member). */
export const StockSettingsViewSchema = z.object({
  workspaceId: z.string().min(1),
  allowNegative: z.boolean(),
  version: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type StockSettingsView = z.infer<typeof StockSettingsViewSchema>;

/**
 * GET /api/.../variants/:variantId/stock (any member).
 * Consolidated total + per-warehouse remaining for one SKU TokoBoss.
 */
export const WarehouseBalanceViewSchema = z.object({
  warehouseId: z.string().min(1),
  qty: z.number().int(),
  version: z.number().int(),
});
export type WarehouseBalanceView = z.infer<typeof WarehouseBalanceViewSchema>;

export const StockBalanceViewSchema = z.object({
  variantId: z.string().min(1),
  workspaceId: z.string().min(1),
  totalQty: z.number().int(),
  perWarehouse: z.array(WarehouseBalanceViewSchema),
});
export type StockBalanceView = z.infer<typeof StockBalanceViewSchema>;
