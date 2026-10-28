import { MarketplaceConnectorError } from '@tokoboss/domain';
import type { InventorySyncRemediationCode } from './inventory-sync-types';

/**
 * Story 04 inventory sync errors (UTA-37 / US04, RFC 06 task 22). Request
 * errors are thrown (403 / 404); push failures never throw: they become a
 * calm Perlu tindakan reason + one remediation. Client-safe messages only.
 */

export type InventorySyncError = Error & {
  code: 'ROLE_FORBIDDEN' | 'INVENTORY_SYNC_MAPPING_NOT_FOUND';
};

function syncErr(code: InventorySyncError['code'], message: string) {
  const err = new Error(message) as InventorySyncError;
  err.code = code;
  return err;
}

/** Staff (or non-editor) settings / manual sync attempt → 403. */
export const inventorySyncRoleForbidden = () =>
  syncErr(
    'ROLE_FORBIDDEN',
    'Hanya Admin atau Manager yang dapat mengatur sinkronisasi stok.'
  );

/** Unknown, archived or cross-workspace mapping → 404 (no enumeration). */
export const inventorySyncMappingNotFound = () =>
  syncErr(
    'INVENTORY_SYNC_MAPPING_NOT_FOUND',
    'Pemetaan Store SKU tidak ditemukan.'
  );

/** needs_attention codes kept in last_error_code (RFC 06 §2.1, §2.3, §4). */
export type InventorySyncFailureCode =
  | 'SYNC_STORE_DISCONNECTED'
  | 'SYNC_NEEDS_REAUTH'
  | 'SYNC_LOCATION_UNLINKED'
  | 'SYNC_LISTING_INVALID'
  | 'SYNC_RATE_LIMITED'
  | 'SYNC_PROVIDER_UNAVAILABLE';

export interface InventorySyncFailure {
  errorCode: InventorySyncFailureCode;
  reason: string;
  remediation: InventorySyncRemediationCode;
}

const RETRY = 'Coba lagi sebentar.';
const FAILURES: Record<
  InventorySyncFailureCode,
  readonly [string, InventorySyncRemediationCode]
> = {
  SYNC_STORE_DISCONNECTED: ['Toko terputus dari TokoBoss.', 'reauth_store'],
  SYNC_NEEDS_REAUTH: ['Otorisasi toko perlu diperbarui.', 'reauth_store'],
  SYNC_LOCATION_UNLINKED: [
    'Gudang toko belum ditautkan ke gudang TokoBoss.',
    'link_warehouse',
  ],
  SYNC_LISTING_INVALID: [
    'Marketplace menolak update stok. Periksa listing di toko.',
    'check_listing',
  ],
  SYNC_RATE_LIMITED: [`Marketplace sedang sibuk. ${RETRY}`, 'retry_now'],
  SYNC_PROVIDER_UNAVAILABLE: [
    `Marketplace sedang tidak tersedia. ${RETRY}`,
    'retry_now',
  ],
};

/** Calm Indonesian reason + remediation for one needs_attention code. */
export function inventorySyncFailure(
  errorCode: InventorySyncFailureCode
): InventorySyncFailure {
  const [reason, remediation] = FAILURES[errorCode];
  return { errorCode, reason, remediation };
}

/** Connector failure → needs_attention reason; unknown → unavailable. */
export function mapConnectorFailureToSyncError(
  err: unknown
): InventorySyncFailure {
  const kind = err instanceof MarketplaceConnectorError ? err.kind : null;
  if (kind === 'auth_invalid' || kind === 'unsupported_account') {
    return inventorySyncFailure('SYNC_NEEDS_REAUTH');
  }
  if (kind === 'rate_limited') return inventorySyncFailure('SYNC_RATE_LIMITED');
  if (kind !== 'bad_request') {
    return inventorySyncFailure('SYNC_PROVIDER_UNAVAILABLE');
  }
  return inventorySyncFailure(
    (err as Error).message === 'TIKTOK_WAREHOUSE_REQUIRED'
      ? 'SYNC_LOCATION_UNLINKED'
      : 'SYNC_LISTING_INVALID'
  );
}
