import {
  MarketplaceConnectorError,
  type MarketplaceConnector,
  type MarketplaceProvider,
} from '@tokoboss/domain';
import type { WorkspaceContext } from '../tenancy/tenancy-types';
import {
  precheckCredentialConnect,
  type CredentialPrecheckDeps,
} from './credential-precheck';
import { connectFailed, providerUnavailable } from './integration-errors';
import { assertIntegrationWrite } from './integration-guards';
import type { OAuthStateRecord } from './integration-port-inputs';
import {
  persistOAuthShop,
  type OAuthShopPersistDeps,
} from './oauth-shop-persist';
import { assertReauthorizeSameStore } from './reauthorize-connection';

/**
 * Complete OAuth (US20 / RFC 04 task 21, split 21b) after 21a: exchange the
 * code once, then per shop: reauth same-store check, claim pre-check (TikTok
 * shops known only now), 21c persist. Blocked: tokens unsealed, no revoke.
 */

export type OAuthShopResult =
  'connected' | 'needs_reauth' | 'blocked' | 'mismatch' | 'already_connected';

const SHOP_RESULT: Record<string, OAuthShopResult> = {
  STORE_CONNECTED_ELSEWHERE: 'blocked',
  REAUTH_STORE_MISMATCH: 'mismatch',
  ALREADY_CONNECTED: 'already_connected',
};

export interface CompleteOAuthConnectionDeps
  extends CredentialPrecheckDeps, OAuthShopPersistDeps {
  connectorFor(provider: MarketplaceProvider): MarketplaceConnector;
  redirectUri(provider: MarketplaceProvider): string;
}

export interface CompleteOAuthConnectionInput {
  state: OAuthStateRecord;
  query: Readonly<Record<string, string>>;
}

export interface OAuthShopOutcome {
  providerStoreId: string;
  connectionId: string | null;
  result: OAuthShopResult;
}

export async function completeOAuthConnection(
  deps: CompleteOAuthConnectionDeps,
  ctx: WorkspaceContext | null,
  input: CompleteOAuthConnectionInput
): Promise<OAuthShopOutcome[]> {
  const { workspaceId, provider, connectionId } = input.state;
  assertIntegrationWrite(ctx, workspaceId);
  const connector = deps.connectorFor(provider);
  const redirectUri = deps.redirectUri(provider);
  const code = (input.query.code ?? '').trim();
  const { credentials, shops } = await connector
    .exchangeAuthCode({ code, redirectUri, query: input.query })
    .catch(exchangeFailed);
  if (shops.length === 0) throw connectFailed('unsupported_account');
  const row = connectionId
    ? await deps.connections.find(workspaceId, connectionId)
    : null;
  const target = row && !row.removedAt ? row : null;
  const own = shops.find((s) => s.providerStoreId === target?.providerStoreId);
  const auth = { connector, credentials };
  const outcomes: OAuthShopOutcome[] = [];
  for (const shop of connectionId ? (own ? [own] : shops.slice(0, 1)) : shops) {
    const { providerStoreId } = shop;
    const pre = { workspaceId, provider, providerStoreId, actorId: ctx.userId };
    try {
      if (target)
        await assertReauthorizeSameStore(deps, { ...pre, row: target });
      await precheckCredentialConnect(deps, { ...pre, connectionId });
      const saved = await persistOAuthShop(deps, { ...pre, ...auth, shop });
      const result =
        saved.status === 'connected' ? 'connected' : 'needs_reauth';
      outcomes.push({ providerStoreId, connectionId: saved.id, result });
    } catch (err) {
      const result = SHOP_RESULT[(err as { code?: string } | null)?.code ?? ''];
      if (!result) throw err;
      outcomes.push({ providerStoreId, connectionId: null, result });
    }
  }
  return outcomes;
}

/** rate limit / maintenance → 503; anything else → 422 CONNECT_FAILED. */
function exchangeFailed(err: unknown): never {
  if (!(err instanceof MarketplaceConnectorError)) throw err;
  const busy = err.kind === 'rate_limited' || err.kind === 'unavailable';
  if (busy) throw providerUnavailable();
  const unsupported = err.kind === 'unsupported_account';
  throw connectFailed(unsupported ? 'unsupported_account' : 'state_invalid');
}
