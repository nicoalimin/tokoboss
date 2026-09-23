import { z } from 'zod';

/**
 * Transfer wire contracts (UTA-94, Story 06)
 *
 * Server-side validation for warehouse transfer endpoints.
 * Transfer lifecycle: draft → sent → received | cancelled
 */

// Transfer status
const TransferStatusSchema = z.enum(['draft', 'sent', 'received', 'cancelled']);
export type TransferStatusWire = z.infer<typeof TransferStatusSchema>;

// Transfer schema (wire view)
export const TransferViewSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  referenceNum: z.string().min(1),
  status: TransferStatusSchema,
  sourceWarehouseId: z.string().min(1),
  destWarehouseId: z.string().min(1),
  notes: z.string().nullable().optional(),
  expectedReceiveDate: z.string().datetime().nullable().optional(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TransferView = z.infer<typeof TransferViewSchema>;

// Transfer item schema (wire view)
export const TransferItemViewSchema = z.object({
  id: z.string().min(1),
  transferId: z.string().min(1),
  workspaceId: z.string().min(1),
  variantId: z.string().min(1),
  requestedQty: z.number().int().nonnegative(),
  sentQty: z.number().int().nonnegative(),
  receivedQty: z.number().int().nonnegative(),
  damagedQty: z.number().int().nonnegative(),
  cancellationReason: z.string().nullable().optional(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TransferItemView = z.infer<typeof TransferItemViewSchema>;

// Create transfer input (POST /api/.../transfers)
export const CreateTransferBodySchema = z.object({
  sourceWarehouseId: z.string().min(1).max(200),
  destWarehouseId: z.string().min(1).max(200),
  referenceNum: z.string().min(1).max(128),
  items: z
    .array(
      z.object({
        variantId: z.string().min(1).max(200),
        requestedQty: z
          .number()
          .int()
          .positive('Requested quantity must be positive'),
      })
    )
    .min(1, 'At least one item is required'),
  notes: z.string().min(1).max(2000).optional(),
  expectedReceiveDate: z.string().datetime().optional(),
});
export type CreateTransferBody = z.infer<typeof CreateTransferBodySchema>;

// Send transfer input (POST /api/.../transfers/:transferId/send)
export const SendTransferBodySchema = z.object({
  idempotencyKey: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9\-_:.]+$/, 'Idempotency key has an unsupported format.')
    .optional(),
  expectedVersion: z.number().int().positive(),
});
export type SendTransferBody = z.infer<typeof SendTransferBodySchema>;

// Receive transfer input (POST /api/.../transfers/:transferId/receive)
export const ReceiveTransferBodySchema = z.object({
  idempotencyKey: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9\-_:.]+$/, 'Idempotency key has an unsupported format.')
    .optional(),
  expectedVersion: z.number().int().positive(),
  items: z
    .array(
      z.object({
        itemId: z.string().min(1).max(200),
        receivedQty: z.number().int().nonnegative(),
        damagedQty: z.number().int().nonnegative(),
      })
    )
    .min(1, 'At least one item is required'),
});
export type ReceiveTransferBody = z.infer<typeof ReceiveTransferBodySchema>;

// Cancel transfer input (POST /api/.../transfers/:transferId/cancel)
export const CancelTransferBodySchema = z.object({
  idempotencyKey: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9\-_:.]+$/, 'Idempotency key has an unsupported format.')
    .optional(),
  expectedVersion: z.number().int().positive(),
  items: z
    .array(
      z.object({
        itemId: z.string().min(1).max(200),
        cancellationReason: z.string().min(1).max(500).optional(),
      })
    )
    .min(1, 'At least one item is required'),
});
export type CancelTransferBody = z.infer<typeof CancelTransferBodySchema>;

// Transfer with items view
export type TransferWithItemsView = TransferView & {
  items: TransferItemView[];
};
