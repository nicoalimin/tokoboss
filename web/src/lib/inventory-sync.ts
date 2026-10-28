/**
 * Inventory-sync wiring (US04 / RFC 06 task 35): Postgres via
 * `DrizzleInventorySyncRepository` when `DATABASE_URL` is set, else an
 * in-memory store; connectors + token refresh from `getIntegrationDeps()`.
 * `triggerVariantInventorySync` bumps syncSeq (markSyncing), queues one
 * deduplicated `marketplace.inventory_sync` job and runs it in-request.
 * Zero crons; it never throws (best-effort).
 */
import { createHash } from 'node:crypto';
import { DrizzleInventorySyncRepository, createDb } from '@tokoboss/database';
import {
  InMemoryInventorySyncStore,
  createJob,
  type InventorySyncDeps,
  type SyncVariantInventoryInput,
} from '@tokoboss/application';
import type { TokobossLogger } from '@tokoboss/observability';
import { getAuthAudit, storageKind } from '@/lib/auth';
import { getIntegrationDeps } from '@/lib/integrations';
import { getJobExecutor, getJobTxRunner } from '@/lib/jobs';
import { MARKETPLACE_INVENTORY_SYNC_JOB_TYPE as TYPE } from '@/workflows/marketplace-inventory-sync';

let repo: Pick<InventorySyncDeps, 'reads' | 'writes'> | null = null;
let override: InventorySyncDeps | null = null;

function getRepo(): Pick<InventorySyncDeps, 'reads' | 'writes'> {
  if (repo) return repo;
  if (storageKind() !== 'postgres') {
    const store = new InMemoryInventorySyncStore();
    return (repo = { reads: store, writes: store });
  }
  const { db } = createDb(process.env['DATABASE_URL']);
  return (repo = new DrizzleInventorySyncRepository(db));
}

/** Deps for every inventory-sync use case (routes, job handler). */
export function getInventorySyncDeps(): InventorySyncDeps {
  if (override) return override;
  const integration = getIntegrationDeps();
  const { reads, writes } = getRepo();
  return {
    reads,
    writes,
    connectors: { connectorFor: integration.connectorFor },
    tokenDeps: integration,
    audit: getAuthAudit(),
    now: () => new Date(),
  };
}

/** Test seam for `web/src/__tests__` (null restores the default wiring). */
export function setInventorySyncDepsForTesting(deps: InventorySyncDeps | null) {
  override = deps;
  repo = null;
}

/** Queue + run a sync for the scope; false when nothing ran (logged). */
export async function triggerVariantInventorySync(
  input: SyncVariantInventoryInput,
  log?: Pick<TokobossLogger, 'error'>
): Promise<boolean> {
  try {
    const { trigger, actorId, correlationId, ...scope } = input;
    const marked = await getInventorySyncDeps().writes.markSyncing(scope);
    if (marked.length === 0) return false; // no sync_enabled mapping in scope
    const seqs = marked.map((m) => `${m.mappingId}:${m.syncSeq}`).sort();
    const key = createHash('sha256').update(seqs.join(',')).digest('hex');
    const { job, duplicate } = await createJob(getJobTxRunner(), {
      workspaceId: scope.workspaceId,
      type: TYPE,
      idempotencyKey: `${TYPE}:${key}`,
      correlationId,
      actorType: actorId ? 'user' : 'system',
      actorId,
      inputRef: { ...scope, trigger },
    });
    if (duplicate) return false;
    await getJobExecutor().execute({
      jobId: job.id,
      workspaceId: job.workspaceId,
    });
    return true;
  } catch (err) {
    log?.error('inventory sync trigger failed', {
      errorCode: 'INVENTORY_SYNC_TRIGGER_FAILED',
      error: err instanceof Error ? err.name : 'unknown',
    });
    return false;
  }
}
