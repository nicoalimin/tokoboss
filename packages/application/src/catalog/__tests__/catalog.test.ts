import { describe, expect, it } from 'vitest';
import type { WorkspaceContext } from '../../tenancy/tenancy-types';
import { InMemoryCatalogStore } from '../in-memory-catalog-store';
import {
  adjustStock,
  archiveProduct,
  archiveVariant,
  createMapping,
  createProduct,
  createVariant,
  createWarehouse,
  deleteMapping,
  getLedger,
  getProductDetail,
  getStockBalance,
  getStockSettings,
  listProducts,
  searchCatalog,
  updateProduct,
  updateStockSettings,
  updateVariant,
  updateWarehouse,
} from '../catalog-use-cases';

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

function staff(
  workspaceId: string,
  warehouseScope: string | null = null
): WorkspaceContext {
  return {
    workspaceId,
    userId: 'user_staff_1',
    role: 'staff',
    warehouseScope,
    status: 'active',
    authVersion: 1,
  };
}

function scopedManager(
  workspaceId: string,
  warehouseScope: string
): WorkspaceContext {
  return {
    workspaceId,
    userId: 'user_manager_scoped',
    role: 'manager',
    warehouseScope,
    status: 'active',
    authVersion: 1,
  };
}

const WS = 'ws_catalog_1';

async function seedWarehouse(
  store: InMemoryCatalogStore,
  ctx: WorkspaceContext = admin(WS)
) {
  return createWarehouse(store, {
    ctx,
    workspaceId: WS,
    code: 'JKT-01',
    name: 'Jakarta',
  });
}

async function seedProduct(
  store: InMemoryCatalogStore,
  ctx: WorkspaceContext = admin(WS),
  skuCode = 'TSHIRT-RED-M'
) {
  return createProduct(store, {
    ctx,
    workspaceId: WS,
    name: 'Kaos Polos',
    unit: 'pcs',
    variants: [
      {
        skuCode,
        name: 'Merah / M',
        barcode: '8991234567890',
        sellingPriceCents: 99000,
        hppCents: 45000,
        costSource: 'manual',
        listingName: 'Kaos Polos Merah M',
      },
    ],
  });
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    return (err as { code?: unknown }).code as string;
  }
  throw new Error('expected use-case to throw');
}

