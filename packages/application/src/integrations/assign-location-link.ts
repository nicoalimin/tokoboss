import type { CatalogStore } from '../catalog/catalog-ports';
import type { TenancyAuditSink } from '../tenancy/tenancy-ports';
import type { WorkspaceContext } from '../tenancy/tenancy-types';
import {
  connectionNotFound,
  integrationValidation,
} from './integration-errors';
import { assertIntegrationWrite } from './integration-guards';
import type * as ports from './integration-ports';

export interface AssignLocationLinkDeps {
  connections: Pick<ports.ConnectionStore, 'find'>;
  listings: Pick<ports.ListingStore, 'linkLocation'>;
  catalog: Pick<CatalogStore, 'findWarehouseById'>;
  audit: Pick<TenancyAuditSink, 'append'>;
}

export interface AssignLocationLinkInput {
  workspaceId: string;
  connectionId: string;
  externalLocationId: string;
  /** Active TokoBoss warehouse to source stock from; null clears it. */
  warehouseId: string | null;
}

export interface AssignLocationLinkResult {
  connectionId: string;
  externalLocationId: string;
  warehouseId: string | null;
}

/**
 * Pilih gudang sumber (US20 / RFC 04 task 33). Admin only. Links one
 * provider location (Shopee location, TikTok warehouse, Blibli pickup
 * point) of a non-removed connection to an active warehouse in the same
 * workspace, or clears the link with null. Unknown connection or location
 * → 404; missing, other-workspace or inactive warehouse → 400. Emits
 * `integration.location_linked`.
 */
export async function assignLocationLink(
  deps: AssignLocationLinkDeps,
  ctx: WorkspaceContext | null,
  input: AssignLocationLinkInput
): Promise<AssignLocationLinkResult> {
  assertIntegrationWrite(ctx, input.workspaceId);
  const { workspaceId, connectionId } = input;
  const externalLocationId = (input.externalLocationId ?? '').trim();
  if (!externalLocationId) {
    throw integrationValidation('Lokasi marketplace wajib dipilih.');
  }
  const row = await deps.connections.find(workspaceId, connectionId);
  if (!row || row.removedAt) throw connectionNotFound();

  const warehouseId = input.warehouseId?.trim() || null;
  if (warehouseId !== null) {
    const warehouse = await deps.catalog.findWarehouseById(
      workspaceId,
      warehouseId
    );
    if (!warehouse || warehouse.workspaceId !== workspaceId) {
      throw integrationValidation('Gudang tidak ditemukan.');
    }
    if (warehouse.status !== 'active') {
      throw integrationValidation('Gudang tidak aktif.');
    }
  }

  const linked = await deps.listings.linkLocation(
    { workspaceId, connectionId, externalLocationId },
    warehouseId
  );
  // Unknown location for this connection → same neutral 404.
  if (!linked) throw connectionNotFound();

  await deps.audit.append({
    workspaceId,
    action: 'integration.location_linked',
    category: 'workspace',
    actorId: ctx.userId,
    payload: {
      connectionId,
      provider: row.provider,
      externalLocationId,
      warehouseId,
    },
  });
  return { connectionId, externalLocationId, warehouseId };
}
