import {
  INTEGRATION_ACTIVITY_ACTIONS,
  isIntegrationActivityAction,
  type IntegrationActivityEntry,
  type IntegrationActivityListInput,
  type IntegrationActivityReadsPort,
} from '@tokoboss/application';
import { isMarketplaceProvider } from '@tokoboss/domain';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { auditEvents as ae, type AuditEventRow } from '../schema/index';
import type { DbOrTx } from './drizzle-inventory-sync-scope';

/**
 * Postgres-backed IntegrationActivityReadsPort (UTA-38 / US18, RFC 07
 * row 20): integration.* audit_events of one workspace (tenant), optionally
 * narrowed to payload.connectionId, newest first. Callers clamp `limit`.
 */

const text = (value: unknown) => (typeof value === 'string' ? value : null);
const columns = {
  id: ae.id,
  action: ae.action,
  payload: ae.payload,
  actorType: ae.actorType,
  actorId: ae.actorId,
  createdAt: ae.createdAt,
};
type ActivityRow = Pick<
  AuditEventRow,
  'id' | 'action' | 'payload' | 'actorType' | 'actorId' | 'createdAt'
>;

function toEntry(
  row: ActivityRow,
  workspaceId: string
): IntegrationActivityEntry | null {
  if (!isIntegrationActivityAction(row.action)) return null;
  const payload = row.payload ?? {};
  const provider = text(payload.provider);
  return {
    id: row.id,
    workspaceId,
    action: row.action,
    connectionId: text(payload.connectionId),
    provider: provider && isMarketplaceProvider(provider) ? provider : null,
    storeName: text(payload.storeName),
    actorType: row.actorType,
    actorId: row.actorId,
    occurredAt: row.createdAt,
    payload,
  };
}

export class DrizzleIntegrationActivityReads implements IntegrationActivityReadsPort {
  constructor(private readonly db: DbOrTx) {}

  async listByWorkspace(
    input: IntegrationActivityListInput
  ): Promise<IntegrationActivityEntry[]> {
    const { workspaceId, connectionId, limit } = input;
    const rows: ActivityRow[] = await this.db
      .select(columns)
      .from(ae)
      .where(
        and(
          eq(ae.tenantId, workspaceId),
          inArray(ae.action, [...INTEGRATION_ACTIVITY_ACTIONS]),
          connectionId
            ? sql`${ae.payload}->>'connectionId' = ${connectionId}`
            : undefined
        )
      )
      .orderBy(desc(ae.createdAt), desc(ae.id))
      .limit(limit);
    return rows.flatMap((row) => toEntry(row, workspaceId) ?? []);
  }
}