describe('catalog use-cases (Story 01)', () => {
  it('creates a product with variants and rejects empty variant lists', async () => {
    const store = new InMemoryCatalogStore();
    const created = await seedProduct(store);
    expect(created.product.version).toBe(1);
    expect(created.variants).toHaveLength(1);
    expect(created.variants[0]?.skuCode).toBe('TSHIRT-RED-M');

    await expect(
      createProduct(store, {
        ctx: admin(WS),
        workspaceId: WS,
        name: 'Empty',
        variants: [],
      })
    ).rejects.toMatchObject({ code: 'CATALOG_VALIDATION' });
  });

  it('blocks duplicate SKU codes with a path to the existing row', async () => {
    const store = new InMemoryCatalogStore();
    const first = await seedProduct(store);
    try {
      await createProduct(store, {
        ctx: admin(WS),
        workspaceId: WS,
        name: 'Dupe',
        variants: [{ skuCode: 'TSHIRT-RED-M', sellingPriceCents: 100 }],
      });
      expect.unreachable();
    } catch (err) {
      const coded = err as { code: string; details?: Record<string, unknown> };
      expect(coded.code).toBe('CATALOG_CONFLICT');
      expect(coded.details?.['existingVariantId']).toBe(first.variants[0]?.id);
      expect(coded.details?.['existingProductId']).toBe(first.product.id);
      expect(coded.details?.['existingPath']).toContain(
        `/api/workspaces/${WS}/catalog/products/${first.product.id}`
      );
    }
    // Intra-request duplicates are also rejected before any write.
    await expect(
      createProduct(store, {
        ctx: admin(WS),
        workspaceId: WS,
        name: 'Dupe2',
        variants: [
          { skuCode: 'SAME-1', sellingPriceCents: 100 },
          { skuCode: 'SAME-1', sellingPriceCents: 200 },
        ],
      })
    ).rejects.toMatchObject({ code: 'CATALOG_CONFLICT' });
    // Nothing persisted on conflict.
    expect(await store.listProducts(WS)).toHaveLength(1);
  });

  it('scopes every read to the workspace', async () => {
    const store = new InMemoryCatalogStore();
    await seedProduct(store);
    const other = admin('ws_other');
    await expect(
      getProductDetail(store, {
        ctx: other,
        workspaceId: 'ws_other',
        productId: 'nope',
      })
    ).rejects.toMatchObject({ code: 'CATALOG_NOT_FOUND' });
    // Same product id from another workspace is invisible (404,
    // indistinguishable from not-found so callers leak nothing).
    const created = await store.listProducts(WS);
    await expect(
      getProductDetail(store, {
        ctx: { ...admin(WS), workspaceId: 'ws_other' },
        workspaceId: 'ws_other',
        productId: created[0]?.id ?? 'missing',
      })
    ).rejects.toMatchObject({ code: 'CATALOG_NOT_FOUND' });
    expect(
      await listProducts(store, { ctx: other, workspaceId: 'ws_other' })
    ).toEqual([]);
  });

  it('enforces SKU code edit rules: Admin only, locked after movements/mappings', async () => {
    const store = new InMemoryCatalogStore();
    const { variants } = await seedProduct(store);
    const variantId = variants[0]?.id ?? '';
    const warehouse = await seedWarehouse(store);

    // Manager may edit price but not the SKU code.
    const asManager = await updateVariant(store, {
      ctx: manager(WS),
      workspaceId: WS,
      variantId,
      sellingPriceCents: 109000,
      expectedVersion: 1,
    });
    expect(asManager.sellingPriceCents).toBe(109000);
    expect(
      await codeOf(
        updateVariant(store, {
          ctx: manager(WS),
          workspaceId: WS,
          variantId,
          skuCode: 'NEW-CODE',
          expectedVersion: asManager.version,
        })
      )
    ).toBe('CATALOG_FORBIDDEN');

    // Admin may rename while pristine.
    const renamed = await updateVariant(store, {
      ctx: admin(WS),
      workspaceId: WS,
      variantId,
      skuCode: 'TSHIRT-RED-M2',
      expectedVersion: asManager.version,
    });
    expect(renamed.skuCode).toBe('TSHIRT-RED-M2');

    // After a stock movement the code locks.
    await adjustStock(store, {
      ctx: admin(WS),
      workspaceId: WS,
      variantId,
      warehouseId: warehouse.id,
      delta: 10,
      reason: 'initial stock',
    });
    expect(
      await codeOf(
        updateVariant(store, {
          ctx: admin(WS),
          workspaceId: WS,
          variantId,
          skuCode: 'TSHIRT-RED-M3',
          expectedVersion: renamed.version,
        })
      )
    ).toBe('CATALOG_SKU_LOCKED');

    // Mappings lock the code too.
    const store2 = new InMemoryCatalogStore();
    const created2 = await seedProduct(store2);
    const v2 = created2.variants[0]?.id ?? '';
    await createMapping(store2, {
      ctx: admin(WS),
      workspaceId: WS,
      variantId: v2,
      channel: 'shopee',
      shopExtId: 'shop_1',
      platformSkuId: 'plat_1',
    });
    expect(
      await codeOf(
        updateVariant(store2, {
          ctx: admin(WS),
          workspaceId: WS,
          variantId: v2,
          skuCode: 'RELOCKED',
          expectedVersion: 1,
        })
      )
    ).toBe('CATALOG_SKU_LOCKED');
  });

  it('detects concurrent edits instead of overwriting', async () => {
    const store = new InMemoryCatalogStore();
    const created = await seedProduct(store);
    const first = await updateProduct(store, {
      ctx: admin(WS),
      workspaceId: WS,
      productId: created.product.id,
      name: 'Kaos Polos v2',
      expectedVersion: 1,
    });
    expect(first.version).toBe(2);
    try {
      await updateProduct(store, {
        ctx: admin(WS),
        workspaceId: WS,
        productId: created.product.id,
        name: 'stale write',
        expectedVersion: 1,
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toMatchObject({
        code: 'CATALOG_VERSION_CONFLICT',
        details: { currentVersion: 2 },
      });
    }
  });

  it('writes adjustments to the ledger; qty needs warehouse + reason', async () => {
    const store = new InMemoryCatalogStore();
    const { variants } = await seedProduct(store);
    const variantId = variants[0]?.id ?? '';
    const warehouse = await seedWarehouse(store);

    const first = await adjustStock(store, {
      ctx: manager(WS),
      workspaceId: WS,
      variantId,
      warehouseId: warehouse.id,
      delta: 25,
      reason: 'initial stock',
    });
    expect(first.level.qty).toBe(25);
    expect(first.entry.balanceAfter).toBe(25);
    expect(first.entry.reason).toBe('initial stock');

    const second = await adjustStock(store, {
      ctx: manager(WS),
      workspaceId: WS,
      variantId,
      warehouseId: warehouse.id,
      delta: -5,
      reason: 'damaged',
      expectedVersion: first.level.version,
    });
    expect(second.level.qty).toBe(20);

    // Missing warehouse / reason / zero delta are rejected.
    await expect(
      adjustStock(store, {
        ctx: manager(WS),
        workspaceId: WS,
        variantId,
        warehouseId: '',
        delta: 1,
        reason: 'x',
      })
    ).rejects.toMatchObject({ code: 'CATALOG_VALIDATION' });
    await expect(
      adjustStock(store, {
        ctx: manager(WS),
        workspaceId: WS,
        variantId,
        warehouseId: warehouse.id,
        delta: 1,
        reason: '  ',
      })
    ).rejects.toMatchObject({ code: 'CATALOG_VALIDATION' });
    await expect(
      adjustStock(store, {
        ctx: manager(WS),
        workspaceId: WS,
        variantId,
        warehouseId: warehouse.id,
        delta: 0,
        reason: 'x',
      })
    ).rejects.toMatchObject({ code: 'CATALOG_VALIDATION' });
    await expect(
      adjustStock(store, {
        ctx: manager(WS),
        workspaceId: WS,
        variantId,
        warehouseId: warehouse.id,
        delta: 1,
        reason: `overlong-${'x'.repeat(500)}`,
      })
    ).rejects.toMatchObject({ code: 'CATALOG_VALIDATION' });

    // Negative balances are rejected; the ledger is newest-first.
    await expect(
      adjustStock(store, {
        ctx: manager(WS),
        workspaceId: WS,
        variantId,
        warehouseId: warehouse.id,
        delta: -100,
        reason: 'oversell',
      })
    ).rejects.toMatchObject({ code: 'CATALOG_INSUFFICIENT_STOCK' });
    const ledger = await getLedger(store, {
      ctx: staff(WS),
      workspaceId: WS,
      variantId,
    });
    expect(ledger.map((e) => e.delta)).toEqual([-5, 25]);
  });

  it('rejects adjustments into deactivated warehouses and out-of-scope writers', async () => {
    const store = new InMemoryCatalogStore();
    const { variants } = await seedProduct(store);
    const variantId = variants[0]?.id ?? '';
    const warehouse = await seedWarehouse(store);
    const deactivated = await updateWarehouse(store, {
      ctx: admin(WS),
      workspaceId: WS,
      warehouseId: warehouse.id,
      status: 'deactivated',
      expectedVersion: 1,
    });
    expect(deactivated.status).toBe('deactivated');
    expect(
      await codeOf(
        adjustStock(store, {
          ctx: manager(WS),
          workspaceId: WS,
          variantId,
          warehouseId: warehouse.id,
          delta: 5,
          reason: 'late delivery',
        })
      )
    ).toBe('CATALOG_WAREHOUSE_INACTIVE');

    // Scoped managers cannot touch another warehouse.
    const other = await createWarehouse(store, {
      ctx: admin(WS),
      workspaceId: WS,
      code: 'SBY-01',
      name: 'Surabaya',
    });
    expect(
      await codeOf(
        adjustStock(store, {
          ctx: scopedManager(WS, warehouse.id),
          workspaceId: WS,
          variantId,
          warehouseId: other.id,
          delta: 5,
          reason: 'cross-warehouse',
        })
      )
    ).toBe('TENANCY_FORBIDDEN');
  });

  it('archives instead of deleting; archive is idempotent', async () => {
    const store = new InMemoryCatalogStore();
    const created = await seedProduct(store);
    const variantId = created.variants[0]?.id ?? '';
    const warehouse = await seedWarehouse(store);
    await adjustStock(store, {
      ctx: admin(WS),
      workspaceId: WS,
      variantId,
      warehouseId: warehouse.id,
      delta: 3,
      reason: 'initial stock',
    });
    const archived = await archiveProduct(store, {
      ctx: manager(WS),
      workspaceId: WS,
      productId: created.product.id,
    });
    expect(archived.status).toBe('archived');
    const detail = await getProductDetail(store, {
      ctx: admin(WS),
      workspaceId: WS,
      productId: created.product.id,
    });
    expect(detail.variants[0]?.variant.status).toBe('archived');
    // History survives the archive.
    expect(
      await getLedger(store, { ctx: admin(WS), workspaceId: WS, variantId })
    ).toHaveLength(1);
    // Second archive is a no-op, and archived variants reject stock.
    await expect(
      archiveProduct(store, {
        ctx: admin(WS),
        workspaceId: WS,
        productId: created.product.id,
      })
    ).resolves.toMatchObject({ status: 'archived' });
    await expect(
      adjustStock(store, {
        ctx: admin(WS),
        workspaceId: WS,
        variantId,
        warehouseId: warehouse.id,
        delta: 1,
        reason: 'after archive',
      })
    ).rejects.toMatchObject({ code: 'CATALOG_VALIDATION' });
    await expect(
      archiveVariant(store, { ctx: admin(WS), workspaceId: WS, variantId })
    ).resolves.toMatchObject({ status: 'archived' });
  });

  it('searches across name, SKU, barcode, store-SKU hint, and listing name', async () => {
    const store = new InMemoryCatalogStore();
    const created = await seedProduct(store);
    const variantId = created.variants[0]?.id ?? '';
    await createMapping(store, {
      ctx: admin(WS),
      workspaceId: WS,
      variantId,
      channel: 'tiktok',
      shopExtId: 'shop_tt_1',
      platformSkuId: 'TTS-ITEM-7788',
      sellerSkuHint: 'SELLER-KAOS-M',
      listingName: 'Kaos Polos Viral TT',
    });
    await createVariant(store, {
      ctx: admin(WS),
      workspaceId: WS,
      productId: created.product.id,
      variant: { skuCode: 'HOODIE-BLK-L', sellingPriceCents: 199000 },
    });

    for (const q of [
      'kaos',
      'tshirt-red',
      '8991234567890',
      'seller-kaos',
      'tts-item-7788',
      'viral tt',
    ]) {
      const hit = await searchCatalog(store, {
        ctx: staff(WS),
        workspaceId: WS,
        q,
      });
      expect(hit.variants.map((v) => v.variant.skuCode)).toContain(
        'TSHIRT-RED-M'
      );
    }
    const miss = await searchCatalog(store, {
      ctx: staff(WS),
      workspaceId: WS,
      q: 'no-such-thing-zzz',
    });
    expect(miss.products).toEqual([]);
    expect(miss.variants).toEqual([]);
  });

  it('rejects duplicate channel mappings and deletes them', async () => {
    const store = new InMemoryCatalogStore();
    const created = await seedProduct(store);
    const variantId = created.variants[0]?.id ?? '';
    const mapping = await createMapping(store, {
      ctx: admin(WS),
      workspaceId: WS,
      variantId,
      channel: 'shopee',
      shopExtId: 'shop_1',
      platformSkuId: 'plat_9',
    });
    await expect(
      createMapping(store, {
        ctx: admin(WS),
        workspaceId: WS,
        variantId,
        channel: 'shopee',
        shopExtId: 'shop_1',
        platformSkuId: 'plat_9',
      })
    ).rejects.toMatchObject({ code: 'CATALOG_CONFLICT' });
    await deleteMapping(store, {
      ctx: manager(WS),
      workspaceId: WS,
      mappingId: mapping.id,
    });
    await expect(
      deleteMapping(store, {
        ctx: manager(WS),
        workspaceId: WS,
        mappingId: mapping.id,
      })
    ).rejects.toMatchObject({ code: 'CATALOG_NOT_FOUND' });
    // Mappings are links, not master data: removing the only mapping
    // un-locks SKU code edits again.
    const renamed = await updateVariant(store, {
      ctx: admin(WS),
      workspaceId: WS,
      variantId,
      skuCode: 'UNLINKED-OK',
      expectedVersion: 1,
    });
    expect(renamed.skuCode).toBe('UNLINKED-OK');
  });

  it('denies staff writes but allows staff reads', async () => {
    const store = new InMemoryCatalogStore();
    await expect(
      createProduct(store, {
        ctx: staff(WS),
        workspaceId: WS,
        name: 'Staff product',
        variants: [{ skuCode: 'STAFF-1', sellingPriceCents: 10 }],
      })
    ).rejects.toMatchObject({ code: 'TENANCY_FORBIDDEN' });
    // Staff reads are fine.
    await seedProduct(store);
    const listed = await listProducts(store, {
      ctx: staff(WS),
      workspaceId: WS,
    });
    expect(listed).toHaveLength(1);
    // UTA-81: adjustments are Manager/Admin writes — Staff is denied.
    const warehouse = await seedWarehouse(store);
    const variants = await store.listVariantsByWorkspace(WS);
    await expect(
      adjustStock(store, {
        ctx: staff(WS),
        workspaceId: WS,
        variantId: variants[0]?.id ?? '',
        warehouseId: warehouse.id,
        delta: 1,
        reason: 'staff attempt',
      })
    ).rejects.toMatchObject({ code: 'TENANCY_FORBIDDEN' });
  });
});

describe('stock ledger + adjustments (Story 05, UTA-81)', () => {
  async function seedVariant(
    store: InMemoryCatalogStore,
    skuCode = 'STORY05-A'
  ) {
    const warehouse = await seedWarehouse(store);
    const { variants } = await seedProduct(store, admin(WS), skuCode);
    return { warehouse, variantId: variants[0]?.id ?? '' };
  }

  it('dedupes retried adjustments by idempotency key (no double-apply)', async () => {
    const store = new InMemoryCatalogStore();
    const { warehouse, variantId } = await seedVariant(store);
    const payload = {
      ctx: manager(WS),
      workspaceId: WS,
      variantId,
      warehouseId: warehouse.id,
      delta: 10,
      reason: 'initial stock',
      idempotencyKey: 'adj-0001',
    };
    const first = await adjustStock(store, payload);
    expect(first.deduplicated).toBeUndefined();
    const retry = await adjustStock(store, payload);
    expect(retry.deduplicated).toBe(true);
    expect(retry.entry.id).toBe(first.entry.id);
    expect(retry.level.qty).toBe(10);
    // Exactly one ledger row — the retry never double-applied.
    expect(await store.countMovements(WS, variantId)).toBe(1);
    expect(
      (await getLedger(store, { ctx: staff(WS), workspaceId: WS, variantId }))
        .length
    ).toBe(1);

    // Reusing the key with a different payload is a 409.
    expect(await codeOf(adjustStock(store, { ...payload, delta: 11 }))).toBe(
      'CATALOG_CONFLICT'
    );
    expect(
      await codeOf(
        adjustStock(store, { ...payload, reason: 'different reason' })
      )
    ).toBe('CATALOG_CONFLICT');
    // Malformed keys are rejected before touching the ledger.
    expect(
      await codeOf(adjustStock(store, { ...payload, idempotencyKey: '  ' }))
    ).toBe('CATALOG_VALIDATION');
    expect(
      await codeOf(
        adjustStock(store, { ...payload, idempotencyKey: 'x'.repeat(129) })
      )
    ).toBe('CATALOG_VALIDATION');
  });

  it('blocks negative stock by default; Admin toggle opts in', async () => {
    const store = new InMemoryCatalogStore();
    const { warehouse, variantId } = await seedVariant(store);

    // Default policy: OFF.
    expect(
      (await getStockSettings(store, { ctx: staff(WS), workspaceId: WS }))
        .allowNegative
    ).toBe(false);
    await expect(
      adjustStock(store, {
        ctx: manager(WS),
        workspaceId: WS,
        variantId,
        warehouseId: warehouse.id,
        delta: -1,
        reason: 'oversell',
      })
    ).rejects.toMatchObject({ code: 'CATALOG_INSUFFICIENT_STOCK' });

    // Manager/Staff cannot flip the toggle.
    expect(
      await codeOf(
        updateStockSettings(store, {
          ctx: manager(WS),
          workspaceId: WS,
          allowNegative: true,
          expectedVersion: 1,
        })
      )
    ).toBe('CATALOG_FORBIDDEN');

    // Admin enables it (CAS-guarded).
    const enabled = await updateStockSettings(store, {
      ctx: admin(WS),
      workspaceId: WS,
      allowNegative: true,
      expectedVersion: 1,
    });
    expect(enabled.allowNegative).toBe(true);
    expect(enabled.version).toBe(2);
    expect(
      await codeOf(
        updateStockSettings(store, {
          ctx: admin(WS),
          workspaceId: WS,
          allowNegative: false,
          expectedVersion: 1,
        })
      )
    ).toBe('CATALOG_VERSION_CONFLICT');

    // Oversell now applies and the ledger records the negative balance.
    const over = await adjustStock(store, {
      ctx: manager(WS),
      workspaceId: WS,
      variantId,
      warehouseId: warehouse.id,
      delta: -3,
      reason: 'oversell allowed',
    });
    expect(over.level.qty).toBe(-3);
    expect(over.entry.balanceAfter).toBe(-3);
  });

  it('reads consolidated + per-warehouse balances for a SKU', async () => {
    const store = new InMemoryCatalogStore();
    const { warehouse: wh1, variantId } = await seedVariant(store);
    const wh2 = await createWarehouse(store, {
      ctx: admin(WS),
      workspaceId: WS,
      code: 'SBY-01',
      name: 'Surabaya',
    });
    await adjustStock(store, {
      ctx: manager(WS),
      workspaceId: WS,
      variantId,
      warehouseId: wh1.id,
      delta: 10,
      reason: 'initial stock',
    });
    await adjustStock(store, {
      ctx: manager(WS),
      workspaceId: WS,
      variantId,
      warehouseId: wh2.id,
      delta: 4,
      reason: 'initial stock',
    });

    const balance = await getStockBalance(store, {
      ctx: staff(WS),
      workspaceId: WS,
      variantId,
    });
    expect(balance.totalQty).toBe(14);
    expect(balance.perWarehouse).toHaveLength(2);
    const byWh = new Map(
      balance.perWarehouse.map((p) => [p.warehouseId, p.qty])
    );
    expect(byWh.get(wh1.id)).toBe(10);
    expect(byWh.get(wh2.id)).toBe(4);

    // Scoped readers see only their warehouse line; the total stays global.
    const scoped = await getStockBalance(store, {
      ctx: staff(WS, wh1.id),
      workspaceId: WS,
      variantId,
    });
    expect(scoped.totalQty).toBe(14);
    expect(scoped.perWarehouse.map((p) => p.warehouseId)).toEqual([wh1.id]);
  });

  it('filters the ledger per warehouse', async () => {
    const store = new InMemoryCatalogStore();
    const { warehouse: wh1, variantId } = await seedVariant(store);
    const wh2 = await createWarehouse(store, {
      ctx: admin(WS),
      workspaceId: WS,
      code: 'BDG-01',
      name: 'Bandung',
    });
    await adjustStock(store, {
      ctx: manager(WS),
      workspaceId: WS,
      variantId,
      warehouseId: wh1.id,
      delta: 5,
      reason: 'jkt stock',
    });
    await adjustStock(store, {
      ctx: manager(WS),
      workspaceId: WS,
      variantId,
      warehouseId: wh2.id,
      delta: 7,
      reason: 'bdg stock',
    });

    const all = await getLedger(store, {
      ctx: staff(WS),
      workspaceId: WS,
      variantId,
    });
    expect(all).toHaveLength(2);
    const jkt = await getLedger(store, {
      ctx: staff(WS),
      workspaceId: WS,
      variantId,
      warehouseId: wh1.id,
    });
    expect(jkt).toHaveLength(1);
    expect(jkt[0]?.reason).toBe('jkt stock');

    // Scoped readers cannot filter by another warehouse.
    expect(
      await codeOf(
        getLedger(store, {
          ctx: staff(WS, wh1.id),
          workspaceId: WS,
          variantId,
          warehouseId: wh2.id,
        })
      )
    ).toBe('TENANCY_FORBIDDEN');
    // Unknown warehouse filter is a 404, not an empty list.
    expect(
      await codeOf(
        getLedger(store, {
          ctx: staff(WS),
          workspaceId: WS,
          variantId,
          warehouseId: 'wh_missing',
        })
      )
    ).toBe('CATALOG_NOT_FOUND');
  });

  it('keeps CAS on adjustments: stale expectedVersion rejects', async () => {
    const store = new InMemoryCatalogStore();
    const { warehouse, variantId } = await seedVariant(store);
    const first = await adjustStock(store, {
      ctx: manager(WS),
      workspaceId: WS,
      variantId,
      warehouseId: warehouse.id,
      delta: 5,
      reason: 'initial stock',
    });
    await adjustStock(store, {
      ctx: manager(WS),
      workspaceId: WS,
      variantId,
      warehouseId: warehouse.id,
      delta: 1,
      reason: 'recount',
    });
    expect(
      await codeOf(
        adjustStock(store, {
          ctx: manager(WS),
          workspaceId: WS,
          variantId,
          warehouseId: warehouse.id,
          delta: 1,
          reason: 'stale write',
          expectedVersion: first.level.version,
        })
      )
    ).toBe('CATALOG_VERSION_CONFLICT');
    // Balances stay consistent with the ledger (CAS losers change nothing).
    const balance = await getStockBalance(store, {
      ctx: manager(WS),
      workspaceId: WS,
      variantId,
    });
    expect(balance.totalQty).toBe(6);
    expect(await store.countMovements(WS, variantId)).toBe(2);
  });
});
