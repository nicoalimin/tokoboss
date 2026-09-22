import { z } from 'zod';
import {
  TRANSFER_STATUSES,
  type TransferStatus,
} from '@tokoboss/application/catalog/transfer-status';

// Transfer schema
export const TransferSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  referenceNum: z.string().min(1),
  status: z.custom<TransferStatus>((v) => TRANSFER_STATUSES.includes(v as any)),
  sourceWarehouseId: z.string().uuid(),
  destWarehouseId: z.string().uuid(),
  notes: z.string().optional(),
  expectedReceiveDate: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  version: z.number().int().positive(),
});

export type Transfer = z.infer<typeof TransferSchema>;

// Transfer item schema
export const TransferItemSchema = z.object({
  id: z.string().uuid(),
  transferId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  variantId: z.string().uuid(),
  requestedQty: z.number().int().nonnegative(),
  sentQty: z.number().int().nonnegative(),
  receivedQty: z.number().int().nonnegative(),
  damagedQty: z.number().int().nonnegative(),
  cancellationReason: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  version: z.number().int().positive(),
});

export type TransferItem = z.infer<typeof TransferItemSchema>;

// Create transfer input
export const CreateTransferInputSchema = z.object({
  workspaceId: z.string().uuid(),
  sourceWarehouseId: z.string().uuid(),
  destWarehouseId: z.string().uuid(),
  referenceNum: z.string().min(1),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        requestedQty: z
          .number()
          .int()
          .positive('Requested quantity must be positive'),
      })
    )
    .min(1, 'At least one item is required'),
  notes: z.string().optional(),
  expectedReceiveDate: z.date().optional(),
});

export type CreateTransferInput = z.infer<typeof CreateTransferInputSchema>;

// Send transfer input
export const SendTransferInputSchema = z.object({
  transferId: z.string().uuid(),
  idempotencyKey: z.string().optional(),
  expectedVersion: z.number().int().positive(),
});

export type SendTransferInput = z.infer<typeof SendTransferInputSchema>;

// Receive transfer input
export const ReceiveTransferInputSchema = z.object({
  transferId: z.string().uuid(),
  idempotencyKey: z.string().optional(),
  expectedVersion: z.number().int().positive(),
  items: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        receivedQty: z.number().int().nonnegative(),
        damagedQty: z.number().int().nonnegative(),
      })
    )
    .min(1, 'At least one item is required'),
});

export type ReceiveTransferInput = z.infer<typeof ReceiveTransferInputSchema>;

// Cancel transfer input
export const CancelTransferInputSchema = z.object({
  transferId: z.string().uuid(),
  idempotencyKey: z.string().optional(),
  expectedVersion: z.number().int().positive(),
  items: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        cancellationReason: z.string().optional(),
      })
    )
    .min(1, 'At least one item is required'),
});

export type CancelTransferInput = z.infer<typeof CancelTransferInputSchema>;

// Transfer with items
export type TransferWithItems = Transfer & {
  items: TransferItem[];
};
