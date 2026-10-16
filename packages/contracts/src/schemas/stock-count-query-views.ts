import { z } from 'zod';
import {
  StockCountScopeTypeSchema,
  StockCountStatusSchema,
} from './stock-counts';
import {
  StockCountFlagReasonSchema,
  StockCountLineViewSchema,
  StockCountSessionViewSchema,
} from './stock-count-views';

/**
 * Stock-opname list / detail / post response envelopes (US12 / RFC 03 task 28c).
 * Record views: stock-count-views.ts (28b). Request bodies: stock-counts.ts (28a).
 */

/** One row on GET /stock-counts (list badge fields + kedaluwarsa). */
export const StockCountListItemViewSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  warehouseId: z.string().min(1),
  scopeType: StockCountScopeTypeSchema,
  status: StockCountStatusSchema,
  freezeOutboundTransfers: z.boolean(),
  createdBy: z.string().min(1),
  submittedBy: z.string().min(1).nullable(),
  postedBy: z.string().min(1).nullable(),
  cancelledBy: z.string().min(1).nullable(),
  selfApproved: z.boolean(),
  stale: z.boolean(),
  snapshotAt: z.string().datetime(),
  lastActivityAt: z.string().datetime(),
  version: z.number().int().positive(),
});
export type StockCountListItemView = z.infer<
  typeof StockCountListItemViewSchema
>;

export const StockCountListViewSchema = z.object({
  sessions: z.array(StockCountListItemViewSchema),
});
export type StockCountListView = z.infer<typeof StockCountListViewSchema>;

/** One line on GET session detail (variance / movement / D4 flags). */
export const StockCountDetailLineViewSchema = z.object({
  line: StockCountLineViewSchema,
  liveQty: z.number().int(),
  variance: z.number().int().nullable(),
  movement: z.number().int(),
  flags: z.array(StockCountFlagReasonSchema),
  hppCents: z.number().int().nullable().optional(),
  varianceValueCents: z.number().int().nullable().optional(),
});
export type StockCountDetailLineView = z.infer<
  typeof StockCountDetailLineViewSchema
>;

/** GET /stock-counts/:sessionId — HPP value fields omitted for Staff. */
export const StockCountDetailViewSchema = z.object({
  session: StockCountSessionViewSchema,
  lines: z.array(StockCountDetailLineViewSchema),
  countedLines: z.number().int().nonnegative(),
  uncountedLines: z.number().int().nonnegative(),
  totalDelta: z.number().int(),
  totalValueCents: z.number().int().optional(),
});
export type StockCountDetailView = z.infer<typeof StockCountDetailViewSchema>;

/** POST /stock-counts/:sessionId/post result (incl. idempotent replay). */
export const StockCountPostResultViewSchema = z.object({
  session: StockCountSessionViewSchema,
  postedLines: z.number().int().nonnegative(),
  deduplicated: z.boolean(),
});
export type StockCountPostResultView = z.infer<
  typeof StockCountPostResultViewSchema
>;
