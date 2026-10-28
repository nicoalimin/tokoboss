/**
 * Marketplace inventory-sync Workflow (US04 / RFC 06 task 34): claim the job,
 * run `syncVariantInventory` for the queued scope (stock read fresh, zero
 * crons). Per-mapping failures are needs_attention; only throws fail the job.
 */
import {
  assertJobPayloadSafe,
  claimStartJob,
  completeJob,
  failJob,
  syncVariantInventory,
  type InventorySyncDeps,
  type InventorySyncTrigger,
} from '@tokoboss/application';
import type { JobHandler } from './executor';

export const MARKETPLACE_INVENTORY_SYNC_JOB_TYPE = 'marketplace.inventory_sync';

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

export function createMarketplaceInventorySyncHandler(
  deps: InventorySyncDeps
): JobHandler {
  return async (store, input) => {
    const { job } = await claimStartJob(store, {
      jobId: input.jobId,
      workspaceId: input.workspaceId,
      workflowRunId: input.runId,
    });
    const ref = { jobId: job.id, workspaceId: job.workspaceId };
    const fail = (errorCode: string, errorMessage?: string) =>
      failJob(store, { ...ref, errorCode, errorMessage });
    const q = job.inputRef ?? {};
    assertJobPayloadSafe(q, 'input_ref');
    const ids = Array.isArray(q['variantIds']) ? q['variantIds'] : [];
    const variantIds = ids.filter((v): v is string => !!str(v));
    const mappingId = str(q['mappingId']);
    const connectionId = str(q['connectionId']);
    const trigger = str(q['trigger']) as InventorySyncTrigger | undefined;
    if (!trigger || !(variantIds.length || mappingId || connectionId)) {
      await fail('INVENTORY_SYNC_INPUT_INVALID');
      throw new Error(`Inventory sync job ${job.id} has no scope or trigger`);
    }
    try {
      const results = await syncVariantInventory(deps, {
        workspaceId: job.workspaceId,
        variantIds: variantIds.length ? variantIds : undefined,
        mappingId,
        connectionId,
        trigger,
        actorId: str(q['actorId']),
        correlationId: str(q['correlationId']),
      });
      const n = (o: string) => results.filter((r) => r.outcome === o).length;
      const outputRef = { mappings: results.length, synced: n('synced') };
      return await completeJob(store, {
        ...ref,
        outputRef: { ...outputRef, needsAttention: n('needs_attention') },
      });
    } catch (err) {
      await fail('INVENTORY_SYNC_STEP_FAILED', 'inventory sync step failed');
      throw err;
    }
  };
}
