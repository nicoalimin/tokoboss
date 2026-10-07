/**
 * Pure low-stock recommendation heuristic (UTA-146 Slice 1b / Story 11).
 * No I/O — caller supplies ledger available qty + optional sales rate.
 * Sales/order domain does not exist yet; null salesRatePerDay = insufficient data.
 * Slice 1e-i: optional in-transit qty and max-stock cap (both default off).
 */

export type LowStockRecommendationInput = {
  variantId: string;
  workspaceId: string;
  skuCode: string;
  productName: string;
  variantName: string | null;
  /** Sum of inventory level qty across warehouses (ledger read model). */
  availableQty: number;
  /** Seller-configured minimum; caller skips variants where this is unset. */
  minStockQty: number;
  leadTimeDays: number | null;
  /** Units sold per day over lookback; null = insufficient sales history. */
  salesRatePerDay: number | null;
  missingSupplier: boolean;
  missingHpp: boolean;
  /** Units already on the way (e.g. open transfers); omitted/negative = 0. */
  inTransitQty?: number;
  /** Seller-configured max stock cap; omitted/null = no cap. */
  maxStockQty?: number | null;
};

export type LowStockRecommendation = {
  variantId: string;
  workspaceId: string;
  skuCode: string;
  productName: string;
  variantName: string | null;
  availableQty: number;
  minStockQty: number;
  leadTimeDays: number | null;
  salesRatePerDay: number | null;
  stockCoverDays: number | null;
  suggestedReorderQty: number;
  explainability: string[];
  missingSupplier: boolean;
  missingHpp: boolean;
};

/** True when available is strictly below the configured minimum. */
export function isBelowMinStock(input: {
  availableQty: number;
  minStockQty: number;
}): boolean {
  return input.availableQty < input.minStockQty;
}

/**
 * Build one recommendation row. Caller must only invoke for variants that
 * pass `isBelowMinStock` (and have a configured minStockQty).
 */
export function buildLowStockRecommendation(
  input: LowStockRecommendationInput
): LowStockRecommendation {
  const { availableQty, minStockQty, leadTimeDays, salesRatePerDay } = input;
  const inTransitQty = Math.max(0, input.inTransitQty ?? 0);
  const maxStockQty = input.maxStockQty ?? null;
  const projectedQty = availableQty + inTransitQty;

  const stockCoverDays =
    salesRatePerDay !== null && salesRatePerDay > 0
      ? availableQty / salesRatePerDay
      : null;

  const gapToMin = Math.max(0, minStockQty - projectedQty);
  let suggestedReorderQty = gapToMin;
  if (
    salesRatePerDay !== null &&
    salesRatePerDay > 0 &&
    leadTimeDays !== null &&
    leadTimeDays > 0
  ) {
    const leadDemand = Math.ceil(salesRatePerDay * leadTimeDays);
    suggestedReorderQty = Math.max(
      suggestedReorderQty,
      Math.max(0, leadDemand - projectedQty)
    );
  }

  let cappedByMax = false;
  if (maxStockQty !== null) {
    const room = Math.max(0, maxStockQty - projectedQty);
    if (suggestedReorderQty > room) {
      suggestedReorderQty = room;
      cappedByMax = true;
    }
  }

  const explainability: string[] = [
    `Stok tersedia dari ledger gudang: ${availableQty} unit`,
    `Ambang minimum SKU: ${minStockQty} unit`,
  ];
  if (salesRatePerDay === null) {
    explainability.push(
      'Belum ada data penjualan yang cukup untuk hitung laju jual'
    );
  } else {
    explainability.push(
      `Laju jual ~${salesRatePerDay} unit/hari (jendela lookback)`
    );
  }
  if (stockCoverDays !== null) {
    explainability.push(
      `Perkiraan hari stok bertahan: ~${Number(stockCoverDays.toFixed(1))} hari`
    );
  }
  if (leadTimeDays !== null) {
    explainability.push(`Lead time pengadaan: ${leadTimeDays} hari`);
  }
  if (inTransitQty > 0) {
    explainability.push(
      `Stok dalam perjalanan: ${inTransitQty} unit — sudah dikurangi dari saran`
    );
  }
  if (cappedByMax) {
    explainability.push(`Saran dibatasi stok maksimum: ${maxStockQty} unit`);
  }
  if (input.missingHpp) {
    explainability.push('HPP belum diisi — tidak dibuat-buat');
  }
  if (input.missingSupplier) {
    explainability.push('Supplier belum diisi — tidak dibuat-buat');
  }

  return {
    variantId: input.variantId,
    workspaceId: input.workspaceId,
    skuCode: input.skuCode,
    productName: input.productName,
    variantName: input.variantName,
    availableQty,
    minStockQty,
    leadTimeDays,
    salesRatePerDay,
    stockCoverDays,
    suggestedReorderQty,
    explainability,
    missingSupplier: input.missingSupplier,
    missingHpp: input.missingHpp,
  };
}
