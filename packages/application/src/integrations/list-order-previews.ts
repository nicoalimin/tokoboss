import type { WorkspaceContext } from '../tenancy/tenancy-types';
import { ORDER_PREVIEW_WINDOW } from './initial-import-state';
import { connectionNotFound } from './integration-errors';
import { assertIntegrationListingRead } from './integration-guards';
import type * as ports from './integration-ports';
import type { OrderPreviewView } from './integration-types';

/**
 * Order preview review query (US20 / RFC 04 task 90a).
 *
 * Admin or Manager only (Staff 403 ROLE_FORBIDDEN), same guard as the
 * staged listings. Unknown, removed or other-workspace connection → 404
 * CONNECTION_NOT_FOUND. Returns the PII-free preview newest first
 * (undated last), capped at ORDER_PREVIEW_WINDOW.limit (50). Shape matches
 * the `IntegrationOrderPreviewList` contract. Read-only: no buyer data.
 */

export interface ListOrderPreviewsDeps {
  connections: Pick<ports.ConnectionStore, 'find'>;
  orderPreviews: Pick<ports.OrderPreviewStore, 'list'>;
}

export interface ListOrderPreviewsInput {
  workspaceId: string;
  connectionId: string;
}

export interface OrderPreviewList {
  orders: OrderPreviewView[];
}

function newestFirst(a: OrderPreviewView, b: OrderPreviewView): number {
  return (b.orderedAt?.getTime() ?? -1) - (a.orderedAt?.getTime() ?? -1);
}

export async function listOrderPreviews(
  deps: ListOrderPreviewsDeps,
  ctx: WorkspaceContext | null,
  input: ListOrderPreviewsInput
): Promise<OrderPreviewList> {
  assertIntegrationListingRead(ctx, input.workspaceId);
  const { workspaceId, connectionId } = input;

  const row = await deps.connections.find(workspaceId, connectionId);
  if (!row || row.removedAt) throw connectionNotFound();

  const orders = (await deps.orderPreviews.list({ workspaceId, connectionId }))
    .sort(newestFirst)
    .slice(0, ORDER_PREVIEW_WINDOW.limit);
  return { orders };
}
