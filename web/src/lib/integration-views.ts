/**
 * Pure view helpers for the Integration Center (US20 / RFC 04 task 102a):
 * group connections by provider, the four-status badge (label + tone) and
 * per-store capability labels. No fetch, no React, no secrets. The
 * problem-variant resolver (status / callback `result` → problem card)
 * lands in 102b as a sibling file.
 */
import type {
  IntegrationConnectionView,
  MarketplaceProviderWire,
} from '@tokoboss/contracts';
import {
  getIntegrationCopy,
  type IntegrationLang,
  type IntegrationStatusKey,
} from './integration-copy';
import {
  getIntegrationConsentCopy,
  type IntegrationCapabilityKey,
} from './integration-consent-copy';

/** Mockup v2 order on screen 1: Shopee, TikTok Shop, Blibli. */
export const INTEGRATION_PROVIDER_ORDER: readonly MarketplaceProviderWire[] = [
  'shopee',
  'tiktok_shop',
  'blibli',
];

/** Store-row order: impor order · sinkron stok · label · webhook · pickup. */
export const INTEGRATION_CAPABILITY_ORDER: readonly IntegrationCapabilityKey[] =
  ['order_import', 'inventory_sync', 'labels', 'webhooks', 'pickup'];

export interface IntegrationProviderGroup {
  provider: MarketplaceProviderWire;
  /** Server order kept; empty = "Belum ada toko" (Belum terhubung). */
  connections: IntegrationConnectionView[];
}

/** Always all three providers, even with no stores. */
export function groupConnectionsByProvider(
  connections: readonly IntegrationConnectionView[]
): IntegrationProviderGroup[] {
  return INTEGRATION_PROVIDER_ORDER.map((provider) => ({
    provider,
    connections: connections.filter((c) => c.provider === provider),
  }));
}

/** Mockup pill classes: plain, ok, warn, bad. */
export type IntegrationBadgeTone = 'neutral' | 'ok' | 'warn' | 'bad';

const STATUS_TONE: Record<IntegrationStatusKey, IntegrationBadgeTone> = {
  not_connected: 'neutral',
  connected: 'ok',
  needs_reauth: 'warn',
  disconnected: 'bad',
};

export interface IntegrationStatusBadge {
  status: IntegrationStatusKey;
  label: string;
  tone: IntegrationBadgeTone;
}

/** Badge for a stored status, or `not_connected` for an empty provider. */
export function integrationStatusBadge(
  status: IntegrationStatusKey,
  lang: IntegrationLang = 'id'
): IntegrationStatusBadge {
  const label = getIntegrationCopy(lang).status[status];
  return { status, label, tone: STATUS_TONE[status] };
}

type CapabilityState =
  IntegrationConnectionView['capabilities'][IntegrationCapabilityKey];

export interface IntegrationCapabilityLabel {
  key: IntegrationCapabilityKey;
  label: string;
  state: CapabilityState;
}

/** The five capabilities in fixed order with their per-store state. */
export function integrationCapabilityLabels(
  connection: Pick<IntegrationConnectionView, 'capabilities'>,
  lang: IntegrationLang = 'id'
): IntegrationCapabilityLabel[] {
  const copy = getIntegrationConsentCopy(lang).capability;
  return INTEGRATION_CAPABILITY_ORDER.map((key) => ({
    key,
    label: copy[key],
    state: connection.capabilities[key],
  }));
}
