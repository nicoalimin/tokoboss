import { CatalogRules, BusinessRuleViolationError } from '@tokoboss/domain';
import type { WorkspaceContext } from '../tenancy/tenancy-types';
import {
  assertManagerOrAdmin,
  assertSameWorkspace,
  assertWarehouseAccess,
} from '../tenancy/workspace-context';
import {
  catalogInsufficientStock,
  catalogNotFound,
  catalogValidation,
  catalogWarehouseInactive,
} from './catalog-errors';
import type { CatalogStore } from './catalog-ports';
import type { InventoryLevelRecord, StockLedgerRecord } from './catalog-types';

export interface TransferStockInput {
  ctx: WorkspaceContext;
  workspaceId: string;
  variantId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  reason: string;
  expectedVersion?: number;
  correlationId?: string;
}

export interface TransferResult {
  fromLevel: InventoryLevelRecord;
  toLevel: InventoryLevelRecord;
  entry: StockLedgerRecord;
}

/**
 * Transfer stock between warehouses for a variant (UTA-112)
 *
 * This use-case handles moving inventory from one warehouse to another
 * for the same product variant using adjustLevel functionality.
 */
export async function transferStock(
  store: CatalogStore,
  input: TransferStockInput
): Promise<TransferResult> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  assertManagerOrAdmin(input.ctx);

  // Validate warehouses exist and are active
  const fromWarehouse = await store.findWarehouseById(
    input.workspaceId,
    input.fromWarehouseId
  );
  if (!fromWarehouse) throw catalogNotFound('Source warehouse');
  if (fromWarehouse.status !== 'active') {
    throw catalogWarehouseInactive();
  }

  const toWarehouse = await store.findWarehouseById(
    input.workspaceId,
    input.toWarehouseId
  );
  if (!toWarehouse) throw catalogNotFound('Target warehouse');
  if (toWarehouse.status !== 'active') {
    throw catalogWarehouseInactive();
  }

  // Ensure the user has access to both warehouses
  assertWarehouseAccess(input.ctx, fromWarehouse.id);
  assertWarehouseAccess(input.ctx, toWarehouse.id);

  // Validate transfer parameters
  const quantity = input.quantity;
  if (
    typeof quantity !== 'number' ||
    !Number.isInteger(quantity) ||
    quantity <= 0
  ) {
    throw catalogValidation('Transfer quantity must be a positive integer');
  }

  const reason = typeof input.reason === 'string' ? input.reason : '';
  if (reason.trim().length > 500) {
    throw catalogValidation('Reason must be at most 500 characters');
  }

  try {
    CatalogRules.assertAdjustmentAllowed({
      delta: -quantity, // Negative because we're moving out
      reason,
      warehouseActive: fromWarehouse.status === 'active',
    });
  } catch (err) {
    if (err instanceof BusinessRuleViolationError) {
      if (err.message.includes('deactivated')) {
        throw catalogWarehouseInactive();
      }
      throw catalogValidation(err.message);
    }
    throw err;
  }

  // Get stock settings to determine if negative stock is allowed
  const settings = await store.getStockSettings(input.workspaceId);

  // Validate enough stock exists before performing the transfer
  const fromLevel = await store.getLevel(
    input.workspaceId,
    input.variantId,
    input.fromWarehouseId
  );

  if (!fromLevel) {
    throw catalogInsufficientStock();
  }

  if (fromLevel.qty < quantity) {
    throw catalogInsufficientStock();
  }

  // Perform two adjustments:
  // 1. Decrease stock in source warehouse (negative delta)
  const adjustedFrom = await store.adjustLevel({
    workspaceId: input.workspaceId,
    variantId: input.variantId,
    warehouseId: input.fromWarehouseId,
    delta: -quantity, // Negative because we're sending out
    reason: 'transfer_send',
    actorId: input.ctx.userId,
    correlationId: input.correlationId,
    allowNegative: settings.allowNegative,
    expectedVersion: input.expectedVersion,
  });

  // 2. Increase stock in destination warehouse (positive delta)
  const adjustedTo = await store.adjustLevel({
    workspaceId: input.workspaceId,
    variantId: input.variantId,
    warehouseId: input.toWarehouseId,
    delta: quantity, // Positive because we're receiving
    reason: 'transfer_receive',
    actorId: input.ctx.userId,
    correlationId: input.correlationId,
    allowNegative: settings.allowNegative,
  });

  return {
    fromLevel: adjustedFrom.level,
    toLevel: adjustedTo.level,
    entry: adjustedFrom.entry, // Return the from warehouse's ledger entry
  };
}
