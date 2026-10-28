/**
 * Browser client + Bahasa Indonesia copy for Story 04 inventory sync
 * (UTA-37 / US04, RFC 06 task 46) on `skuMappingRequest` (same-origin
 * cookie, typed `SkuMappingClientError`). Overview: every member; PATCH
 * settings / POST Sinkronkan sekarang · Coba lagi: Admin or Manager
 * (Staff → 403). Push is best-effort, reported as `synced`.
 */
import type {
  InventorySyncAttentionItem as AttentionItem,
  InventorySyncRemediation as Remediation,
  InventorySyncStatus,
  MappingSyncStateView,
  UpdateMappingSyncSettingsInput,
} from '@tokoboss/contracts';
import {
  skuMappingRequest,
  skuMappingsPath,
  type FetchFn,
} from './sku-mapping-request';

export interface InventorySyncOverview {
  states: MappingSyncStateView[];
  attention: AttentionItem[];
}
export interface MappingSyncResult {
  state: MappingSyncStateView | null;
  synced: boolean;
}
export type MappingSyncSettingsPatch = Partial<UpdateMappingSyncSettingsInput>;

/** Sync status badges. */
export const SYNC_STATUS_LABEL: Record<InventorySyncStatus, string> = {
  off: 'Mati',
  syncing: 'Menyinkronkan',
  synced: 'Tersinkron',
  needs_attention: 'Perlu tindakan',
};
/** Perlu tindakan banner action per remediation. */
export const SYNC_ACTION_LABEL: Record<Remediation, string> = {
  retry_now: 'Coba lagi',
  check_listing: 'Coba lagi',
  reauth_store: 'Hubungkan ulang toko',
  link_warehouse: 'Tautkan gudang',
};
/** Safety stock buffer chips (units) and allocation chips (%). */
export const STOCK_BUFFER_PRESETS = [0, 2, 5, 10] as const;
export const ALLOCATION_PCT_PRESETS = [100, 80, 50] as const;

/** GET …/inventory-sync[?variantIds=a,b&connectionId]: states + alerts. */
export async function fetchInventorySyncOverview(
  workspaceId: string,
  query: { variantIds?: string[]; connectionId?: string } = {},
  fetchFn: FetchFn = fetch
): Promise<InventorySyncOverview> {
  const qs = new URLSearchParams();
  if (query.variantIds?.length) qs.set('variantIds', query.variantIds.join());
  if (query.connectionId) qs.set('connectionId', query.connectionId);
  const base = `/api/workspaces/${encodeURIComponent(workspaceId)}`;
  const q = qs.toString();
  const path = `${base}/inventory-sync${q ? `?${q}` : ''}`;
  type Raw = Partial<InventorySyncOverview>;
  const data = await skuMappingRequest<Raw>(path, {}, fetchFn);
  const list = <T>(v: T[] | undefined) => (Array.isArray(v) ? v : []);
  return { states: list(data.states), attention: list(data.attention) };
}

/** PATCH …/sku-mappings/:mappingId/sync (toggle, buffer, allocation). */
export async function patchMappingSyncSettings(
  workspaceId: string,
  mappingId: string,
  body: MappingSyncSettingsPatch,
  fetchFn: FetchFn = fetch
): Promise<MappingSyncResult> {
  const path = skuMappingsPath(workspaceId, [mappingId, 'sync']);
  const init = { method: 'PATCH', body };
  return skuMappingRequest<MappingSyncResult>(path, init, fetchFn);
}

/** POST …/sku-mappings/:mappingId/sync: Sinkronkan sekarang / Coba lagi. */
export async function postMappingSyncRetry(
  workspaceId: string,
  mappingId: string,
  fetchFn: FetchFn = fetch
): Promise<MappingSyncResult> {
  const path = skuMappingsPath(workspaceId, [mappingId, 'sync']);
  const init = { method: 'POST' };
  return skuMappingRequest<MappingSyncResult>(path, init, fetchFn);
}
