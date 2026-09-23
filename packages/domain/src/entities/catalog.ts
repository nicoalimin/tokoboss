import { BusinessRuleViolationError } from '../errors/domain-error';

/**
 * Catalog domain rules (UTA-75, Story 01 freeze).
 *
 * Pure business rules with no framework dependencies. The application
 * layer resolves the facts (movement/mapping counts, caller role) and
 * delegates the decisions here so Postgres and in-memory stores share
 * identical semantics.
 */
export const CatalogRules = {
  /**
   * SKU TokoBoss code edits are Admin-only and blocked once the variant
   * has stock movements (ledger entries) or marketplace mappings — the
   * code is already referenced downstream and a rename would orphan it.
   */
  assertSkuCodeChangeAllowed(input: {
    isAdmin: boolean;
    movementCount: number;
    mappingCount: number;
  }): void {
    if (!input.isAdmin) {
      throw new BusinessRuleViolationError('Only Admin may edit SKU codes');
    }
    if (input.movementCount > 0) {
      throw new BusinessRuleViolationError(
        'SKU code is locked: stock movements exist for this variant'
      );
    }
    if (input.mappingCount > 0) {
      throw new BusinessRuleViolationError(
        'SKU code is locked: marketplace mappings exist for this variant'
      );
    }
  },

  // Archiving (soft-delete) is always allowed and idempotent — it is the
  // ONLY removal path for catalog master data (products, variants,
  // warehouses, levels) when stock or orders exist. Hard delete of master
  // data and ledger rows is banned outright (405 `CATALOG_NO_HARD_DELETE`
  // at the web boundary). Channel mappings are links, not master data:
  // removing one un-locks SKU code edits and never touches the ledger.

  /** Adjustments must carry an explicit warehouse + reason + non-zero delta. */
  assertAdjustmentAllowed(input: {
    delta: number;
    reason: string;
    warehouseActive: boolean;
  }): void {
    if (!Number.isInteger(input.delta) || input.delta === 0) {
      throw new BusinessRuleViolationError('Delta must be a non-zero integer');
    }
    if (input.reason.trim().length === 0) {
      throw new BusinessRuleViolationError('A reason is required');
    }
    if (!input.warehouseActive) {
      throw new BusinessRuleViolationError('Warehouse is deactivated');
    }
  },

  /**
   * Balances can never go negative through an adjustment unless the
   * workspace explicitly opted in (UTA-81: Admin-only `allowNegative`
   * toggle, default OFF).
   */
  assertBalanceAllowed(input: {
    currentQty: number;
    delta: number;
    allowNegative?: boolean;
  }): void {
    if (input.allowNegative === true) return;
    if (input.currentQty + input.delta < 0) {
      throw new BusinessRuleViolationError('Insufficient stock for adjustment');
    }
  },

  /**
   * Same-warehouse transfers are blocked.
   */
  assertSourceAndDestDifferent(
    sourceWarehouseId: string,
    destWarehouseId: string
  ): void {
    if (sourceWarehouseId === destWarehouseId) {
      throw new BusinessRuleViolationError(
        'Source and destination warehouses must be different'
      );
    }
  },

  /**
   * Oversell is blocked unless negative stock is allowed.
   */
  assertTransferCanBeSent(input: {
    availableQty: number;
    requestedQty: number;
    allowNegative?: boolean;
  }): void {
    if (input.allowNegative === true) return;
    if (input.availableQty < input.requestedQty) {
      throw new BusinessRuleViolationError('Insufficient stock for transfer');
    }
  },

  /**
   * Warehouse deactivation is blocked if it has:
   * - stock (levels)
   * - open transfers
   * - pending receipts
   * - active stock-count
   */
  assertWarehouseCanBeDeactivated(input: {
    hasStock: boolean;
    hasOpenTransfers: boolean;
    hasPendingReceipts: boolean;
    hasActiveStockCount: boolean;
  }): void {
    if (input.hasStock) {
      throw new BusinessRuleViolationError(
        'Cannot deactivate warehouse with stock'
      );
    }
    if (input.hasOpenTransfers) {
      throw new BusinessRuleViolationError(
        'Cannot deactivate warehouse with open transfers'
      );
    }
    if (input.hasPendingReceipts) {
      throw new BusinessRuleViolationError(
        'Cannot deactivate warehouse with pending receipts'
      );
    }
    if (input.hasActiveStockCount) {
      throw new BusinessRuleViolationError(
        'Cannot deactivate warehouse with active stock count'
      );
    }
  },
} as const;

// Transfer status
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

/** Transfer master data (workspace-scoped). */
export interface TransferRecord {
  id: string;
  workspaceId: string;
  referenceNum: string;
  status: TransferStatus;
  sourceWarehouseId: string;
  destWarehouseId: string;
  notes: string | null;
  expectedReceiveDate: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Transfer items (line items). */
export interface TransferItemRecord {
  id: string;
  transferId: string;
  workspaceId: string;
  variantId: string;
  requestedQty: number;
  sentQty: number;
  receivedQty: number;
  damagedQty: number;
  cancellationReason: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Create transfer input. */
export interface CreateTransferInput {
  workspaceId: string;
  sourceWarehouseId: string;
  destWarehouseId: string;
  referenceNum: string;
  items: Array<{
    variantId: string;
    requestedQty: number;
  }>;
  notes?: string;
  expectedReceiveDate?: Date;
}

/** Send transfer input. */
export interface SendTransferInput {
  transferId: string;
  idempotencyKey?: string;
  expectedVersion: number;
}

/** Receive transfer input. */
export interface ReceiveTransferInput {
  transferId: string;
  idempotencyKey?: string;
  expectedVersion: number;
  items: Array<{
    itemId: string;
    receivedQty: number;
    damagedQty: number;
  }>;
}

/** Cancel transfer input. */
export interface CancelTransferInput {
  transferId: string;
  idempotencyKey?: string;
  expectedVersion: number;
  items: Array<{
    itemId: string;
    cancellationReason?: string;
  }>;
}

/** Transfer with items. */
export type TransferWithItems = TransferRecord & {
  items: TransferItemRecord[];
};
