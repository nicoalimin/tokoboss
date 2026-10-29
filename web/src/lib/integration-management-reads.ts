/**
 * Story 18 read wiring (UTA-38 / US18, RFC 07 row 24a). Mirrors
 * `@/lib/integrations`: Postgres (`DATABASE_URL` set) through the Drizzle
 * metrics / activity read adapters, otherwise process-local in-memory fakes
 * that route tests seed through `__resetIntegrationManagementForTests`.
 */
import {
  DrizzleIntegrationActivityReads,
  DrizzleIntegrationMetricsReads,
  createDb,
  type DbHandle,
} from '@tokoboss/database';
import {
  InMemoryIntegrationActivityReads,
  InMemoryIntegrationMetricsReads,
  type ConnectionOperationalMetricsPort,
  type IntegrationActivityReadsPort,
} from '@tokoboss/application';
import { storageKind } from '@/lib/auth';

let dbHandle: DbHandle | null = null;
let memoryMetrics = new InMemoryIntegrationMetricsReads();
let memoryActivity = new InMemoryIntegrationActivityReads();

function getDbHandle(): DbHandle {
  if (!dbHandle) dbHandle = createDb(process.env['DATABASE_URL']);
  return dbHandle;
}

/** Per-store SKU / sync / order / warehouse metrics (stores with data). */
export function getIntegrationMetricsReads(): ConnectionOperationalMetricsPort {
  if (storageKind() === 'postgres') {
    return new DrizzleIntegrationMetricsReads(getDbHandle().db);
  }
  return memoryMetrics;
}

/** integration.* audit feed, newest first. */
export function getIntegrationActivityReads(): IntegrationActivityReadsPort {
  if (storageKind() === 'postgres') {
    return new DrizzleIntegrationActivityReads(getDbHandle().db);
  }
  return memoryActivity;
}

/** Test seam: fresh in-memory fakes, returned so tests can seed them. */
export function __resetIntegrationManagementForTests() {
  if (
    process.env['APP_ENV'] === 'production' ||
    process.env['VERCEL_ENV'] === 'production'
  ) {
    throw new Error('Refusing fixture reset in production');
  }
  memoryMetrics = new InMemoryIntegrationMetricsReads();
  memoryActivity = new InMemoryIntegrationActivityReads();
  return { metrics: memoryMetrics, activity: memoryActivity };
}
