import type { DatabasePort } from '@tokoboss/domain';

/**
 * Minimal row shapes mirroring `tenants` / `audit_events` for the
 * in-memory test double. Timestamps are UTC (`new Date()` serialises to UTC).
 */
export interface InMemoryTenant {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InMemoryAuditEvent {
  id: string;
  tenantId: string;
  eventType: string;
  payload: unknown;
  occurredAt: Date;
}

/**
 * In-memory `DatabasePort` implementation (UTA-10).
 *
 * Used by tests and the transaction integration test: `transaction()`
 * snapshots state, commits on resolve, and restores the snapshot on reject.
 * Nested transactions stack snapshots, so inner rollback restores the
 * outer transaction's staged state.
 *
 * Contains only synthetic data — never production data or credentials.
 */
export class InMemoryDatabase implements DatabasePort {
  private tenants: InMemoryTenant[] = [];
  private auditEvents: InMemoryAuditEvent[] = [];
  private readonly snapshots: Array<{
    tenants: InMemoryTenant[];
    auditEvents: InMemoryAuditEvent[];
  }> = [];

  insertTenant(input: { id: string; name: string }): InMemoryTenant {
    const now = new Date();
    const tenant: InMemoryTenant = {
      id: input.id,
      name: input.name,
      createdAt: now,
      updatedAt: now,
    };
    this.tenants.push(tenant);
    return tenant;
  }

  insertAuditEvent(input: {
    id: string;
    tenantId: string;
    eventType: string;
    payload?: unknown;
  }): InMemoryAuditEvent {
    const tenantExists = this.tenants.some((t) => t.id === input.tenantId);
    if (!tenantExists) {
      throw new Error(`tenant ${input.tenantId} does not exist (FK violation)`);
    }
    const event: InMemoryAuditEvent = {
      id: input.id,
      tenantId: input.tenantId,
      eventType: input.eventType,
      payload: input.payload ?? {},
      occurredAt: new Date(),
    };
    this.auditEvents.push(event);
    return event;
  }

  listTenants(): InMemoryTenant[] {
    return [...this.tenants];
  }

  listAuditEvents(): InMemoryAuditEvent[] {
    return [...this.auditEvents];
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    this.snapshots.push({
      tenants: [...this.tenants],
      auditEvents: [...this.auditEvents],
    });
    try {
      const result = await fn();
      this.snapshots.pop();
      return result;
    } catch (error) {
      const snapshot = this.snapshots.pop();
      if (snapshot !== undefined) {
        this.tenants = snapshot.tenants;
        this.auditEvents = snapshot.auditEvents;
      }
      throw error;
    }
  }

  async ping(): Promise<void> {
    return undefined;
  }

  async close(): Promise<void> {
    return undefined;
  }
}
