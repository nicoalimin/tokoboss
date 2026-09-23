/**
 * Transfer domain entities (UTA-94, Story 06).
 *
 * Pure domain models for warehouse-to-warehouse transfers.
 */

// Re-export status from domain entities (mirrors catalog.ts)
export type {
  TransferStatus,
  TransferRecord,
  TransferItemRecord,
  CreateTransferInput,
  SendTransferInput,
  ReceiveTransferInput,
  CancelTransferInput,
  TransferWithItems,
} from '../entities/catalog';
