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
} as const;
