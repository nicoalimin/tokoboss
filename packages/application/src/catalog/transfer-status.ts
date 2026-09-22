/**
 * Transfer status machine (UTA-94, Story 06).
 *
 * Lifecycle: draft → sent → received | cancelled
 *
 * - draft: pending items, no stock movements yet
 * - sent: stock reserved from source warehouse
 * - received: stock credited to destination warehouse
 * - cancelled: transfer aborted, stock released
 */
export const TRANSFER_STATUSES = [
  'draft',
  'sent',
  'received',
  'cancelled',
] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

export function isTransferStatus(value: unknown): value is TransferStatus {
  return (
    typeof value === 'string' &&
    (TRANSFER_STATUSES as readonly string[]).includes(value)
  );
}
