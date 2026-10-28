/**
 * Scope parsing + views for the workspace inventory-sync route (US04 /
 * RFC 06 task 38a). GET `?variantIds=a,b&connectionId=…`; POST body
 * `{ mappingId | variantId | connectionId }` (strict, ≥ 1 key). Postgres
 * ids must be uuids (else 400 before any query); memory mode uses
 * `map-N` / `conn-N`. Alerts → strict wire view (ISO `updatedAt`).
 */
import type { InventorySyncAttentionItem } from '@tokoboss/contracts';
import type {
  InventorySyncAttentionBannerItem,
  InventorySyncScope,
} from '@tokoboss/application';
import { storageKind } from '@/lib/auth';
import { authJson } from '@/lib/auth-routes';
import type { RouteIds } from '@/lib/sku-mapping-routes';

export type InventorySyncFilter = Omit<InventorySyncScope, 'workspaceId'>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BODY_KEYS = ['mappingId', 'variantId', 'connectionId'];
const MAX_VARIANTS = 200;

const isId = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length > 0 &&
  (storageKind() !== 'postgres' || UUID_RE.test(v));

/** GET filter from the query string; null when malformed. */
export function parseInventorySyncQuery(
  url: string
): InventorySyncFilter | null {
  const search = new URL(url).searchParams;
  const variantIds = search.get('variantIds')?.split(',').filter(Boolean);
  const connectionId = search.get('connectionId') ?? undefined;
  if (variantIds && variantIds.length > MAX_VARIANTS) return null;
  if (variantIds && !variantIds.every(isId)) return null;
  if (connectionId !== undefined && !isId(connectionId)) return null;
  return { variantIds, connectionId };
}

/** POST scope from the JSON body; null when malformed / empty. */
export function parseInventorySyncTrigger(
  raw: unknown
): InventorySyncFilter | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }
  const body = raw as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.length === 0) return null;
  if (!keys.every((k) => BODY_KEYS.includes(k) && isId(body[k]))) return null;
  const { mappingId, variantId, connectionId } = body as Record<string, string>;
  return {
    mappingId,
    variantIds: variantId ? [variantId] : undefined,
    connectionId,
  };
}

export function inventorySyncInvalid(ids: RouteIds) {
  const body = {
    error: 'Filter atau permintaan sinkronisasi tidak valid.',
    errorCode: 'INVENTORY_SYNC_VALIDATION',
  };
  return authJson(body, 400, ...ids);
}

/** Strict Perlu tindakan alert view (contracts row 18). */
export function toAttentionItemView(
  a: InventorySyncAttentionBannerItem
): InventorySyncAttentionItem {
  return {
    mappingId: a.mappingId,
    variantId: a.variantId,
    skuCode: a.skuCode,
    storeSkuText: a.storeSkuText,
    platformSkuId: a.platformSkuId,
    channel: a.channel,
    storeDisplayName: a.storeDisplayName,
    errorCode: a.errorCode,
    reason: a.reason,
    remediation: a.remediation,
    updatedAt: a.updatedAt.toISOString(),
  };
}
