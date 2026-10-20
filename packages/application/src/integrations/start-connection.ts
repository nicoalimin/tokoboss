import {
  MARKETPLACE_CONNECT_MODES,
  type MarketplaceConnector,
  type MarketplaceProvider,
} from '@tokoboss/domain';
import { hashToken, mintToken } from '../auth/crypto';
import type { WorkspaceContext } from '../tenancy/tenancy-types';
import { connectionNotFound } from './integration-errors';
import {
  assertIntegrationWrite,
  requireEnabledProvider,
} from './integration-guards';
import type { ConnectionStore, OAuthStateStore } from './integration-ports';

/**
 * Start a connection or a reauthorize / reconnect (US20 / RFC 04 task 20).
 *
 * Admin only. Shopee and TikTok Shop (`oauth_redirect`): store a hashed
 * 32-byte state (10 min, single use, bound to workspace + user, carrying
 * `connectionId` on reconnect) and return the authorize URL. Blibli
 * (`credential_binding`): no state; the UI shows the key form. No
 * connection row and no claim are created here.
 */

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export interface StartConnectionDeps {
  connections: Pick<ConnectionStore, 'find'>;
  oauthStates: Pick<OAuthStateStore, 'create'>;
  connectorFor(provider: MarketplaceProvider): MarketplaceConnector;
  enabledProviders: readonly MarketplaceProvider[];
  redirectUri(provider: MarketplaceProvider): string;
  newId(): string;
  now(): Date;
}

export interface StartConnectionInput {
  workspaceId: string;
  provider: string;
  /** Set for reauthorize / reconnect of this workspace's existing row. */
  connectionId?: string | null;
}

export type StartConnectionResult =
  | {
      mode: 'oauth_redirect';
      provider: MarketplaceProvider;
      connectionId: string | null;
      authorizeUrl: string;
      expiresAt: Date;
    }
  | {
      mode: 'credential_binding';
      provider: MarketplaceProvider;
      connectionId: string | null;
    };

export async function startConnection(
  deps: StartConnectionDeps,
  ctx: WorkspaceContext | null,
  input: StartConnectionInput
): Promise<StartConnectionResult> {
  assertIntegrationWrite(ctx, input.workspaceId);
  const provider = requireEnabledProvider(
    input.provider,
    deps.enabledProviders
  );

  const connectionId = input.connectionId ?? null;
  if (connectionId) {
    const row = await deps.connections.find(input.workspaceId, connectionId);
    if (!row || row.removedAt || row.provider !== provider) {
      throw connectionNotFound();
    }
  }

  const mode = MARKETPLACE_CONNECT_MODES[provider];
  if (mode === 'credential_binding') {
    return { mode, provider, connectionId };
  }

  const state = mintToken();
  const expiresAt = new Date(deps.now().getTime() + OAUTH_STATE_TTL_MS);
  await deps.oauthStates.create(
    {
      id: deps.newId(),
      workspaceId: input.workspaceId,
      provider,
      userId: ctx.userId,
      connectionId,
      expiresAt,
      consumedAt: null,
    },
    hashToken(state)
  );
  const authorizeUrl = deps.connectorFor(provider).buildAuthorizeUrl({
    state,
    redirectUri: deps.redirectUri(provider),
  });
  return { mode, provider, connectionId, authorizeUrl, expiresAt };
}
