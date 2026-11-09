import type { MarketplaceProvider } from '@tokoboss/domain';
import { hashToken } from '../auth/crypto';
import type { WorkspaceContext } from '../tenancy/tenancy-types';
import {
  precheckCredentialConnect,
  type CredentialPrecheckDeps,
} from './credential-precheck';
import { connectFailed, stateInvalid } from './integration-errors';
import {
  assertIntegrationWrite,
  requireEnabledProvider,
} from './integration-guards';
import type {
  ConnectionRecord,
  OAuthStateRecord,
} from './integration-port-inputs';
import type { OAuthStateStore } from './integration-ports';

/**
 * OAuth callback state + pre-checks (US20 / RFC 04 task 21, split 21a).
 *
 * 1. `consumeOAuthCallbackState`: consume the hashed single-use state
 *    atomically. Unknown, expired, replayed or other-provider state → 410
 *    STATE_INVALID. The record names the workspace whose Admin session the
 *    callback route (task 93) must admit next.
 * 2. `precheckOAuthCallback`: the session must still be an Admin of that
 *    workspace and the user who started; no `code` → 422 cancelled (no row,
 *    no claim). Shopee: same-store / already-connected / claim pre-check on
 *    the redirect `shop_id` before any code exchange (CoS O3). TikTok shops
 *    are only known after the exchange, so 21b checks them there.
 *
 * Nothing here exchanges, stores or revokes provider tokens.
 */

export interface ConsumeOAuthCallbackStateDeps {
  oauthStates: Pick<OAuthStateStore, 'consume'>;
  enabledProviders: readonly MarketplaceProvider[];
  now(): Date;
}

export interface ConsumeOAuthCallbackStateInput {
  provider: string;
  state: string | null | undefined;
}

export async function consumeOAuthCallbackState(
  deps: ConsumeOAuthCallbackStateDeps,
  input: ConsumeOAuthCallbackStateInput
): Promise<OAuthStateRecord> {
  const provider = requireEnabledProvider(
    input.provider,
    deps.enabledProviders
  );
  const raw = (input.state ?? '').trim();
  if (!raw) throw stateInvalid();
  const record = await deps.oauthStates.consume(hashToken(raw), deps.now());
  if (!record || record.provider !== provider) throw stateInvalid();
  return record;
}

export interface OAuthCallbackPrecheckInput {
  state: OAuthStateRecord;
  /** Callback query (`code`, Shopee `shop_id` / `main_account_id`, …). */
  query: Readonly<Record<string, string>>;
}

/**
 * Returns this workspace's existing row for a Shopee `shop_id` callback
 * (or the reconnect target), else null. Throws before any exchange.
 */
export async function precheckOAuthCallback(
  deps: CredentialPrecheckDeps,
  ctx: WorkspaceContext | null,
  input: OAuthCallbackPrecheckInput
): Promise<ConnectionRecord | null> {
  const { state, query } = input;
  assertIntegrationWrite(ctx, state.workspaceId);
  if (ctx.userId !== state.userId) throw stateInvalid();
  if (!(query.code ?? '').trim()) throw connectFailed('cancelled');

  const shopId = (query.shop_id ?? '').trim();
  if (state.provider !== 'shopee' || !shopId) return null;
  return precheckCredentialConnect(deps, {
    workspaceId: state.workspaceId,
    provider: state.provider,
    providerStoreId: shopId,
    connectionId: state.connectionId,
    actorId: ctx.userId,
  });
}
