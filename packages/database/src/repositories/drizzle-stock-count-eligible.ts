import { and, eq, inArray, notExists } from 'drizzle-orm';
import type { DatabaseHandle, Transaction } from '../db';
import { catalogBundleLines, catalogVariants } from '../schema/index';

/**
 * Eligible-variant helpers for stock opname (US12 / RFC 03 task 22d).
 * Active non-bundle variants in scope; used by countEligibleVariants and
 * later createSession (22e).
 */

type DbOrTx = Transaction | DatabaseHandle;

/** Active, non-bundle variant ids in scope (null variantIds = all). */
export async function listEligibleVariantIds(
  db: DbOrTx,
  workspaceId: string,
  variantIds: string[] | null
): Promise<string[]> {
  if (variantIds !== null && variantIds.length === 0) return [];
  const filters = [
    eq(catalogVariants.workspaceId, workspaceId),
    eq(catalogVariants.status, 'active'),
    notExists(
      db
        .select({ id: catalogBundleLines.id })
        .from(catalogBundleLines)
        .where(
          and(
            eq(catalogBundleLines.workspaceId, workspaceId),
            eq(catalogBundleLines.bundleVariantId, catalogVariants.id)
          )
        )
    ),
  ];
  if (variantIds !== null) {
    filters.push(inArray(catalogVariants.id, variantIds));
  }
  const rows = await db
    .select({ id: catalogVariants.id })
    .from(catalogVariants)
    .where(and(...filters));
  return rows.map((r: { id: string }) => r.id);
}

/** Port: countEligibleVariants (warehouseId reserved for parity with in-memory). */
export async function countEligibleVariants(
  db: DbOrTx,
  input: {
    workspaceId: string;
    warehouseId: string;
    variantIds: string[] | null;
  }
): Promise<number> {
  return (await listEligibleVariantIds(db, input.workspaceId, input.variantIds))
    .length;
}
