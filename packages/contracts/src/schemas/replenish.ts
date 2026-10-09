import { z } from 'zod';

/**
 * Low-stock recommendation wire shapes (UTA-146 Slice 1b / Story 11).
 * Read-model only — dismiss/snooze/edit persistence comes in Slice 1c.
 */

export const LowStockRecommendationViewSchema = z.object({
  variantId: z.string().min(1),
  workspaceId: z.string().min(1),
  skuCode: z.string().min(1),
  productName: z.string().min(1),
  variantName: z.string().nullable(),
  availableQty: z.number().int(),
  minStockQty: z.number().int().nonnegative(),
  leadTimeDays: z.number().int().nonnegative().nullable(),
  /** Units sold per day over the lookback window; null = insufficient sales data. */
  salesRatePerDay: z.number().nonnegative().nullable(),
  /** Days of cover at salesRatePerDay; null when salesRatePerDay is null. */
  stockCoverDays: z.number().nonnegative().nullable(),
  suggestedReorderQty: z.number().int().nonnegative(),
  /** Everyday-language "Kenapa?" bullets naming data sources used. */
  explainability: z.array(z.string().min(1)).min(1),
  missingSupplier: z.boolean(),
  missingHpp: z.boolean(),
});
export type LowStockRecommendationView = z.infer<
  typeof LowStockRecommendationViewSchema
>;

export const LowStockRecommendationListViewSchema = z.object({
  recommendations: z.array(LowStockRecommendationViewSchema),
});
export type LowStockRecommendationListView = z.infer<
  typeof LowStockRecommendationListViewSchema
>;

/** Recommendation UI states (UTA-146 Slice 1c / Story 11). */
export const RecommendationStateStatusSchema = z.enum([
  'active',
  'dismissed',
  'snoozed',
]);
export type RecommendationStateStatusWire = z.infer<
  typeof RecommendationStateStatusSchema
>;

/**
 * PUT /api/.../catalog/variants/:variantId/recommendation-state
 * (Manager/Admin). `expectedVersion` null = first write; number = CAS.
 * `snoozedUntil` is an ISO datetime, required in the future when snoozed
 * (enforced by the use-case).
 */
export const SetRecommendationStateBodySchema = z.object({
  status: RecommendationStateStatusSchema,
  snoozedUntil: z.string().datetime().nullable().optional(),
  suggestedReorderQtyOverride: z
    .number()
    .int()
    .positive()
    .nullable()
    .optional(),
  expectedVersion: z.number().int().positive().nullable(),
});
export type SetRecommendationStateBody = z.infer<
  typeof SetRecommendationStateBodySchema
>;

export const RecommendationStateViewSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  variantId: z.string().min(1),
  status: RecommendationStateStatusSchema,
  snoozedUntil: z.string().datetime().nullable(),
  suggestedReorderQtyOverride: z.number().int().positive().nullable(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type RecommendationStateView = z.infer<
  typeof RecommendationStateViewSchema
>;

/** Draft purchase-order statuses (UTA-146 Slice 1d / Story 11). Draft only. */
export const PurchaseOrderStatusSchema = z.enum(['draft']);
export type PurchaseOrderStatusWire = z.infer<typeof PurchaseOrderStatusSchema>;

/**
 * POST /api/workspaces/:workspaceId/catalog/purchase-orders (Manager/Admin).
 * Draft only — missing supplier / unitCost stay null (never invented).
 * PO send/receive is Story 10.
 */
export const CreatePurchaseOrderDraftBodySchema = z.object({
  referenceNum: z.string().trim().min(1).max(120),
  supplierName: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  items: z
    .array(
      z.object({
        variantId: z.string().min(1).max(200),
        quantity: z.number().int().positive(),
        unitCostCents: z.number().int().nonnegative().nullable().optional(),
      })
    )
    .min(1),
});
export type CreatePurchaseOrderDraftBody = z.infer<
  typeof CreatePurchaseOrderDraftBodySchema
>;

/**
 * PATCH /api/workspaces/:workspaceId/catalog/purchase-orders/:purchaseOrderId
 * (Manager/Admin). Draft only — replaces header fields + full item list.
 * CAS via expectedVersion on the purchase-order header. Missing supplier /
 * unitCost stay null (never invented). PO send/receive is Story 10.
 */
export const UpdatePurchaseOrderDraftBodySchema = z.object({
  expectedVersion: z.number().int().positive(),
  supplierName: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  items: z
    .array(
      z.object({
        variantId: z.string().min(1).max(200),
        quantity: z.number().int().positive(),
        unitCostCents: z.number().int().nonnegative().nullable().optional(),
      })
    )
    .min(1),
});
export type UpdatePurchaseOrderDraftBody = z.infer<
  typeof UpdatePurchaseOrderDraftBodySchema
>;

export const PurchaseOrderItemViewSchema = z.object({
  id: z.string().min(1),
  purchaseOrderId: z.string().min(1),
  workspaceId: z.string().min(1),
  variantId: z.string().min(1),
  quantity: z.number().int(),
  unitCostCents: z.number().int().nullable(),
  version: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PurchaseOrderItemView = z.infer<typeof PurchaseOrderItemViewSchema>;

export const PurchaseOrderViewSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  referenceNum: z.string().min(1),
  status: PurchaseOrderStatusSchema,
  supplierName: z.string().nullable(),
  notes: z.string().nullable(),
  version: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PurchaseOrderView = z.infer<typeof PurchaseOrderViewSchema>;

export const PurchaseOrderWithItemsViewSchema = z.object({
  purchaseOrder: PurchaseOrderViewSchema,
  items: z.array(PurchaseOrderItemViewSchema),
});
export type PurchaseOrderWithItemsView = z.infer<
  typeof PurchaseOrderWithItemsViewSchema
>;
