import {
  MARKETPLACE_CONNECTION_STATUSES,
  isMarketplaceProvider,
  type MarketplaceCapabilities,
  type MarketplaceConnectMode,
  type MarketplaceConnectionStatus,
  type MarketplaceDisconnectSource,
} from '@tokoboss/domain';
import {
  INITIAL_IMPORT_STATUSES,
  type ConnectionRecord,
  type InitialImportStatus,
} from '@tokoboss/application';
import type { MarketplaceConnectionRow } from '../schema/index';

/**
 * Row → record mapper for `marketplace_connections` (UTA-39 / US20,
 * RFC 04 task 67a). Used by the Drizzle connections repository (67c).
 * Unknown enum text throws instead of leaking an invalid record.
 */

const CONNECT_MODES = ['oauth_redirect', 'credential_binding'] as const;
const DISCONNECT_SOURCES = ['admin', 'seller', 'provider'] as const;

function oneOf<T extends string>(
  label: string,
  allowed: readonly string[],
  value: string
): T {
  if (!allowed.includes(value)) {
    throw new Error(
      `MARKETPLACE_CONNECTION_CORRUPT: unknown ${label} ${value}`
    );
  }
  return value as T;
}

function orNull<T extends string>(
  label: string,
  allowed: readonly string[],
  value: string | null
): T | null {
  return value === null ? null : oneOf<T>(label, allowed, value);
}

export function toConnectionRecord(
  row: MarketplaceConnectionRow
): ConnectionRecord {
  if (!isMarketplaceProvider(row.provider)) {
    throw new Error(
      `MARKETPLACE_CONNECTION_CORRUPT: unknown provider ${row.provider}`
    );
  }
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    provider: row.provider,
    connectMode: oneOf<MarketplaceConnectMode>(
      'connect mode',
      CONNECT_MODES,
      row.connectMode
    ),
    providerStoreId: row.providerStoreId,
    providerAccountId: row.providerAccountId,
    shopCipher: row.shopCipher,
    storeName: row.storeName,
    region: row.region,
    status: oneOf<MarketplaceConnectionStatus>(
      'status',
      MARKETPLACE_CONNECTION_STATUSES,
      row.status
    ),
    disconnectSource: orNull<MarketplaceDisconnectSource>(
      'disconnect source',
      DISCONNECT_SOURCES,
      row.disconnectSource
    ),
    disconnectedAt: row.disconnectedAt,
    disconnectedBy: row.disconnectedBy,
    removedAt: row.removedAt,
    capabilities: row.capabilities as MarketplaceCapabilities,
    grantedScopes: row.grantedScopes,
    missingPermissions: row.missingPermissions,
    accessTokenExpiresAt: row.accessTokenExpiresAt,
    authExpiresAt: row.authExpiresAt,
    lastRefreshedAt: row.lastRefreshedAt,
    lastCheckedAt: row.lastCheckedAt,
    lastErrorCode: row.lastErrorCode,
    orderImportEnabled: row.orderImportEnabled,
    inventorySyncEnabled: row.inventorySyncEnabled,
    initialImportStatus: orNull<InitialImportStatus>(
      'import status',
      INITIAL_IMPORT_STATUSES,
      row.initialImportStatus
    ),
    importJobId: row.importJobId,
    connectedBy: row.connectedBy,
    connectedAt: row.connectedAt,
    version: row.version,
  };
}
