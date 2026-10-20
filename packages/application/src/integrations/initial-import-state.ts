import type { TenancyAuditSink } from '../tenancy/tenancy-ports';
import type {
  ConnectionPatch,
  ConnectionRecord,
} from './integration-port-inputs';
import type * as ports from './integration-ports';
import type { ImportListingsPageDeps } from './import-listings-page';

/** v1 caps (RFC 04 O8, CoS decision 2026-10-19). */
export const IMPORT_LISTING_CAP = 10_000;
export const IMPORT_MAX_RATE_LIMIT_SLEEPS = 20;
export const IMPORT_DEFAULT_SLEEP_MS = 60_000;
export const ORDER_PREVIEW_WINDOW = { days: 7, limit: 50 } as const;

/** Resumable state saved as `initial_import_cursor` after every step. */
export interface InitialImportCursor {
  phase: 'locations' | 'listings' | 'orders' | 'capabilities';
  listingCursor: string | null;
  listingsImported: number;
  rateLimitSleeps: number;
}

export const INITIAL_IMPORT_START: InitialImportCursor = {
  phase: 'locations',
  listingCursor: null,
  listingsImported: 0,
  rateLimitSleeps: 0,
};

export type InitialImportStepResult =
  | { kind: 'continue' | 'sleep'; cursor: InitialImportCursor; sleepMs: number }
  | { kind: 'done'; status: 'complete' | 'incomplete' | 'stopped' };

export interface RunInitialImportDeps extends ImportListingsPageDeps {
  connections: Pick<ports.ConnectionStore, 'find' | 'update'>;
  listings: Pick<ports.ListingStore, 'upsertPage' | 'upsertLocations'>;
  orderPreviews: Pick<ports.OrderPreviewStore, 'replace'>;
  saveCursor(connectionId: string, cursor: InitialImportCursor): Promise<void>;
  audit: Pick<TenancyAuditSink, 'append'>;
}

export type InitialImportRef = { workspaceId: string; connectionId: string };

/** Mark the import complete/incomplete and audit it (RFC 04 task 32b). */
export async function finishInitialImport(
  deps: RunInitialImportDeps,
  row: ConnectionRecord,
  status: 'complete' | 'incomplete',
  cursor: InitialImportCursor,
  patch: ConnectionPatch = {}
): Promise<InitialImportStepResult> {
  const ref = { workspaceId: row.workspaceId, connectionId: row.id };
  await deps.connections.update({
    ...ref,
    expectedVersion: row.version,
    patch: { ...patch, initialImportStatus: status },
  });
  await deps.audit.append({
    workspaceId: row.workspaceId,
    action:
      status === 'complete'
        ? 'integration.import_completed'
        : 'integration.import_incomplete',
    category: 'workspace',
    actorType: 'system',
    payload: { ...ref, provider: row.provider, ...cursor },
  });
  return { kind: 'done', status };
}
