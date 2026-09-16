import { describe, expect, it } from 'vitest';
import type { WorkspaceContext } from '../../tenancy/tenancy-types';
import { InMemoryCatalogStore } from '../../catalog/in-memory-catalog-store';
import {
  adjustStock,
  archiveProduct,
  archiveVariant,
  createProduct,
  createWarehouse,
} from '../../catalog/catalog-use-cases';
import {
  archiveBundle,
  createBundle,
  getBundleDetail,
  listBundles,
  updateBundle,
} from '../bundle-use-cases';

function admin(workspaceId: string): WorkspaceContext {
  return {
    workspaceId,
    userId: 'user_admin_1',
    role: 'admin',
    warehouseScope: null,
    status: 'active',
    authVersion: 1,
  };
}

function manager(workspaceId: string): WorkspaceContext {
  return {
    workspaceId,
    userId: 'user_manager_1',
    role: 'manager',
    warehouseScope: null,
    status: 'active',
    authVersion: 1,
  };
}

function staff(workspaceId: string): WorkspaceContext {
  return {
    workspaceId,
    userId: 'user_staff_1',
    role: 'staff',
    warehouseScope: null,
    status: 'active',
    authVersion: 1,
  };
}

const WS = 'ws_bundles_1';

async function seedVariants(store: InMemoryCatalogStore, ctx = admin(WS)) {
  const shell = await createProduct(store, {
    ctx,
    workspaceId: WS,
    name: 'Paket Hemat',
    variants: [{ skuCode: 'BUNDLE-HEMAT', sellingPriceCents: 150000 }],
  });
  const compA = await createProduct(store, {
    ctx,
    workspaceId: WS,
    name: 'Komponen A',
    variants: [{ skuCode: 'COMP-A', sellingPriceCents: 50000 }],
  });
  const compB = await createProduct(store, {
    ctx,
    workspaceId: WS,
    name: 'Komponen B',
    variants: [{ skuCode: 'COMP-B', sellingPriceCents: 60000 }],
  });
  return {
    bundleId: shell.variants[0]?.id ?? '',
    compAId: compA.variants[0]?.id ?? '',
    compBId: compB.variants[0]?.id ?? '',
  };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    return (err as { code?: unknown }).code as string;
  }
  throw new Error('expected use-case to throw');
}

