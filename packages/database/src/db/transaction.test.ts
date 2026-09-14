/**
 * Transaction integration test through the `DatabasePort` (UTA-10).
 *
 * Exercises commit/rollback semantics against the in-memory adapter (always)
 * and the real Drizzle/Neon adapter when `DATABASE_URL` is set (otherwise
 * skipped — CI never needs production data or credentials).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DatabasePort } from '@tokoboss/domain';
import { InMemoryDatabase } from './in-memory-database.js';
import { TransactionFailedError, withTransaction } from './transaction.js';
import { DrizzleDatabase } from './client.js';

async function countTenants(db: InMemoryDatabase): Promise<number> {
  return db.listTenants().length;
}

describe('DatabasePort transactions (in-memory adapter)', () => {
  it('commits tenant + audit event atomically', async () => {
    const db: DatabasePort = new InMemoryDatabase();
    const store = db as InMemoryDatabase;

    await withTransaction(db, 'create-tenant', async () => {
      store.insertTenant({ id: 't-1', name: 'Toko Maju' });
      store.insertAuditEvent({ id: 'e-1', tenantId: 't-1', eventType: 'seed.test' });
    });

    assert.equal(await countTenants(store), 1);
    assert.equal(store.listAuditEvents().length, 1);
  });

  it('rolls back all writes when the unit of work throws', async () => {
    const db = new InMemoryDatabase();

    await assert.rejects(
      withTransaction(db, 'failing-op', async () => {
        db.insertTenant({ id: 't-2', name: 'Toko Gagal' });
        throw new Error('boom');
      }),
      (error: unknown) => {
        assert.ok(error instanceof TransactionFailedError);
        assert.equal((error as TransactionFailedError).operation, 'failing-op');
        assert.equal((error as Error).cause instanceof Error, true);
        return true;
      }
    );

    assert.equal(await countTenants(db), 0);
    assert.equal(db.listAuditEvents().length, 0);
  });

  it('rolls back on foreign-key violation', async () => {
    const db = new InMemoryDatabase();

    await assert.rejects(
      withTransaction(db, 'fk-op', async () => {
        db.insertTenant({ id: 't-3', name: 'Toko FK' });
        db.insertAuditEvent({ id: 'e-3', tenantId: 'missing-tenant', eventType: 'x' });
      }),
      (error: unknown) => {
        assert.ok(error instanceof TransactionFailedError);
        assert.match(String((error as Error).cause), /does not exist/);
        return true;
      }
    );

    assert.equal(await countTenants(db), 0);
  });

  it('nested transactions join the ambient transaction', async () => {
    const db = new InMemoryDatabase();

    await db.transaction(async () => {
      db.insertTenant({ id: 'outer', name: 'Outer' });
      await db.transaction(async () => {
        db.insertTenant({ id: 'inner', name: 'Inner' });
      });
    });
    assert.equal(await countTenants(db), 2);

    await assert.rejects(
      db.transaction(async () => {
        db.insertTenant({ id: 'outer-2', name: 'Outer 2' });
        await db.transaction(async () => {
          db.insertTenant({ id: 'inner-2', name: 'Inner 2' });
          throw new Error('inner boom');
        });
      })
    );
    assert.equal(await countTenants(db), 2);
  });

  it('ping/close resolve without a real connection', async () => {
    const db = new InMemoryDatabase();
    await db.ping();
    await db.close();
  });
});

describe('DatabasePort transactions (live Drizzle adapter)', () => {
  const liveUrl = process.env.DATABASE_URL ?? '';
  const skip = liveUrl === '' ? 'DATABASE_URL not set — skipping live adapter test' : false;

  it(
    'commits and rolls back through the real driver',
    { skip },
    async () => {
      const db = new DrizzleDatabase({ connectionString: liveUrl });
      try {
        await db.ping();
        const ok = await db.transaction(async () => 'committed');
        assert.equal(ok, 'committed');
        await assert.rejects(
          db.transaction(async () => {
            throw new Error('live rollback probe');
          }),
          /live rollback probe/
        );
      } finally {
        await db.close();
      }
    }
  );
});
