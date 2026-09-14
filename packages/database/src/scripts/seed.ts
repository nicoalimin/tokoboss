/**
 * Synthetic seed (UTA-10).
 *
 * Generates deterministic, obviously-fake data (`SEED_` names, `seed.*`
 * event types) so seeded rows can never be mistaken for real data.
 *
 * Safety rules (acceptance criterion: no production data/credentials in
 * tests or seeds):
 * - Refuses to run when `APP_ENV=production` or `VERCEL_ENV=production`.
 * - With `DATABASE_URL` set (non-prod): writes via Drizzle inside one
 *   transaction — all-or-nothing.
 * - Without `DATABASE_URL`: seeds the in-memory adapter and prints a
 *   summary (DB-free smoke path for CI).
 */
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { auditEvents, tenants } from '../schema/index.js';
import { InMemoryDatabase } from '../db/in-memory-database.js';

const SEED_TENANT_COUNT = 3;
const SEED_EVENTS_PER_TENANT = 2;

function isProduction(): boolean {
  return (
    process.env.APP_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production'
  );
}

/** Deterministic PRNG (mulberry32) so seeds are reproducible. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SeedTenant {
  id: string;
  name: string;
}

interface SeedEvent {
  id: string;
  tenantId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

function buildSeedData(): { tenantList: SeedTenant[]; eventList: SeedEvent[] } {
  const rand = seededRandom(0x70_60_80_55);
  const tenantList: SeedTenant[] = Array.from(
    { length: SEED_TENANT_COUNT },
    (_, i) => ({
      id: randomUUID(),
      name: `SEED_Tenant_${String(i + 1).padStart(3, '0')}`,
    })
  );
  const eventTypes = ['seed.tenant.created', 'seed.inventory.adjusted'];
  const eventList: SeedEvent[] = tenantList.flatMap((tenant, ti) =>
    Array.from({ length: SEED_EVENTS_PER_TENANT }, (_, ei) => ({
      id: randomUUID(),
      tenantId: tenant.id,
      eventType: eventTypes[(ti + ei) % eventTypes.length] ?? 'seed.unknown',
      payload: { seed: true, seq: ti * SEED_EVENTS_PER_TENANT + ei, r: rand() },
    }))
  );
  for (const tenant of tenantList) {
    if (!tenant.name.startsWith('SEED_')) {
      throw new Error('seed guard: tenant names must carry the SEED_ prefix');
    }
  }
  return { tenantList, eventList };
}

async function seedLive(connectionString: string): Promise<void> {
  const { tenantList, eventList } = buildSeedData();
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const db = drizzle(client);
    await db.transaction(async (tx) => {
      for (const tenant of tenantList) {
        await tx.insert(tenants).values({ id: tenant.id, name: tenant.name });
      }
      for (const event of eventList) {
        await tx.insert(auditEvents).values({
          id: event.id,
          tenantId: event.tenantId,
          eventType: event.eventType,
          payload: event.payload,
        });
      }
    });
    console.log(
      `✅ Seeded ${tenantList.length} tenants + ${eventList.length} audit events (single transaction).`
    );
  } finally {
    await client.end();
  }
}

async function seedMemory(): Promise<void> {
  const { tenantList, eventList } = buildSeedData();
  const db = new InMemoryDatabase();
  await db.transaction(async () => {
    for (const tenant of tenantList) {
      db.insertTenant(tenant);
    }
    for (const event of eventList) {
      db.insertAuditEvent(event);
    }
  });
  console.log(
    `✅ Seeded in-memory: ${db.listTenants().length} tenants + ${db.listAuditEvents().length} audit events.`
  );
}

async function main(): Promise<void> {
  if (isProduction()) {
    console.error(
      '❌ Seed refuses to run in production (APP_ENV/VERCEL_ENV=production).'
    );
    process.exit(1);
  }
  const connectionString = process.env.DATABASE_URL ?? '';
  if (connectionString) {
    await seedLive(connectionString);
  } else {
    console.log(
      'ℹ️  DATABASE_URL not set — seeding in-memory adapter (no database touched).'
    );
    await seedMemory();
  }
}

main().catch((error) => {
  console.error(
    '❌ Seed failed:',
    error instanceof Error ? error.message : error
  );
  process.exit(1);
});
