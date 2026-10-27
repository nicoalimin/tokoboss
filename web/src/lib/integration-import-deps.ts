/**
 * Initial-import Workflow deps (US20 / RFC 04 task 137) —
 * `web/src/lib/integration-import-deps.ts`.
 *
 * Adapts `getIntegrationDeps()` (stores, vault, registry, audit, clock) and
 * `getCatalogStore()` into the `InitialImportWorkflowDeps` that
 * `executeInitialImportJob` (task 84) needs. Matching reads the workspace's
 * active variants and the channel mappings of this exact store. The
 * resumable cursor lives on the connection row (`initial_import_cursor`,
 * tasks 133–135), so no migration is needed. Runs on request / on intake
 * only (no cron); the executor wiring is tasks 138–139.
 */
import type {
  InitialImportCursor,
  MatchableVariant,
} from '@tokoboss/application';
import { getCatalogStore } from '@/lib/catalog';
import { getIntegrationDeps } from '@/lib/integrations';
import type { InitialImportWorkflowDeps } from '@/workflows/marketplace-initial-import';

/** Inline/local sleep; the Vercel Workflow adapter passes durable sleep. */
function timerSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Deps for one import job; `workspaceId` scopes the cursor reads/writes. */
export function buildInitialImportWorkflowDeps(
  workspaceId: string,
  sleep: (ms: number) => Promise<void> = timerSleep
): InitialImportWorkflowDeps {
  const deps = getIntegrationDeps();
  const catalog = getCatalogStore();
  const { connections } = deps;
  return {
    ...deps,
    async matchableVariants(id: string): Promise<MatchableVariant[]> {
      const variants = await catalog.listVariantsByWorkspace(id);
      return variants
        .filter((v) => v.status === 'active')
        .map((v) => ({ id: v.id, skuCode: v.skuCode, barcode: v.barcode }));
    },
    async mappedPlatformSkuIds(input) {
      const mappings = await catalog.listMappingsByWorkspace(input.workspaceId);
      const ids = mappings
        .filter(
          (m) =>
            m.channel === input.provider &&
            m.shopExtId === input.providerStoreId
        )
        .map((m) => m.platformSkuId);
      return new Set(ids);
    },
    async loadCursor(connectionId: string) {
      const row = await connections.find(workspaceId, connectionId);
      return row?.initialImportCursor ?? null;
    },
    async saveCursor(connectionId: string, cursor: InitialImportCursor) {
      const row = await connections.find(workspaceId, connectionId);
      if (!row) throw new Error(`Connection ${connectionId} not found`);
      await connections.update({
        workspaceId,
        connectionId,
        expectedVersion: row.version,
        patch: { initialImportCursor: cursor },
      });
    },
    sleep,
  };
}
