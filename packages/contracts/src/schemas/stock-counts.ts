import { z } from 'zod';

/**
 * Stock-opname request wire shapes (US12 / RFC 03 task 28a).
 * Response views: task 28b. Enums mirror application types/rules.
 */

export const StockCountStatusSchema = z.enum([
  'counting',
  'submitted',
  'posted',
  'cancelled',
]);
export type StockCountStatusWire = z.infer<typeof StockCountStatusSchema>;

export const StockCountScopeTypeSchema = z.enum(['all', 'skus']);
export type StockCountScopeTypeWire = z.infer<typeof StockCountScopeTypeSchema>;

export const StockCountEntryModeSchema = z.enum(['add', 'replace']);
export type StockCountEntryModeWire = z.infer<typeof StockCountEntryModeSchema>;

export const StockCountVarianceReasonCodeSchema = z.enum([
  'damaged_expired',
  'lost',
  'prior_input_error',
  'unrecorded_receipt',
  'other',
]);
export type StockCountVarianceReasonCodeWire = z.infer<
  typeof StockCountVarianceReasonCodeSchema
>;

/** Actions route body discriminator (submit/return/cancel/freeze). */
export const StockCountActionSchema = z.enum([
  'submit',
  'return',
  'cancel',
  'freeze',
]);
export type StockCountActionWire = z.infer<typeof StockCountActionSchema>;

/** POST /api/.../stock-counts — start session. */
export const StartStockCountBodySchema = z.object({
  warehouseId: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(120),
  scopeType: StockCountScopeTypeSchema,
  variantIds: z.array(z.string().min(1).max(200)).min(1).optional(),
  freezeOutboundTransfers: z.boolean().optional(),
});
export type StartStockCountBody = z.infer<typeof StartStockCountBodySchema>;

/** POST /api/.../stock-counts/:sessionId/entries */
export const RecordCountEntryBodySchema = z.object({
  lineId: z.string().min(1).max(200).optional(),
  scanCode: z.string().trim().min(1).max(200).optional(),
  qty: z.number().int().nonnegative().max(1_000_000),
  mode: StockCountEntryModeSchema,
  clientEntryId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9\-_:.]{1,128}$/),
  deviceLabel: z.string().trim().max(80).nullable().optional(),
});
export type RecordCountEntryBody = z.infer<typeof RecordCountEntryBodySchema>;

/**
 * POST /api/.../stock-counts/:sessionId/actions
 * note required for return/cancel (enforced in use-case); freeze needs freeze.
 */
export const StockCountActionBodySchema = z.object({
  action: StockCountActionSchema,
  expectedVersion: z.number().int().positive(),
  note: z.string().trim().max(2000).nullable().optional(),
  freeze: z.boolean().optional(),
});
export type StockCountActionBody = z.infer<typeof StockCountActionBodySchema>;

export const StockCountLineReviewBodySchema = z.object({
  lineId: z.string().min(1).max(200),
  varianceReasonCode: StockCountVarianceReasonCodeSchema.nullable().optional(),
  varianceNote: z.string().trim().max(500).nullable().optional(),
  flagVerified: z.boolean().optional(),
});
export type StockCountLineReviewBody = z.infer<
  typeof StockCountLineReviewBodySchema
>;

/** POST /api/.../stock-counts/:sessionId/post */
export const PostStockCountBodySchema = z.object({
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9\-_:.]{8,128}$/),
  lines: z.array(StockCountLineReviewBodySchema).optional(),
});
export type PostStockCountBody = z.infer<typeof PostStockCountBodySchema>;
