import { z } from 'zod';
import {
  StockCountEntryModeSchema,
  StockCountScopeTypeSchema,
  StockCountStatusSchema,
  StockCountVarianceReasonCodeSchema,
} from './stock-counts';

/**
 * Stock-opname response wire shapes (US12 / RFC 03 task 28b).
 * Request bodies: stock-counts.ts (28a). Dates are ISO-8601.
 */

export const StockCountFlagReasonSchema = z.enum([
  'large_negative',
  'explicit_zero',
  'negative_result',
]);
export type StockCountFlagReasonWire = z.infer<
  typeof StockCountFlagReasonSchema
>;

/** Session row on the wire (list + detail + post). */
export const StockCountSessionViewSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  warehouseId: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  scopeType: StockCountScopeTypeSchema,
  status: StockCountStatusSchema,
  freezeOutboundTransfers: z.boolean(),
  snapshotAt: z.string().datetime(),
  createdBy: z.string().min(1),
  submittedBy: z.string().min(1).nullable(),
  submittedAt: z.string().datetime().nullable(),
  submitNote: z.string().nullable(),
  returnedBy: z.string().min(1).nullable(),
  returnedAt: z.string().datetime().nullable(),
  returnNote: z.string().nullable(),
  postedBy: z.string().min(1).nullable(),
  postedAt: z.string().datetime().nullable(),
  cancelledBy: z.string().min(1).nullable(),
  cancelledAt: z.string().datetime().nullable(),
  cancelReason: z.string().nullable(),
  selfApproved: z.boolean(),
  lastActivityAt: z.string().datetime(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type StockCountSessionView = z.infer<typeof StockCountSessionViewSchema>;

/** Line row on the wire. */
export const StockCountLineViewSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  sessionId: z.string().min(1),
  warehouseId: z.string().min(1),
  variantId: z.string().min(1),
  snapshotQty: z.number().int(),
  countedQty: z.number().int().nonnegative().nullable(),
  systemQtyAtCount: z.number().int().nullable(),
  countedAt: z.string().datetime().nullable(),
  countedBy: z.string().min(1).nullable(),
  entryCount: z.number().int().nonnegative(),
  varianceReasonCode: StockCountVarianceReasonCodeSchema.nullable(),
  varianceNote: z.string().nullable(),
  flagVerified: z.boolean(),
  ledgerEntryId: z.string().min(1).nullable(),
  isOpen: z.boolean(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type StockCountLineView = z.infer<typeof StockCountLineViewSchema>;

export const StockCountEntryViewSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  sessionId: z.string().min(1),
  lineId: z.string().min(1),
  qty: z.number().int().nonnegative(),
  mode: StockCountEntryModeSchema,
  clientEntryId: z.string().min(1),
  deviceLabel: z.string().nullable(),
  actorId: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type StockCountEntryView = z.infer<typeof StockCountEntryViewSchema>;
