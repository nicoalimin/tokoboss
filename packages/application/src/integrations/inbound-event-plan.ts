import {
  canTransitionMarketplaceConnection,
  type MarketplaceDisconnectSource,
} from '@tokoboss/domain';
import type {
  ConnectionPatch,
  ConnectionRecord,
} from './integration-port-inputs';
import { AUTH_EXPIRING_ERROR_CODE } from './sweep-connection-expiry';

/** Normalized event types that every adapter's parseWebhook emits. */
export const INBOUND_EVENT_TYPES = {
  sellerDeauthorization: 'SELLER_DEAUTHORIZATION',
  providerDeauthorization: 'PROVIDER_DEAUTHORIZATION',
  upcomingAuthorizationExpiration: 'UPCOMING_AUTHORIZATION_EXPIRATION',
} as const;

/** What one inbound event does to its connection row. */
export interface InboundEventPlan {
  patch: ConnectionPatch;
  shredCredentials: boolean;
  auditAction: string;
  auditDetail: Record<string, unknown>;
}

const T = INBOUND_EVENT_TYPES;

/**
 * Pure planner (US20 / RFC 04 task 30a). Seller/provider deauthorization →
 * disconnected with that source and credentials shredded; the store claim
 * is retained (only an Admin Putuskan releases it). Upcoming authorization
 * expiry → needs_reauth. Returns null when the row is already past that
 * state (no-op) and 'not_in_scope' for any other event type.
 */
export function planInboundEvent(
  eventType: string,
  row: ConnectionRecord,
  now: Date
): InboundEventPlan | 'not_in_scope' | null {
  if (
    eventType === T.sellerDeauthorization ||
    eventType === T.providerDeauthorization
  ) {
    const source: MarketplaceDisconnectSource =
      eventType === T.sellerDeauthorization ? 'seller' : 'provider';
    if (!canTransitionMarketplaceConnection(row.status, 'disconnected')) {
      return null;
    }
    return {
      patch: {
        status: 'disconnected',
        disconnectSource: source,
        disconnectedAt: now,
        disconnectedBy: null,
      },
      shredCredentials: true,
      auditAction: 'integration.disconnected',
      auditDetail: { source, claimReleased: false },
    };
  }
  if (eventType === T.upcomingAuthorizationExpiration) {
    if (row.status !== 'connected') return null;
    return {
      patch: {
        status: 'needs_reauth',
        lastCheckedAt: now,
        lastErrorCode: AUTH_EXPIRING_ERROR_CODE,
      },
      shredCredentials: false,
      auditAction: 'integration.reauth_required',
      auditDetail: { reason: 'auth_expiring_push' },
    };
  }
  return 'not_in_scope';
}
