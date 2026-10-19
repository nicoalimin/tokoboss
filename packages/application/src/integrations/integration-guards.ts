import {
  isMarketplaceProvider,
  type MarketplaceProvider,
} from '@tokoboss/domain';
import type { WorkspaceContext, WorkspaceRole } from '../tenancy/tenancy-types';
import { assertSameWorkspace } from '../tenancy/workspace-context';
import {
  integrationRoleForbidden,
  providerNotAvailable,
} from './integration-errors';

/**
 * Marketplace integration access guards (US20 / RFC 04 task 18).
 *
 * Order: workspace first (non-member, inactive or other workspace →
 * tenancy forbidden, indistinguishable from not-found), then the role gate
 * (403 ROLE_FORBIDDEN), then provider availability (404
 * PROVIDER_NOT_AVAILABLE).
 *
 * - Writes (connect, reauthorize, disconnect, remove): Admin only.
 * - Connection status reads: every active member (Staff included).
 * - Staged listing + order preview reads: Admin or Manager (Staff 403).
 */

export const INTEGRATION_WRITE_ROLES: readonly WorkspaceRole[] = ['admin'];

export const INTEGRATION_STATUS_READ_ROLES: readonly WorkspaceRole[] = [
  'admin',
  'manager',
  'staff',
];

export const INTEGRATION_LISTING_READ_ROLES: readonly WorkspaceRole[] = [
  'admin',
  'manager',
];

function assertIntegrationRole(
  ctx: WorkspaceContext | null,
  workspaceId: string,
  allowed: readonly WorkspaceRole[]
): asserts ctx is WorkspaceContext {
  assertSameWorkspace(ctx, workspaceId);
  if (!allowed.includes(ctx.role)) throw integrationRoleForbidden();
}

/** Connect / reauthorize / disconnect / remove: Admin only. */
export function assertIntegrationWrite(
  ctx: WorkspaceContext | null,
  workspaceId: string
): asserts ctx is WorkspaceContext {
  assertIntegrationRole(ctx, workspaceId, INTEGRATION_WRITE_ROLES);
}

/** Connection list / status: any active member of the workspace. */
export function assertIntegrationStatusRead(
  ctx: WorkspaceContext | null,
  workspaceId: string
): asserts ctx is WorkspaceContext {
  assertIntegrationRole(ctx, workspaceId, INTEGRATION_STATUS_READ_ROLES);
}

/** Staged listings and order previews: Admin or Manager. */
export function assertIntegrationListingRead(
  ctx: WorkspaceContext | null,
  workspaceId: string
): asserts ctx is WorkspaceContext {
  assertIntegrationRole(ctx, workspaceId, INTEGRATION_LISTING_READ_ROLES);
}

/**
 * Provider gate: an unknown slug, or a provider missing from the enabled
 * list (MARKETPLACE_PROVIDERS_ENABLED, resolved by the connector registry),
 * is a neutral 404. Returns the narrowed provider.
 */
export function requireEnabledProvider(
  provider: string,
  enabled: readonly MarketplaceProvider[]
): MarketplaceProvider {
  const slug = (provider ?? '').trim();
  if (!isMarketplaceProvider(slug) || !enabled.includes(slug)) {
    throw providerNotAvailable();
  }
  return slug;
}
