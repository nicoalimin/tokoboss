import { BusinessRuleViolationError } from '../errors/domain-error';
import type { TransferStatus } from '../value-objects/transfer-status';

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
   * Same-warehouse transfers are not allowed; stock movements must be
   * between distinct warehouses to preserve audit trail and physical
   * movement semantics.
   */
  assertDifferentWarehouses(input: {
    sourceWarehouseId: string;
    destinationWarehouseId: string;
  }): void {
    if (input.sourceWarehouseId === input.destinationWarehouseId) {
      throw new BusinessRuleViolationError(
        'Source and destination warehouses must be different'
      );
    }
  },

  /**
   * Warehouse deactivation guards: a warehouse cannot be deactivated if
   * it has any stock, pending transfers, or active stock counts.
   */
  assertWarehouseDeactivationAllowed(input: {
    hasStock: boolean;
    hasOpenTransfers: boolean;
    hasPendingTransfers: boolean;
    hasActiveStockCount: boolean;
  }): void {
    if (input.hasStock) {
      throw new BusinessRuleViolationError(
        'Warehouse has stock; cannot deactivate'
      );
    }
    if (input.hasOpenTransfers) {
      throw new BusinessRuleViolationError(
        'Warehouse has open transfer orders; cannot deactivate'
      );
    }
    if (input.hasPendingTransfers) {
      throw new BusinessRuleViolationError(
        'Warehouse has pending transfer receipts; cannot deactivate'
      );
    }
    if (input.hasActiveStockCount) {
      throw new BusinessRuleViolationError(
        'Warehouse has active stock count in progress; cannot deactivate'
      );
    }
  },

  /**
   * Transfer lifecycle enforces valid transitions: draft → sent →
   * (received|cancelled), with partial receive + damaged qty allowed.
   */
  assertTransferTransitionAllowed(input: {
    currentStatus: TransferStatus;
    newStatus: TransferStatus;
  }): void {
    // Valid transitions
    const validTransitions: Record<TransferStatus, TransferStatus[]> = {
      draft: ['sent', 'cancelled'],
      sent: ['received', 'cancelled'],
      received: [],
      cancelled: [],
    };

    const allowed = validTransitions[input.currentStatus].includes(
      input.newStatus
    );
    if (!allowed) {
      throw new BusinessRuleViolationError(
        `Invalid transfer status transition: ${input.currentStatus} → ${input.newStatus}`
      );
    }
  },

  /**
   * Transfer quantites must be positive integers; damages cannot exceed
   * received quantity, and received quantity cannot exceed sent quantity.
   */
  assertTransferQuantitiesValid(input: {
    qtySend: number;
    qtyReceive: number;
    qtyDamaged: number;
  }): void {
    if (!Number.isInteger(input.qtySend) || input.qtySend <= 0) {
      throw new BusinessRuleViolationError(
        'Send quantity must be a positive integer'
      );
    }
    if (!Number.isInteger(input.qtyReceive) || input.qtyReceive < 0) {
      throw new BusinessRuleViolationError(
        'Receive quantity must be a non-negative integer'
      );
    }
    if (!Number.isInteger(input.qtyDamaged) || input.qtyDamaged < 0) {
      throw new BusinessRuleViolationError(
        'Damaged quantity must be a non-negative integer'
      );
    }
    if (input.qtyReceive > input.qtySend) {
      throw new BusinessRuleViolationError(
        'Receive quantity cannot exceed send quantity'
      );
    }
    if (input.qtyDamaged > input.qtyReceive) {
      throw new BusinessRuleViolationError(
        'Damaged quantity cannot exceed received quantity'
      );
    }
  },
} as const;
