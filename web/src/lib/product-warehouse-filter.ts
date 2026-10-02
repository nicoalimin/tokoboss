import type { ProductView } from '@/lib/catalog-client';

/** True when any variant has a levels[] row for warehouseId (qty may be 0). */
export function productHasWarehouseLevel(
  product: ProductView,
  warehouseId: string
): boolean {
  return (product.variants ?? []).some((v) =>
    (v.levels ?? []).some((l) => l.warehouseId === warehouseId)
  );
}

/** Sum levels qty for warehouseId across all variants of the product. */
export function productQtyForWarehouse(
  product: ProductView,
  warehouseId: string
): number {
  let sum = 0;
  for (const v of product.variants ?? []) {
    for (const l of v.levels ?? []) {
      if (l.warehouseId === warehouseId) sum += l.qty;
    }
  }
  return sum;
}