describe('bundle use-cases (Story 13)', () => {
  it('creates a BOM and reads it back with components', async () => {
    const store = new InMemoryCatalogStore();
    const { bundleId, compAId, compBId } = await seedVariants(store);

    const created = await createBundle(store, {
      ctx: admin(WS),
      workspaceId: WS,
      bundleVariantId: bundleId,
      components: [
        { componentVariantId: compAId, qty: 2 },
        { componentVariantId: compBId, qty: 1 },
      ],
      expectedVersion: 1,
    });
    expect(created.bundle.skuCode).toBe('BUNDLE-HEMAT');
    expect(created.bundle.version).toBe(2);
    expect(created.lines.map((l) => l.line.qty)).toEqual([2, 1]);
    expect(created.lines.map((l) => l.component.skuCode).sort()).toEqual([
      'COMP-A',
      'COMP-B',
    ]);

    const detail = await getBundleDetail(store, {
      ctx: staff(WS),
      workspaceId: WS,
      bundleVariantId: bundleId,
    });
    expect(detail.lines).toHaveLength(2);

    const listed = await listBundles(store, {
      ctx: staff(WS),
      workspaceId: WS,
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.bundle.id).toBe(bundleId);
  });

  it('derives per-warehouse availability from component on-hand', async () => {
    const store = new InMemoryCatalogStore();
    const { bundleId, compAId, compBId } = await seedVariants(store);
    const warehouse = await createWarehouse(store, {
      ctx: admin(WS),
      workspaceId: WS,
      code: 'JKT-01',
      name: 'Jakarta',
    });
    await adjustStock(store, {
      ctx: admin(WS),
      workspaceId: WS,
      variantId: compAId,
      warehouseId: warehouse.id,
      delta: 10,
      reason: 'initial stock',
    });
    await adjustStock(store, {
      ctx: admin(WS),
      workspaceId: WS,
      variantId: compBId,
      warehouseId: warehouse.id,
      delta: 3,
      reason: 'initial stock',
    });
    // 10/2 = 5 assemblies vs 3/1 = 3 → availability 3.
    const created = await createBundle(store, {
      ctx: admin(WS),
      workspaceId: WS,
      bundleVariantId: bundleId,
      components: [
        { componentVariantId: compAId, qty: 2 },
        { componentVariantId: compBId, qty: 1 },
      ],
      expectedVersion: 1,
    });
    expect(created.availability).toEqual([
      { warehouseId: warehouse.id, available: 3 },
    ]);
  });

  it('rejects empty, duplicate, and non-positive-quantity lines', async () => {
    const store = new InMemoryCatalogStore();
    const { bundleId, compAId } = await seedVariants(store);

    expect(
      await codeOf(
        createBundle(store, {
          ctx: admin(WS),
          workspaceId: WS,
          bundleVariantId: bundleId,
          components: [],
          expectedVersion: 1,
        })
      )
    ).toBe('BUNDLE_VALIDATION');

    for (const qty of [0, -2, 1.5, Number.NaN]) {
      expect(
        await codeOf(
          createBundle(store, {
            ctx: admin(WS),
            workspaceId: WS,
            bundleVariantId: bundleId,
            components: [{ componentVariantId: compAId, qty }],
            expectedVersion: 1,
          })
        )
      ).toBe('BUNDLE_VALIDATION');
    }

    expect(
      await codeOf(
        createBundle(store, {
          ctx: admin(WS),
          workspaceId: WS,
          bundleVariantId: bundleId,
          components: [
            { componentVariantId: compAId, qty: 1 },
            { componentVariantId: compAId, qty: 2 },
          ],
          expectedVersion: 1,
        })
      )
    ).toBe('BUNDLE_CONFLICT');
  });

  it('blocks self-reference and direct + transitive cycles', async () => {
    const store = new InMemoryCatalogStore();
    const { bundleId, compAId, compBId } = await seedVariants(store);

    // Self-reference.
    expect(
      await codeOf(
        createBundle(store, {
          ctx: admin(WS),
          workspaceId: WS,
          bundleVariantId: bundleId,
          components: [{ componentVariantId: bundleId, qty: 1 }],
          expectedVersion: 1,
        })
      )
    ).toBe('BUNDLE_CYCLE');

    // A → B, then B → A is a 2-cycle.
    await createBundle(store, {
      ctx: admin(WS),
      workspaceId: WS,
      bundleVariantId: bundleId,
      components: [{ componentVariantId: compAId, qty: 1 }],
      expectedVersion: 1,
    });
    expect(
      await codeOf(
        createBundle(store, {
          ctx: admin(WS),
          workspaceId: WS,
          bundleVariantId: compAId,
          components: [{ componentVariantId: bundleId, qty: 1 }],
          expectedVersion: 1,
        })
      )
    ).toBe('BUNDLE_CYCLE');

    // Transitive: BUNDLE → A → B, then B → BUNDLE closes the loop.
    await createBundle(store, {
      ctx: admin(WS),
      workspaceId: WS,
      bundleVariantId: compAId,
      components: [{ componentVariantId: compBId, qty: 1 }],
      expectedVersion: 1,
    });
    expect(
      await codeOf(
        createBundle(store, {
          ctx: admin(WS),
          workspaceId: WS,
          bundleVariantId: compBId,
          components: [{ componentVariantId: bundleId, qty: 1 }],
          expectedVersion: 1,
        })
      )
    ).toBe('BUNDLE_CYCLE');
  });

  it('requires active bundle shells and active components', async () => {
    const store = new InMemoryCatalogStore();
    const { bundleId, compAId, compBId } = await seedVariants(store);

    await archiveVariant(store, {
      ctx: admin(WS),
      workspaceId: WS,
      variantId: compAId,
    });
    expect(
      await codeOf(
        createBundle(store, {
          ctx: admin(WS),
          workspaceId: WS,
          bundleVariantId: bundleId,
          components: [
            { componentVariantId: compAId, qty: 1 },
            { componentVariantId: compBId, qty: 1 },
          ],
          expectedVersion: 1,
        })
      )
    ).toBe('BUNDLE_VALIDATION');

    expect(
      await codeOf(
        createBundle(store, {
          ctx: admin(WS),
          workspaceId: WS,
          bundleVariantId: 'missing-variant',
          components: [{ componentVariantId: compBId, qty: 1 }],
          expectedVersion: 1,
        })
      )
    ).toBe('CATALOG_NOT_FOUND');

    // Archived shells cannot hold a BOM.
    await archiveVariant(store, {
      ctx: admin(WS),
      workspaceId: WS,
      variantId: bundleId,
    });
    expect(
      await codeOf(
        createBundle(store, {
          ctx: admin(WS),
          workspaceId: WS,
          bundleVariantId: bundleId,
          components: [{ componentVariantId: compBId, qty: 1 }],
          expectedVersion: 2,
        })
      )
    ).toBe('BUNDLE_VALIDATION');
  });

  it('creates once, updates atomically, and rejects stale versions', async () => {
    const store = new InMemoryCatalogStore();
    const { bundleId, compAId, compBId } = await seedVariants(store);

    const created = await createBundle(store, {
      ctx: manager(WS),
      workspaceId: WS,
      bundleVariantId: bundleId,
      components: [{ componentVariantId: compAId, qty: 1 }],
      expectedVersion: 1,
    });
    expect(created.bundle.version).toBe(2);

    expect(
      await codeOf(
        createBundle(store, {
          ctx: admin(WS),
          workspaceId: WS,
          bundleVariantId: bundleId,
          components: [{ componentVariantId: compBId, qty: 1 }],
          expectedVersion: 2,
        })
      )
    ).toBe('BUNDLE_CONFLICT');

    const updated = await updateBundle(store, {
      ctx: admin(WS),
      workspaceId: WS,
      bundleVariantId: bundleId,
      components: [
        { componentVariantId: compAId, qty: 3 },
        { componentVariantId: compBId, qty: 2 },
      ],
      expectedVersion: 2,
    });
    expect(updated.bundle.version).toBe(3);
    expect(updated.lines.map((l) => l.line.qty)).toEqual([3, 2]);

    expect(
      await codeOf(
        updateBundle(store, {
          ctx: admin(WS),
          workspaceId: WS,
          bundleVariantId: bundleId,
          components: [{ componentVariantId: compAId, qty: 9 }],
          expectedVersion: 2,
        })
      )
    ).toBe('BUNDLE_VERSION_CONFLICT');

    // Nothing changed on the stale write.
    const detail = await getBundleDetail(store, {
      ctx: admin(WS),
      workspaceId: WS,
      bundleVariantId: bundleId,
    });
    expect(detail.lines.map((l) => l.line.qty)).toEqual([3, 2]);
  });

  it('returns 404 for BOM-less variants and archives idempotently', async () => {
    const store = new InMemoryCatalogStore();
    const { bundleId, compAId } = await seedVariants(store);

    expect(
      await codeOf(
        getBundleDetail(store, {
          ctx: admin(WS),
          workspaceId: WS,
          bundleVariantId: bundleId,
        })
      )
    ).toBe('BUNDLE_NOT_FOUND');
    expect(
      await codeOf(
        updateBundle(store, {
          ctx: admin(WS),
          workspaceId: WS,
          bundleVariantId: bundleId,
          components: [{ componentVariantId: compAId, qty: 1 }],
          expectedVersion: 1,
        })
      )
    ).toBe('BUNDLE_NOT_FOUND');

    const created = await createBundle(store, {
      ctx: admin(WS),
      workspaceId: WS,
      bundleVariantId: bundleId,
      components: [{ componentVariantId: compAId, qty: 2 }],
      expectedVersion: 1,
    });
    const archived = await archiveBundle(store, {
      ctx: manager(WS),
      workspaceId: WS,
      bundleVariantId: bundleId,
      expectedVersion: created.bundle.version,
    });
    expect(archived.lines).toEqual([]);
    expect(archived.bundle.version).toBe(created.bundle.version + 1);

    // Second archive is a no-op (same version, still empty).
    const again = await archiveBundle(store, {
      ctx: admin(WS),
      workspaceId: WS,
      bundleVariantId: bundleId,
      expectedVersion: archived.bundle.version,
    });
    expect(again.lines).toEqual([]);
    expect(again.bundle.version).toBe(archived.bundle.version);
    expect(
      await codeOf(
        getBundleDetail(store, {
          ctx: admin(WS),
          workspaceId: WS,
          bundleVariantId: bundleId,
        })
      )
    ).toBe('BUNDLE_NOT_FOUND');
  });

  it('holds no direct stock: bundle adjustments reject, components adjust', async () => {
    const store = new InMemoryCatalogStore();
    const { bundleId, compAId } = await seedVariants(store);
    const warehouse = await createWarehouse(store, {
      ctx: admin(WS),
      workspaceId: WS,
      code: 'JKT-01',
      name: 'Jakarta',
    });
    await createBundle(store, {
      ctx: admin(WS),
      workspaceId: WS,
      bundleVariantId: bundleId,
      components: [{ componentVariantId: compAId, qty: 1 }],
      expectedVersion: 1,
    });

    expect(
      await codeOf(
        adjustStock(store, {
          ctx: admin(WS),
          workspaceId: WS,
          variantId: bundleId,
          warehouseId: warehouse.id,
          delta: 5,
          reason: 'bundle receipt',
        })
      )
    ).toBe('BUNDLE_NO_DIRECT_STOCK');

    const adjusted = await adjustStock(store, {
      ctx: admin(WS),
      workspaceId: WS,
      variantId: compAId,
      warehouseId: warehouse.id,
      delta: 5,
      reason: 'component receipt',
    });
    expect(adjusted.level.qty).toBe(5);
  });

  it('blocks archiving variants consumed by an active BOM', async () => {
    const store = new InMemoryCatalogStore();
    const { bundleId, compAId, compBId } = await seedVariants(store);
    const created = await createBundle(store, {
      ctx: admin(WS),
      workspaceId: WS,
      bundleVariantId: bundleId,
      components: [
        { componentVariantId: compAId, qty: 1 },
        { componentVariantId: compBId, qty: 1 },
      ],
      expectedVersion: 1,
    });

    expect(
      await codeOf(
        archiveVariant(store, {
          ctx: admin(WS),
          workspaceId: WS,
          variantId: compAId,
        })
      )
    ).toBe('CATALOG_CONFLICT');

    // The BOM must be cleared before the component can retire.
    await archiveBundle(store, {
      ctx: admin(WS),
      workspaceId: WS,
      bundleVariantId: bundleId,
      expectedVersion: created.bundle.version,
    });
    await expect(
      archiveVariant(store, {
        ctx: admin(WS),
        workspaceId: WS,
        variantId: compAId,
      })
    ).resolves.toMatchObject({ status: 'archived' });
  });

  it('blocks product archives that would orphan an active bundle', async () => {
    const store = new InMemoryCatalogStore();
    const { bundleId, compAId } = await seedVariants(store);
    await createBundle(store, {
      ctx: admin(WS),
      workspaceId: WS,
      bundleVariantId: bundleId,
      components: [{ componentVariantId: compAId, qty: 1 }],
      expectedVersion: 1,
    });
    const compA = await store.findVariantById(WS, compAId);
    expect(
      await codeOf(
        archiveProduct(store, {
          ctx: admin(WS),
          workspaceId: WS,
          productId: compA?.productId ?? '',
        })
      )
    ).toBe('CATALOG_CONFLICT');
  });

  it('enforces tenancy and RBAC', async () => {
    const store = new InMemoryCatalogStore();
    const { bundleId, compAId } = await seedVariants(store);

    // Staff writes are denied; staff reads are fine.
    expect(
      await codeOf(
        createBundle(store, {
          ctx: staff(WS),
          workspaceId: WS,
          bundleVariantId: bundleId,
          components: [{ componentVariantId: compAId, qty: 1 }],
          expectedVersion: 1,
        })
      )
    ).toBe('TENANCY_FORBIDDEN');

    await createBundle(store, {
      ctx: admin(WS),
      workspaceId: WS,
      bundleVariantId: bundleId,
      components: [{ componentVariantId: compAId, qty: 1 }],
      expectedVersion: 1,
    });
    const listed = await listBundles(store, {
      ctx: staff(WS),
      workspaceId: WS,
    });
    expect(listed).toHaveLength(1);

    // Cross-workspace reads see nothing (indistinguishable 404).
    expect(
      await codeOf(
        getBundleDetail(store, {
          ctx: admin('ws_other'),
          workspaceId: 'ws_other',
          bundleVariantId: bundleId,
        })
      )
    ).toBe('CATALOG_NOT_FOUND');
  });
});
