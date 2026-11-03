/**
 * Integration Center Admin action helpers (UTA-38 / US18, RFC 07 addendum
 * row 45a): pure, injectable `fetchFn` / `navigate` wrappers over the
 * existing store-controls PATCH, reauthorize POST, and store-page href.
 * Used by useIntegrationCenterActions (45b); no React state here.
 */
import type { UpdateConnectionControlsBody } from '@tokoboss/contracts';
import { INTEGRATION_PROVIDER_NAMES } from './integration-copy';
import type { StoreHealthRowView } from './integration-management-views';
import { reauthorizeIntegrationConnection } from './integrations-actions-client';
import type { FetchFn } from './integrations-client';
import { saveIntegrationStoreControls } from './use-integration-store-management';

/** Inline capability keys (same as StoreCapabilityKey; keep lib free of UI). */
export type CenterCapabilityKey = 'orderImportEnabled' | 'inventorySyncEnabled';

/** Store detail page under the Integration Center. */
export function centerStoreHref(
  workspaceId: string,
  connectionId: string
): string {
  return `/w/${encodeURIComponent(workspaceId)}/integrasi/${encodeURIComponent(connectionId)}`;
}

/** `storeName ?? providerStoreId · Provider`, same as IntegrationStoreLoader. */
export function centerStoreLabel(row: StoreHealthRowView): string {
  const { storeName, providerStoreId, provider } = row.connection;
  return `${storeName ?? providerStoreId} · ${INTEGRATION_PROVIDER_NAMES[provider]}`;
}

/** PATCH .../controls for one capability switch; returns the card notice. */
export function toggleCenterCapability(
  workspaceId: string,
  connectionId: string,
  key: CenterCapabilityKey,
  enabled: boolean,
  fetchFn: FetchFn = fetch
): Promise<string> {
  const body = { [key]: enabled } as UpdateConnectionControlsBody;
  return saveIntegrationStoreControls(workspaceId, connectionId, body, fetchFn);
}

/**
 * Blibli has no OAuth redirect (key form on the store page) → navigate there.
 * Otherwise POST reauthorize and go to `authorizeUrl` (non-redirect throws).
 */
export async function startCenterReauthorize(
  workspaceId: string,
  row: StoreHealthRowView,
  navigate: (url: string) => void = (url) => window.location.assign(url),
  fetchFn: FetchFn = fetch
): Promise<void> {
  const { id, provider } = row.connection;
  if (provider === 'blibli') {
    navigate(centerStoreHref(workspaceId, id));
    return;
  }
  const res = await reauthorizeIntegrationConnection(workspaceId, id, fetchFn);
  if (res.mode !== 'oauth_redirect') throw new Error('no redirect');
  navigate(res.authorizeUrl);
}
