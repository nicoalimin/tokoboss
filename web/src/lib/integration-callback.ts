import type { OAuthShopResult } from '@tokoboss/application';
import type { IntegrationCallbackResult } from '@tokoboss/contracts';
import type { MarketplaceProvider } from '@tokoboss/domain';

/**
 * OAuth callback redirect mapper (US20 / RFC 04 row 93, split 93a) for the
 * callback route (93b). Pure: completeOAuthConnection outcomes, or the error
 * the pre-check / completion threw, -> redirect path + the connection ids
 * whose first import the route queues. CoS decision 2026-11-10 07:20 WIB:
 * Q1 row-less -> hubungkan?provider=&result=[&store=]; exchange 422s ->
 * unavailable; Q2 state / provider / role errors stay JSON (null here);
 * Q3 first shop with a row, connected > needs_reauth, import only connected;
 * Q4 already_connected -> existing row (findByStore) with result=connected.
 */

export interface IntegrationCallbackTarget {
  workspaceId: string;
  provider: MarketplaceProvider;
  /** OAuth state's reconnect row (`state.connectionId`), else null. */
  connectionId: string | null;
}

export interface IntegrationCallbackOutcome {
  providerStoreId: string;
  connectionId: string | null;
  result: OAuthShopResult | IntegrationCallbackResult;
}

export interface IntegrationCallbackRedirect {
  path: string;
  importConnectionIds: string[];
}

const ERROR_RESULT: Record<string, IntegrationCallbackOutcome['result']> = {
  STORE_CONNECTED_ELSEWHERE: 'blocked',
  REAUTH_STORE_MISMATCH: 'mismatch',
  ALREADY_CONNECTED: 'already_connected',
  PROVIDER_UNAVAILABLE: 'unavailable',
};

/** Thrown error -> one outcome; null = not a redirect (route returns JSON). */
export function callbackOutcomeForError(
  err: unknown,
  providerStoreId: string
): IntegrationCallbackOutcome | null {
  const e = err as { code?: string; details?: { reason?: string } } | null;
  const code = e?.code ?? '';
  const cancelled = e?.details?.reason === 'cancelled';
  const result =
    code === 'CONNECT_FAILED'
      ? cancelled
        ? 'cancelled'
        : 'unavailable'
      : ERROR_RESULT[code];
  return result ? { providerStoreId, connectionId: null, result } : null;
}

/** Stores whose existing row id the route must resolve (findByStore). */
export function alreadyConnectedStoreIds(
  outcomes: readonly IntegrationCallbackOutcome[]
): string[] {
  return outcomes
    .filter((o) => o.result === 'already_connected')
    .map((o) => o.providerStoreId);
}

/** No outcome at all (not expected): row-less `unavailable`. */
const NONE = {
  providerStoreId: '',
  connectionId: null,
  result: 'unavailable',
} as const;

/** `existingRowIds`: providerStoreId -> this workspace's row id (Q4). */
export function mapIntegrationCallback(
  target: IntegrationCallbackTarget,
  outcomes: readonly IntegrationCallbackOutcome[],
  existingRowIds: ReadonlyMap<string, string> = new Map()
): IntegrationCallbackRedirect {
  const shops = outcomes.map((o) => {
    if (o.result !== 'already_connected') return { ...o, result: o.result };
    const connectionId = existingRowIds.get(o.providerStoreId) ?? null;
    return { ...o, connectionId, result: 'connected' as const };
  });
  const withRow = (r?: IntegrationCallbackResult) =>
    shops.find((s) => s.connectionId && (!r || s.result === r));
  const pick =
    withRow('connected') ?? withRow('needs_reauth') ?? withRow() ?? shops[0];
  const { providerStoreId, connectionId, result } = pick ?? NONE;
  const importConnectionIds = outcomes.flatMap((o) =>
    o.result === 'connected' && o.connectionId ? [o.connectionId] : []
  );
  const ws = `/w/${encodeURIComponent(target.workspaceId)}/integrasi`;
  const rowId = connectionId ?? target.connectionId;
  if (rowId) {
    const path = `${ws}/${encodeURIComponent(rowId)}?result=${result}`;
    return { path, importConnectionIds };
  }
  const query = new URLSearchParams({ provider: target.provider, result });
  if (providerStoreId) query.set('store', providerStoreId);
  return { path: `${ws}/hubungkan?${query.toString()}`, importConnectionIds };
}
