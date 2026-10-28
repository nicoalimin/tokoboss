import type {
  MarketplaceCapabilities,
  MarketplaceConnectionStatus,
} from './marketplace-connection';
import type { ConnectionHealthStatus } from './marketplace-connection-health';

/**
 * 5-step store Setup Checklist (UTA-38 / US18, RFC 07 row 1b; mockup
 * Screen 2 "Daftar Periksa Pengaturan Toko"). Pure, no I/O.
 */
export const CONNECTION_CHECKLIST_STEPS = [
  'oauth_connected',
  'warehouse_linked',
  'sku_mapped',
  'stock_sync_active',
  'pickup_and_labels',
] as const;
export type ConnectionChecklistStepKey =
  (typeof CONNECTION_CHECKLIST_STEPS)[number];

export type ConnectionChecklistStepState =
  | 'complete'
  | 'attention'
  | 'incomplete'
  | 'paused'
  | 'supported'
  | 'manual'
  | 'unknown';

export interface ConnectionChecklistStep {
  readonly key: ConnectionChecklistStepKey;
  readonly state: ConnectionChecklistStepState;
}

export interface ConnectionChecklistInput {
  readonly status: MarketplaceConnectionStatus;
  /** Result of evaluateConnectionHealth for the same connection. */
  readonly health: ConnectionHealthStatus;
  readonly inventorySyncEnabled: boolean;
  readonly capabilities: MarketplaceCapabilities;
  readonly linkedWarehouseCount: number;
  readonly mappedSkuCount: number;
}

function oauthState(i: ConnectionChecklistInput): ConnectionChecklistStepState {
  if (i.status === 'disconnected') return 'incomplete';
  if (i.health === 'needs_reauth' || i.health === 'expiring_soon') {
    return 'attention';
  }
  return 'complete';
}

function stockSyncState(
  i: ConnectionChecklistInput
): ConnectionChecklistStepState {
  if (i.status !== 'connected') return 'incomplete';
  if (!i.inventorySyncEnabled) return 'paused';
  return i.mappedSkuCount > 0 ? 'complete' : 'incomplete';
}

/** Manual when pickup or labels need Seller Center (e.g. Blibli). */
function pickupState(
  i: ConnectionChecklistInput
): ConnectionChecklistStepState {
  const { pickup, labels } = i.capabilities;
  if (pickup === 'supported' && labels === 'supported') return 'supported';
  const manual = ['manual', 'unsupported'];
  if (manual.includes(pickup) || manual.includes(labels)) return 'manual';
  return 'unknown';
}

export function computeConnectionChecklist(
  input: ConnectionChecklistInput
): ConnectionChecklistStep[] {
  return [
    { key: 'oauth_connected', state: oauthState(input) },
    {
      key: 'warehouse_linked',
      state: input.linkedWarehouseCount > 0 ? 'complete' : 'incomplete',
    },
    {
      key: 'sku_mapped',
      state: input.mappedSkuCount > 0 ? 'complete' : 'incomplete',
    },
    { key: 'stock_sync_active', state: stockSyncState(input) },
    { key: 'pickup_and_labels', state: pickupState(input) },
  ];
}
