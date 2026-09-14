import { eq } from 'drizzle-orm';
import type { Transaction } from './db.js';
import { auditEvents, tenants } from './schema/index.js';

export interface SyntheticSeedOptions {
  /** Number of synthetic tenants to create. Defaults to 3. */
  tenantCount?: number;
  /** Prefix for deterministic synthetic slugs/names. Defaults to `synthetic`. */
  prefix?: string;
  /** Write an `seed.completed` audit event per tenant. Defaults to true. */
  withAuditEvents?: boolean;
}

export interface SyntheticSeedResult {
  tenantsCreated: number;
  auditEventsCreated: number;
  slugs: string[];
}

/**
 * Guard: seeds must never run against production. Callers pass the resolved
 * `APP_ENV`; when it is `production` we refuse unless `ALLOW_PROD_SEED=true`
 * is explicitly set (and even then only with synthetic data).
 */
export function assertSeedAllowed(appEnv: string | undefined): void {
  if (appEnv === 'production' && process.env.ALLOW_PROD_SEED !== 'true') {
    throw new Error(
      'Refusing to seed: APP_ENV=production. Seeds use synthetic data only and must target a non-production Neon branch.'
    );
  }
}

/**
 * Insert deterministic synthetic rows (no production data, no credentials).
 * Idempotent on `slug`: re-running skips existing tenants.
 * Must be called inside a transaction for atomicity — see `seedSynthetic`.
 */
export async function insertSyntheticSeed(
  tx: Transaction,
  options: SyntheticSeedOptions = {}
): Promise<SyntheticSeedResult> {
  const tenantCount = options.tenantCount ?? 3;
  const prefix = options.prefix ?? 'synthetic';
  const withAuditEvents = options.withAuditEvents ?? true;

  const slugs: string[] = [];
  let tenantsCreated = 0;
  let auditEventsCreated = 0;

  for (let i = 1; i <= tenantCount; i += 1) {
    const n = String(i).padStart(3, '0');
    const slug = `${prefix}-tenant-${n}`;
    const name = `Synthetic Tenant ${n}`;
    slugs.push(slug);

    const existing = await tx
      .select()
      .from(tenants)
      .where(eq(tenants.slug, slug));
    let tenantId: string;
    if (existing[0]) {
      tenantId = existing[0].id;
    } else {
      const inserted = await tx
        .insert(tenants)
        .values({ name, slug })
        .returning({ id: tenants.id });
      tenantId = inserted[0]?.id ?? '';
      tenantsCreated += 1;
    }

    if (withAuditEvents) {
      await tx.insert(auditEvents).values({
        tenantId,
        action: 'seed.completed',
        payload: { slug, synthetic: true },
      });
      auditEventsCreated += 1;
    }
  }

  return { tenantsCreated, auditEventsCreated, slugs };
}
