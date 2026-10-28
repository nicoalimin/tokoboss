/**
 * Job infrastructure wiring for Route Handlers (UTA-14).
 *
 * - When `DATABASE_URL` is set (preview/production via the UTA-11 Neon
 *   wiring, or a local Neon branch), handlers use Postgres through
 *   `DrizzleJobStore` with real transactions.
 * - Otherwise they fall back to a process-local `InMemoryJobStore`
 *   (documented local-dev mode; responses include `storage: "memory"` so
 *   completion evidence can never be mistaken for Postgres timelines).
 */
import {
  DrizzleJobStore,
  createDb,
  drizzleJobTxRunner,
  type DbHandle,
} from '@tokoboss/database';
import {
  InMemoryJobStore,
  type JobExecutor,
  type JobStore,
  type JobTxRunner,
} from '@tokoboss/application';
import { buildInitialImportWorkflowDeps } from '@/lib/integration-import-deps';
import { getIntegrationDeps } from '@/lib/integrations';
import { createLocalHelloExecutor } from '@/workflows/executor';
import {
  MARKETPLACE_INBOUND_EVENT_JOB_TYPE,
  executeInboundEventJob,
} from '@/workflows/marketplace-inbound-event';
import {
  MARKETPLACE_INITIAL_IMPORT_JOB_TYPE,
  executeInitialImportJob,
} from '@/workflows/marketplace-initial-import';
import { getInventorySyncDeps } from '@/lib/inventory-sync';
import {
  MARKETPLACE_INVENTORY_SYNC_JOB_TYPE,
  createMarketplaceInventorySyncHandler,
} from '@/workflows/marketplace-inventory-sync';

let memoryStore: InMemoryJobStore | null = null;
let dbHandle: DbHandle | null = null;

export function storageKind(): 'postgres' | 'memory' {
  return process.env['DATABASE_URL'] ? 'postgres' : 'memory';
}

function getMemoryStore(): InMemoryJobStore {
  if (!memoryStore) memoryStore = new InMemoryJobStore();
  return memoryStore;
}

function getDbHandle(): DbHandle {
  if (!dbHandle) {
    dbHandle = createDb(process.env['DATABASE_URL']);
  }
  return dbHandle;
}

export function getJobStore(): JobStore {
  if (storageKind() === 'postgres') {
    return new DrizzleJobStore(getDbHandle().db);
  }
  return getMemoryStore();
}

export function getJobTxRunner(): JobTxRunner {
  if (storageKind() === 'postgres') {
    return drizzleJobTxRunner(getDbHandle());
  }
  return getMemoryStore();
}

/** Hello + marketplace job types (task 139); runs on request/intake, no cron. */
export function getJobExecutor(): JobExecutor {
  return createLocalHelloExecutor(() => getJobStore(), 'local', {
    [MARKETPLACE_INITIAL_IMPORT_JOB_TYPE]: (store, input) =>
      executeInitialImportJob(
        store,
        buildInitialImportWorkflowDeps(input.workspaceId),
        input
      ),
    [MARKETPLACE_INBOUND_EVENT_JOB_TYPE]: (store, input) =>
      executeInboundEventJob(store, getIntegrationDeps(), input),
    [MARKETPLACE_INVENTORY_SYNC_JOB_TYPE]: (store, input) =>
      createMarketplaceInventorySyncHandler(getInventorySyncDeps())(
        store,
        input
      ),
  });
}
