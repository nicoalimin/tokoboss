import type { TenancyAuditSink } from '../tenancy/tenancy-ports';
import { planInboundEvent } from './inbound-event-plan';
import type { InboundEventStatus } from './integration-port-inputs';
import type * as ports from './integration-ports';

export interface ProcessInboundEventTx {
  connections: Pick<ports.ConnectionStore, 'update'>;
  vault: Pick<ports.CredentialVault, 'shred'>;
}

export interface ProcessInboundEventDeps {
  events: Pick<ports.InboundEventStore, 'find' | 'markStatus'>;
  connections: Pick<ports.ConnectionStore, 'find'>;
  audit: Pick<TenancyAuditSink, 'append'>;
  transaction<T>(fn: (tx: ProcessInboundEventTx) => Promise<T>): Promise<T>;
  now(): Date;
}

export type ProcessInboundEventResult = InboundEventStatus | 'skipped';

/**
 * Inbound event job (US20 / RFC 04 task 30b). Runs only `received` events
 * (anything else → 'skipped', so a re-delivered job is a no-op). A missing
 * or removed connection → `ignored`. The planner (task 30a) decides the
 * row change; it is written in one transaction with the credential shred,
 * then audited as the system. A stale row version → `failed`.
 */
export async function processInboundEvent(
  deps: ProcessInboundEventDeps,
  eventId: string
): Promise<ProcessInboundEventResult> {
  const event = await deps.events.find(eventId);
  if (!event || event.status !== 'received') return 'skipped';
  const now = deps.now();
  const finish = async (
    status: InboundEventStatus,
    errorCode: string | null = null
  ): Promise<InboundEventStatus> => {
    await deps.events.markStatus(eventId, status, {
      attempts: event.attempts + 1,
      processedAt: now,
      errorCode,
    });
    return status;
  };
  const { workspaceId, connectionId } = event;
  const row =
    workspaceId && connectionId
      ? await deps.connections.find(workspaceId, connectionId)
      : null;
  if (!row || row.removedAt) return finish('ignored');
  const plan = planInboundEvent(event.eventType, row, now);
  if (plan === 'not_in_scope') return finish('not_in_scope');
  if (!plan) return finish('processed');
  try {
    await deps.transaction(async (tx) => {
      await tx.connections.update({
        workspaceId: row.workspaceId,
        connectionId: row.id,
        expectedVersion: row.version,
        patch: plan.patch,
      });
      if (plan.shredCredentials) await tx.vault.shred(row.id);
    });
  } catch {
    return finish('failed', 'CONNECTION_UPDATE_FAILED');
  }
  await deps.audit.append({
    workspaceId: row.workspaceId,
    action: plan.auditAction,
    category: 'workspace',
    actorType: 'system',
    payload: {
      connectionId: row.id,
      provider: row.provider,
      providerStoreId: row.providerStoreId,
      inboundEventId: eventId,
      ...plan.auditDetail,
    },
  });
  return finish('processed');
}
