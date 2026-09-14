import type { Repository } from '@tokoboss/domain';
import { eq } from 'drizzle-orm';
import type { Transaction } from '../db.js';
import { auditEvents, tenants } from '../schema/index.js';
import type { NewAuditEventRow } from '../schema/index.js';

export interface TenantEntity {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Structural query surface shared by the postgres-js adapter and the PGlite
 * test adapter (`drizzle-orm/postgres-js` vs `drizzle-orm/pglite`).
 * `any`-typed builders keep this port dialect-agnostic; inputs and outputs
 * stay typed via `TenantEntity` / row types at the method boundaries.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQueryBuilder = any;
interface DialectAgnosticDb {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  select: (...args: any[]) => AnyQueryBuilder;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insert: (...args: any[]) => AnyQueryBuilder;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update: (...args: any[]) => AnyQueryBuilder;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete: (...args: any[]) => AnyQueryBuilder;
}

type DbOrTx = Transaction | DialectAgnosticDb;

function toEntity(row: typeof tenants.$inferSelect): TenantEntity {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Drizzle-backed implementation of the domain `Repository` port for tenants.
 * Accepts either a root `Database` or a `Transaction` handle so callers can
 * compose multi-table writes atomically via `withTransaction`.
 */
export class DrizzleTenantRepository implements Repository<
  TenantEntity,
  string
> {
  constructor(private readonly db: DbOrTx) {}

  /** Rebind this repository to a transaction handle. */
  withTransaction(tx: DbOrTx): DrizzleTenantRepository {
    return new DrizzleTenantRepository(tx);
  }

  async findById(id: string): Promise<TenantEntity | null> {
    const rows = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1);
    const row = rows[0];
    return row ? toEntity(row) : null;
  }

  async findBySlug(slug: string): Promise<TenantEntity | null> {
    const rows = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);
    const row = rows[0];
    return row ? toEntity(row) : null;
  }

  async save(entity: TenantEntity): Promise<TenantEntity> {
    const existing = await this.findById(entity.id);
    if (existing) {
      const rows = await this.db
        .update(tenants)
        .set({ name: entity.name, slug: entity.slug, updatedAt: new Date() })
        .where(eq(tenants.id, entity.id))
        .returning();
      const updated = rows[0];
      if (!updated) throw new Error(`Failed to update tenant ${entity.id}`);
      return toEntity(updated);
    }
    const rows = await this.db
      .insert(tenants)
      .values({ id: entity.id, name: entity.name, slug: entity.slug })
      .returning();
    const created = rows[0];
    if (!created) throw new Error(`Failed to insert tenant ${entity.id}`);
    return toEntity(created);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(tenants).where(eq(tenants.id, id));
  }

  /**
   * Transactional unit of work used by the integration test and app code:
   * create a tenant plus its audit event atomically.
   */
  async createWithAuditEvent(
    tenant: { id?: string; name: string; slug: string },
    event: { action: string; payload?: Record<string, unknown> }
  ): Promise<TenantEntity> {
    const inserted = await this.db
      .insert(tenants)
      .values({
        ...(tenant.id ? { id: tenant.id } : {}),
        name: tenant.name,
        slug: tenant.slug,
      })
      .returning();
    const created = inserted[0];
    if (!created) throw new Error('Failed to insert tenant');
    const audit: NewAuditEventRow = {
      tenantId: created.id,
      action: event.action,
      payload: event.payload ?? null,
    };
    await this.db.insert(auditEvents).values(audit);
    return toEntity(created);
  }
}
