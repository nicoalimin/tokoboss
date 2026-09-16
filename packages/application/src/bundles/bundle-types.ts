/**
 * Bundle / BOM record vocabulary (UTA-79, Story 13).
 *
 * A bundle is a catalog variant (one SKU TokoBoss) that sells as a
 * composition of component variants. The lines are the BOM: each row maps
 * one bundle variant to one component variant with a positive integer
 * quantity (units of the component per assembled bundle unit).
 *
 * Plain data records exchanged between `@tokoboss/application` use-cases
 * and `CatalogStore` bundle methods (Drizzle/Postgres or in-memory).
 * Wire projections (ISO strings) live in `@tokoboss/contracts`.
 */

/** One BOM line: bundle variant → component variant × qty. */
export interface BundleLineRecord {
  id: string;
  workspaceId: string;
  bundleVariantId: string;
  componentVariantId: string;
  qty: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Caller-supplied BOM line (variant id + quantity). */
export interface NewBundleLineInput {
  componentVariantId: string;
  qty: number;
}

/** Per-warehouse sellable units derived from component on-hand. */
export interface BundleAvailabilityRecord {
  warehouseId: string;
  /** `min(floor(componentQty / requiredQty))` across components. */
  available: number;
}
